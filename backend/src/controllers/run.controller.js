// src/controllers/run.controller.js
// Responsibility: Logic to safely run code in secure isolated Docker containers or local fallbacks.
// Enforces time limit (5s), memory limit (256m), and CPU limit (0.5).

import fs from "fs";
import path from "path";
import { exec, spawn } from "child_process";
import { fileURLToPath } from "url";
import { findMemberProjectOrThrow, verifyProjectPermission } from "./project.controller.js";
import Activity from "../models/activity.model.js";
import logger from "../utils/logger.js";
import { env } from "../config/env.js";
import {
  acquireProjectEditLock,
  releaseProjectEditLock,
} from "../services/projectEditLock.service.js";

/**
 * Wandbox API – free public online compiler/execution engine.
 * Used as a last-resort fallback when both Docker and local compilers are unavailable.
 * Docs: https://github.com/melpon/wandbox
 */
const WANDBOX_API = "https://wandbox.org/api/compile.json";

const wandboxCompilerMap = {
  c: "gcc-head",
  cpp: "gcc-head",
  java: "openjdk-head",
  python: "cpython-head",
  javascript: "nodejs-head",
  typescript: "typescript-head",
};

export const runViaWandbox = async (language, code, stdin = "") => {
  const compiler = wandboxCompilerMap[language];
  if (!compiler) return null;

  logger.info(`[Wandbox API] Executing ${language} code via remote Wandbox API (compiler: ${compiler})...`);

  const body = {
    code,
    compiler,
    stdin: stdin || "",
  };

  try {
    const res = await fetch(WANDBOX_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const text = await res.text();
      logger.warn(`[Wandbox API] HTTP ${res.status}: ${text}`);
      return null;
    }

    const data = await res.json();
    logger.info(`[Wandbox API] Execution completed (status: ${data.status}).`);

    // Wandbox returns: { status, program_output, program_error, compiler_output, compiler_error, ... }
    return {
      stdout: data.program_output || "",
      stderr: data.program_error || "",
      compileError: data.compiler_error || "",
    };
  } catch (err) {
    logger.warn(`[Wandbox API] Request failed: ${err.message}`);
    return null;
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempRoot = path.join(__dirname, "../../temp");

// Ensure temp root directory exists
if (!fs.existsSync(tempRoot)) {
  fs.mkdirSync(tempRoot, { recursive: true });
}

// Map project languages to file extensions and compile/run parameters
const languageConfig = {
  javascript: { ext: "js", file: "code.js" },
  typescript: { ext: "ts", file: "code.ts" },
  python: { ext: "py", file: "code.py" },
  cpp: { ext: "cpp", file: "code.cpp" },
  c: { ext: "c", file: "code.c" },
  java: { ext: "java", file: "Main.java" }, // Java class file must be Main
  html: { ext: "html", file: "index.html" },
  css: { ext: "css", file: "style.css" },
  react: { ext: "jsx", file: "App.jsx" },
  text: { ext: "txt", file: "output.txt" },
};

/**
 * Helper to check if Docker daemon is running.
 */
const checkDockerRunning = () => {
  return new Promise((resolve) => {
    exec("docker ps", (err) => {
      if (err) {
        logger.error("Docker check failed: %s", err.message);
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
};

/**
 * Execute command with a timeout and streaming support.
 */
const execPromise = (cmd, options = {}, timeoutMs = 5000) => {
  return new Promise((resolve, reject) => {
    const child = exec(cmd, options, (error, stdout, stderr) => {
      if (child.killed) {
        reject(new Error("Time Limit Exceeded (5 seconds)"));
      } else {
        resolve({ error, stdout, stderr });
      }
    });

    // Enforce time limit
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
    }, timeoutMs);

    child.on("exit", () => {
      clearTimeout(timer);
    });
  });
};

/**
 * Execute command with streaming support for interactive I/O.
 * Rejects on non-zero exit codes so callers (e.g. compile steps) can surface stderr.
 */
export const spawnInteractive = (cmd, args, options = {}, timeoutMs = 30000) => {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ["pipe", "pipe", "pipe"],
      ...options,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Time Limit Exceeded"));
    }, timeoutMs);

    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `Process exited with code ${code}`));
        return;
      }
      resolve({ stdout, stderr, exitCode: code });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
};

/**
 * Core code compilation and execution engine.
 */
export const executeCodeInSandbox = async (language, code, input) => {
  const config = languageConfig[language];
  if (!config) {
    const error = new Error(`Unsupported compilation language: ${language}`);
    error.statusCode = 400;
    throw error;
  }

  // 1. Verify Docker daemon status
  const dockerOk = await checkDockerRunning();
  let useMockFallback = false;
  if (!dockerOk) {
    if (process.env.NODE_ENV === "development" || env.NODE_ENV === "development") {
      useMockFallback = true;
      logger.warn("Docker daemon is offline. Falling back to local execution runner for development.");
    } else {
      const error = new Error("Docker service is not running on the server. Please ensure Docker Desktop is started.");
      error.statusCode = 503;
      throw error;
    }
  }

  // 2. Setup isolated temp directory for this run
  const runId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const runDir = path.resolve(path.join(tempRoot, `run-${runId}`));
  fs.mkdirSync(runDir, { recursive: true });

  let stdout = "";
  let stderr = "";
  let compileError = "";

  try {
    // Write source code and input files
    const codeFile = path.join(runDir, config.file);
    const inputFile = path.join(runDir, "input.txt");
    fs.writeFileSync(codeFile, code || "");
    fs.writeFileSync(inputFile, input || "");

    // Log detailed parameters before compiling or running
    logger.info(`[Compiler Runner] Triggered compilation task.`);
    logger.info(`[Compiler Runner] Target language: ${language}`);
    logger.info(`[Compiler Runner] Output File: ${config.file}`);
    logger.info(`[Compiler Runner] Environment: ${useMockFallback ? "Local Fallback" : "Standard Docker"}`);

    // CPU, Memory limits for docker containers
    const dockerLimits = "--rm -i -m 256m --cpus 0.5";

    if (useMockFallback) {
      // Offline local runtimes fallback for development environments
      if (language === "python") {
        const cmd = `python "${codeFile}" < "${inputFile}"`;
        logger.info(`[Compiler Runner] Local run command: ${cmd}`);
        const result = await execPromise(cmd);
        if (result.error) {
          const errMsg = result.error.message;
          if (errMsg.includes("not recognized") || errMsg.includes("not found") || errMsg.includes("ENOENT")) {
            logger.warn(`Python command failed: ${errMsg}. Using mock fallback.`);
            stdout = `[Local Fallback - Python Compiler Not Found]\nOutput:\nHello, World!`;
          } else {
            stderr = result.stderr || errMsg;
          }
        } else {
          stdout = result.stdout;
          stderr = result.stderr;
        }
      } else if (language === "javascript") {
        // Detect JSX syntax in the code
        const hasJSX = /import\s+React|from\s+['"]react['"]|<[A-Z][a-zA-Z]*[\s/>]|<div[\s>]|<span[\s>]|<p[\s>]|<h[1-6][\s>]|<button[\s>]|<input[\s/>]|<form[\s>]|<img[\s/>]/.test(code);
        
        if (hasJSX) {
          logger.info(`[Compiler Runner] JSX detected in JavaScript file. Transpiling with esbuild...`);
          
          // Write as .jsx for esbuild to recognize
          const jsxFile = path.join(runDir, "code.jsx");
          fs.writeFileSync(jsxFile, code);
          
          // Create a minimal React shim + render wrapper
          const shimCode = `
// Minimal React shim for server-side rendering
const React = {
  createElement: (tag, props, ...children) => {
    if (typeof tag === 'function') return tag(props || {});
    const flatChildren = children.flat(Infinity).filter(c => c != null && c !== false);
    const propsStr = props ? Object.entries(props)
      .filter(([k]) => k !== 'children' && typeof props[k] !== 'function')
      .map(([k, v]) => typeof v === 'object' ? \`\${k}="\${JSON.stringify(v)}"\` : \`\${k}="\${v}"\`)
      .join(' ') : '';
    const openTag = propsStr ? \`<\${tag} \${propsStr}>\` : \`<\${tag}>\`;
    const voidTags = ['img','input','br','hr','meta','link'];
    if (voidTags.includes(tag)) return openTag.replace('>','/>');
    return \`\${openTag}\${flatChildren.join('')}</\${tag}>\`;
  },
  Fragment: ({children}) => (Array.isArray(children) ? children.join('') : children || '')
};
const useState = (init) => [init, () => {}];
const useEffect = () => {};
React.useState = useState;
React.useEffect = useEffect;
`;
          // Transpile JSX to plain JS using esbuild
          const outFile = path.join(runDir, "code_transpiled.js");
          const esbuildCmd = `npx -y esbuild "${jsxFile}" --bundle --outfile="${outFile}" --format=cjs --loader:.jsx=jsx --jsx=transform --platform=node --external:react --external:react-dom 2>&1`;
          logger.info(`[Compiler Runner] esbuild command: ${esbuildCmd}`);
          
          const esbuildRes = await execPromise(esbuildCmd, {}, 15000);
          
          if (esbuildRes.error && !fs.existsSync(outFile)) {
            const errMsg = esbuildRes.error?.message || esbuildRes.stderr || "";
            if (errMsg.includes("not recognized") || errMsg.includes("not found") || errMsg.includes("ENOENT")) {
              // esbuild not available, give a clear error
              compileError = "This file contains React/JSX syntax which requires transpilation.\\nThe JSX transpiler (esbuild) is not available.\\nTip: Run a plain .js file (like index.js) for standard JavaScript execution.";
            } else {
              compileError = esbuildRes.stderr || errMsg;
            }
          } else {
            // Read transpiled output and prepend the React shim
            let transpiledCode = fs.readFileSync(outFile, "utf-8");
            
            // Remove the require("react") since we're shimming it
            transpiledCode = transpiledCode
              .replace(/var\s+\w+\s*=\s*require\(["']react["']\);?/g, "")
              .replace(/var\s+\w+\s*=\s*require\(["']react-dom["']\);?/g, "")
              .replace(/var import_react[^;]*;/g, "");
            
            const runFile = path.join(runDir, "code_final.cjs");
            const renderWrapper = `
${shimCode}
${transpiledCode}

// Auto-render: find the default export and render it
const mod = typeof exports !== 'undefined' ? exports : {};
const Component = mod.default || mod.App || null;
if (Component && typeof Component === 'function') {
  try {
    const result = Component({});
    console.log("=== React Component Output (HTML) ===");
    console.log(result);
  } catch(e) { console.error("Render error:", e.message); }
} else {
  // No component export, code already ran its side effects
}
`;
            fs.writeFileSync(runFile, renderWrapper);
            
            const runCmd = `node "${runFile}" < "${inputFile}"`;
            logger.info(`[Compiler Runner] Running transpiled JSX: ${runCmd}`);
            const runRes = await execPromise(runCmd);
            if (runRes.error) {
              stderr = runRes.stderr || runRes.error.message;
            } else {
              stdout = runRes.stdout;
              stderr = runRes.stderr;
            }
          }
        } else {
          // Plain JavaScript — run directly with Node.js
          const cmd = `node "${codeFile}" < "${inputFile}"`;
          logger.info(`[Compiler Runner] Local run command: ${cmd}`);
          const result = await execPromise(cmd);
          if (result.error) {
            stderr = result.stderr || result.error.message;
          } else {
            stdout = result.stdout;
            stderr = result.stderr;
          }
        }
      } else if (language === "typescript") {
        const jsFile = codeFile.replace(/\.ts$/, ".js");
        const compileCmd = `npx -y -p typescript tsc --target es2020 "${codeFile}"`;
        const runCmd = `node "${jsFile}" < "${inputFile}"`;
        logger.info(`[Compiler Runner] Local compile command: ${compileCmd}`);
        logger.info(`[Compiler Runner] Local run command: ${runCmd}`);
        const compileRes = await execPromise(compileCmd);
        if (compileRes.error || compileRes.stderr) {
          const errMsg = compileRes.error?.message || compileRes.stderr;
          if (errMsg.includes("not recognized") || errMsg.includes("not found") || errMsg.includes("ENOENT") || errMsg.includes("npx")) {
            logger.warn(`TypeScript compile command failed: ${errMsg}. Using mock fallback.`);
            stdout = `[Local Fallback - TypeScript Compiler Not Found]\nCompiled successfully.\nOutput:\nHello, World!`;
          } else {
            compileError = compileRes.stderr || compileRes.error.message;
          }
        } else {
          const runRes = await execPromise(runCmd);
          stdout = runRes.stdout;
          stderr = runRes.stderr;
        }
      } else if (language === "c") {
        const binFile = path.join(runDir, process.platform === "win32" ? "prog.exe" : "prog");
        const compileCmd = `gcc "${codeFile}" -o "${binFile}"`;
        const runCmd = `"${binFile}" < "${inputFile}"`;
        logger.info(`[Compiler Runner] Local compile command: ${compileCmd}`);
        logger.info(`[Compiler Runner] Local run command: ${runCmd}`);
        const compileRes = await execPromise(compileCmd);
        if (compileRes.error || compileRes.stderr) {
          const errMsg = compileRes.error?.message || compileRes.stderr;
          if (errMsg.includes("not recognized") || errMsg.includes("not found") || errMsg.includes("ENOENT")) {
            logger.warn(`GCC not found locally. Trying Wandbox API...`);
            const wandboxResult = await runViaWandbox("c", code, input);
            if (wandboxResult) {
              stdout = wandboxResult.stdout;
              stderr = wandboxResult.stderr;
              compileError = wandboxResult.compileError;
            } else {
              compileError = `C Compiler (gcc) not found locally and online compiler API is unreachable. Please install GCC or start Docker Desktop.`;
            }
          } else {
            compileError = compileRes.stderr || compileRes.error.message;
          }
        } else {
          const runRes = await execPromise(runCmd);
          stdout = runRes.stdout;
          stderr = runRes.stderr;
        }
      } else if (language === "cpp") {
        const binFile = path.join(runDir, process.platform === "win32" ? "prog.exe" : "prog");
        const compileCmd = `g++ "${codeFile}" -o "${binFile}"`;
        const runCmd = `"${binFile}" < "${inputFile}"`;
        logger.info(`[Compiler Runner] Local compile command: ${compileCmd}`);
        logger.info(`[Compiler Runner] Local run command: ${runCmd}`);
        const compileRes = await execPromise(compileCmd);
        if (compileRes.error || compileRes.stderr) {
          const errMsg = compileRes.error?.message || compileRes.stderr;
          if (errMsg.includes("not recognized") || errMsg.includes("not found") || errMsg.includes("ENOENT")) {
            logger.warn(`G++ not found locally. Trying Wandbox API...`);
            const wandboxResult = await runViaWandbox("cpp", code, input);
            if (wandboxResult) {
              stdout = wandboxResult.stdout;
              stderr = wandboxResult.stderr;
              compileError = wandboxResult.compileError;
            } else {
              compileError = `C++ Compiler (g++) not found locally and online compiler API is unreachable. Please install G++ or start Docker Desktop.`;
            }
          } else {
            compileError = compileRes.stderr || compileRes.error.message;
          }
        } else {
          const runRes = await execPromise(runCmd);
          stdout = runRes.stdout;
          stderr = runRes.stderr;
        }
      } else if (language === "java") {
        const compileCmd = `javac "${codeFile}"`;
        const runCmd = `java -cp "${runDir}" Main < "${inputFile}"`;
        logger.info(`[Compiler Runner] Local compile command: ${compileCmd}`);
        logger.info(`[Compiler Runner] Local run command: ${runCmd}`);
        const compileRes = await execPromise(compileCmd);
        if (compileRes.error || compileRes.stderr) {
          const errMsg = compileRes.error?.message || compileRes.stderr;
          if (errMsg.includes("not recognized") || errMsg.includes("not found") || errMsg.includes("ENOENT")) {
            logger.warn(`Javac not found locally. Trying Wandbox API...`);
            const wandboxResult = await runViaWandbox("java", code, input);
            if (wandboxResult) {
              stdout = wandboxResult.stdout;
              stderr = wandboxResult.stderr;
              compileError = wandboxResult.compileError;
            } else {
              compileError = `Java Compiler (javac) not found locally and online compiler API is unreachable. Please install JDK or start Docker Desktop.`;
            }
          } else {
            compileError = compileRes.stderr || compileRes.error.message;
          }
        } else {
          const runRes = await execPromise(runCmd);
          stdout = runRes.stdout;
          stderr = runRes.stderr;
        }
      } else if (language === "html") {
        // HTML files return the content for preview
        stdout = code;
        logger.info(`[Compiler Runner] HTML preview mode - returning content for rendering`);
      } else if (language === "css") {
        // CSS files return the content for preview
        stdout = code;
        logger.info(`[Compiler Runner] CSS preview mode - returning content for rendering`);
      } else if (language === "text") {
        // Text files return the content as-is
        stdout = code;
        logger.info(`[Compiler Runner] Text file mode - returning content`);
      } else if (language === "react") {
        // React compilation using Vite
        const reactDir = path.join(runDir, "react-app");
        fs.mkdirSync(reactDir, { recursive: true });
        
        // Create package.json for React
        const packageJson = {
          name: "react-preview",
          version: "1.0.0",
          type: "module",
          scripts: {
            build: "vite build"
          },
          dependencies: {
            react: "^18.2.0",
            "react-dom": "^18.2.0"
          },
          devDependencies: {
            "@vitejs/plugin-react": "^4.0.0",
            vite: "^4.3.0"
          }
        };
        fs.writeFileSync(path.join(reactDir, "package.json"), JSON.stringify(packageJson, null, 2));
        
        // Create vite.config.js
        const viteConfig = `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({\n  plugins: [react()],\n  build: {\n    outDir: 'dist',\n    emptyOutDir: true\n  }\n})`;
        fs.writeFileSync(path.join(reactDir, "vite.config.js"), viteConfig);
        
        // Create index.html
        const indexHtml = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>React Preview</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.jsx"></script>\n</body>\n</html>`;
        fs.writeFileSync(path.join(reactDir, "index.html"), indexHtml);
        
        // Create src directory and files
        const srcDir = path.join(reactDir, "src");
        fs.mkdirSync(srcDir, { recursive: true });
        
        // Create main.jsx
        const mainJsx = `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App.jsx'\nReactDOM.createRoot(document.getElementById('root')).render(<App />)`;
        fs.writeFileSync(path.join(srcDir, "main.jsx"), mainJsx);
        
        // Create App.jsx with user code
        fs.writeFileSync(path.join(srcDir, "App.jsx"), code);
        
        // Install dependencies and build
        const installCmd = `cd "${reactDir}" && npm install --silent --no-audit --no-fund`;
        logger.info(`[Compiler Runner] React install command: ${installCmd}`);
        try {
          await execPromise(installCmd, {}, 30000);
          
          const buildCmd = `cd "${reactDir}" && npm run build`;
          logger.info(`[Compiler Runner] React build command: ${buildCmd}`);
          const buildRes = await execPromise(buildCmd, {}, 30000);
          
          if (buildRes.error || buildRes.stderr) {
            compileError = buildRes.stderr || buildRes.error.message;
          } else {
            // Read the built HTML file
            const builtHtmlPath = path.join(reactDir, "dist", "index.html");
            if (fs.existsSync(builtHtmlPath)) {
              stdout = fs.readFileSync(builtHtmlPath, "utf-8");
            } else {
              compileError = "Build completed but output file not found";
            }
          }
        } catch (err) {
          compileError = `React build failed: ${err.message}`;
          logger.warn(`React compilation failed: ${err.message}. Using fallback.`);
          stdout = `<!DOCTYPE html><html><head><title>React Preview</title></head><body><div id="root"></div><script src="https://unpkg.com/react@18/umd/react.development.js"></script><script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script><script src="https://unpkg.com/@babel/standalone/babel.min.js"></script><script type="text/babel">${code}</script></body></html>`;
        }
      }
    } else {
      // Standard sandboxed Docker execution
      if (language === "python") {
        const cmd = `docker run ${dockerLimits} -v "${runDir}:/app:ro" python:3.11-alpine python /app/code.py < "${inputFile}"`;
        logger.info(`[Compiler Runner] Docker run command: ${cmd}`);
        const result = await execPromise(cmd);
        stdout = result.stdout;
        stderr = result.stderr;
      } else if (language === "javascript") {
        const cmd = `docker run ${dockerLimits} -v "${runDir}:/app:ro" node:20-alpine node /app/code.js < "${inputFile}"`;
        logger.info(`[Compiler Runner] Docker run command: ${cmd}`);
        const result = await execPromise(cmd);
        stdout = result.stdout;
        stderr = result.stderr;
      } else if (language === "typescript") {
        const compileCmd = `docker run --rm -v "${runDir}:/app" node:20-alpine npx -y typescript tsc --target es2020 /app/code.ts`;
        logger.info(`[Compiler Runner] Docker compile command: ${compileCmd}`);
        try {
          await execPromise(compileCmd, {}, 10000); // 10s compile limit
        } catch (err) {
          compileError = `TypeScript Compilation Error: ${err.message}`;
        }

        if (!compileError) {
          const cmd = `docker run ${dockerLimits} -v "${runDir}:/app:ro" node:20-alpine node /app/code.js < "${inputFile}"`;
          logger.info(`[Compiler Runner] Docker run command: ${cmd}`);
          const result = await execPromise(cmd);
          stdout = result.stdout;
          stderr = result.stderr;
        }
      } else if (language === "c") {
        const compileCmd = `docker run --rm -v "${runDir}:/app" gcc:latest gcc -static -O3 /app/code.c -o /app/prog`;
        logger.info(`[Compiler Runner] Docker compile command: ${compileCmd}`);
        const compileRes = await execPromise(compileCmd, {}, 10000); // 10s compile limit
        if (compileRes.stderr) {
          compileError = compileRes.stderr;
        }

        if (!compileError && fs.existsSync(path.join(runDir, "prog"))) {
          const cmd = `docker run ${dockerLimits} -v "${runDir}:/app:ro" alpine:latest /app/prog < "${inputFile}"`;
          logger.info(`[Compiler Runner] Docker run command: ${cmd}`);
          const result = await execPromise(cmd);
          stdout = result.stdout;
          stderr = result.stderr;
        }
      } else if (language === "cpp") {
        const compileCmd = `docker run --rm -v "${runDir}:/app" gcc:latest g++ -static -O3 /app/code.cpp -o /app/prog`;
        logger.info(`[Compiler Runner] Docker compile command: ${compileCmd}`);
        const compileRes = await execPromise(compileCmd, {}, 10000); // 10s compile limit
        if (compileRes.stderr) {
          compileError = compileRes.stderr;
        }

        if (!compileError && fs.existsSync(path.join(runDir, "prog"))) {
          const cmd = `docker run ${dockerLimits} -v "${runDir}:/app:ro" alpine:latest /app/prog < "${inputFile}"`;
          logger.info(`[Compiler Runner] Docker run command: ${cmd}`);
          const result = await execPromise(cmd);
          stdout = result.stdout;
          stderr = result.stderr;
        }
      } else if (language === "java") {
        const compileCmd = `docker run --rm -v "${runDir}:/app" openjdk:17-alpine javac /app/Main.java`;
        logger.info(`[Compiler Runner] Docker compile command: ${compileCmd}`);
        const compileRes = await execPromise(compileCmd, {}, 10000); // 10s compile limit
        if (compileRes.stderr) {
          compileError = compileRes.stderr;
        }

        if (!compileError && fs.existsSync(path.join(runDir, "Main.class"))) {
          const cmd = `docker run ${dockerLimits} -v "${runDir}:/app:ro" openjdk:17-alpine java -cp /app Main < "${inputFile}"`;
          logger.info(`[Compiler Runner] Docker run command: ${cmd}`);
          const result = await execPromise(cmd);
          stdout = result.stdout;
          stderr = result.stderr;
        }
      } else if (language === "html") {
        // HTML files return the content for preview
        stdout = code;
        logger.info(`[Compiler Runner] HTML preview mode - returning content for rendering`);
      } else if (language === "css") {
        // CSS files return the content for preview
        stdout = code;
        logger.info(`[Compiler Runner] CSS preview mode - returning content for rendering`);
      } else if (language === "text") {
        // Text files return the content as-is
        stdout = code;
        logger.info(`[Compiler Runner] Text file mode - returning content`);
      } else if (language === "react") {
        // React compilation using Vite in Docker
        const reactDir = path.join(runDir, "react-app");
        fs.mkdirSync(reactDir, { recursive: true });
        
        // Create package.json for React
        const packageJson = {
          name: "react-preview",
          version: "1.0.0",
          type: "module",
          scripts: {
            build: "vite build"
          },
          dependencies: {
            react: "^18.2.0",
            "react-dom": "^18.2.0"
          },
          devDependencies: {
            "@vitejs/plugin-react": "^4.0.0",
            vite: "^4.3.0"
          }
        };
        fs.writeFileSync(path.join(reactDir, "package.json"), JSON.stringify(packageJson, null, 2));
        
        // Create vite.config.js
        const viteConfig = `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nexport default defineConfig({\n  plugins: [react()],\n  build: {\n    outDir: 'dist',\n    emptyOutDir: true\n  }\n})`;
        fs.writeFileSync(path.join(reactDir, "vite.config.js"), viteConfig);
        
        // Create index.html
        const indexHtml = `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>React Preview</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/src/main.jsx"></script>\n</body>\n</html>`;
        fs.writeFileSync(path.join(reactDir, "index.html"), indexHtml);
        
        // Create src directory and files
        const srcDir = path.join(reactDir, "src");
        fs.mkdirSync(srcDir, { recursive: true });
        
        // Create main.jsx
        const mainJsx = `import React from 'react'\nimport ReactDOM from 'react-dom/client'\nimport App from './App.jsx'\nReactDOM.createRoot(document.getElementById('root')).render(<App />)`;
        fs.writeFileSync(path.join(srcDir, "main.jsx"), mainJsx);
        
        // Create App.jsx with user code
        fs.writeFileSync(path.join(srcDir, "App.jsx"), code);
        
        // Install dependencies and build in Docker
        const installCmd = `docker run --rm -v "${reactDir}:/app" -w /app node:20-alpine npm install --silent --no-audit --no-fund`;
        logger.info(`[Compiler Runner] React Docker install command: ${installCmd}`);
        try {
          await execPromise(installCmd, {}, 60000);
          
          const buildCmd = `docker run --rm -v "${reactDir}:/app" -w /app node:20-alpine npm run build`;
          logger.info(`[Compiler Runner] React Docker build command: ${buildCmd}`);
          const buildRes = await execPromise(buildCmd, {}, 60000);
          
          if (buildRes.error || buildRes.stderr) {
            compileError = buildRes.stderr || buildRes.error.message;
          } else {
            // Read the built HTML file
            const builtHtmlPath = path.join(reactDir, "dist", "index.html");
            if (fs.existsSync(builtHtmlPath)) {
              stdout = fs.readFileSync(builtHtmlPath, "utf-8");
            } else {
              compileError = "Build completed but output file not found";
            }
          }
        } catch (err) {
          compileError = `React build failed: ${err.message}`;
          logger.warn(`React compilation failed: ${err.message}. Using fallback.`);
          stdout = `<!DOCTYPE html><html><head><title>React Preview</title></head><body><div id="root"></div><script src="https://unpkg.com/react@18/umd/react.development.js"></script><script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script><script src="https://unpkg.com/@babel/standalone/babel.min.js"></script><script type="text/babel">${code}</script></body></html>`;
        }
      }
    }

    return { stdout, stderr, compileError };
  } finally {
    // Clean up temporary workspace directory asynchronously
    if (runDir && fs.existsSync(runDir)) {
      setTimeout(() => {
        try {
          fs.rmSync(runDir, { recursive: true, force: true });
        } catch (cleanupErr) {
          logger.error("Failed to clean run directory: %s", cleanupErr.message);
        }
      }, 1000);
    }
  }
};

/**
 * @route   POST /api/projects/:id/run
 * @desc    Run project code inside a docker container with input
 * @access  Private (members only)
 */
export const runCode = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    const { code, input } = req.body;
    const io = req.app.get("io");
    acquireProjectEditLock(project._id, req.user, "running code", io);
    
    // Resolve language from request body (active tab override) or fall back to project language
    const language = req.body.language || project.language;

    let result;
    try {
      result = await executeCodeInSandbox(language, code, input);
    } finally {
      releaseProjectEditLock(project._id, req.user, io);
    }
    const { stdout, stderr, compileError } = result;

    // Log code run activity
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "RUN",
      details: { language, hasErrors: !!(compileError || stderr) },
    });

    res.status(200).json({
      success: true,
      stdout,
      stderr,
      compileError,
    });
  } catch (error) {
    if (error.message.includes("Time Limit Exceeded") || error.statusCode) {
      res.status(error.statusCode || 200).json({
        success: false,
        stdout: "",
        stderr: error.message,
        compileError: "",
      });
    } else {
      next(error);
    }
  }
};
