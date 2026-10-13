// src/services/projectRunner.service.js
// Responsibility: Manage active development servers, allocate unique ports,
// execute dependency installations, capture logs, and handle server lifecycles.

import fs from "fs";
import path from "path";
import net from "net";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import Project from "../models/project.model.js";
import FileNode from "../models/file.model.js";
import { env } from "../config/env.js";
import { detectAndSaveProjectType } from "./projectDetector.service.js";
import logger from "../utils/logger.js";
import { releaseProjectEditLock } from "./projectEditLock.service.js";
import { runReactSandboxCommand, startReactSandbox, stopReactSandbox, isDockerAvailable } from "./sandboxService.js";
import { resolveProjectPath } from "../utils/projectPath.js";
import { allocatePortForProject, releaseProjectPort } from "./portManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const tempRoot = path.join(__dirname, "../../temp/projects");

if (!fs.existsSync(tempRoot)) {
  fs.mkdirSync(tempRoot, { recursive: true });
}

// In-Memory registry of active running dev servers:
// projectId -> { process, port, status, logs: Array<string>, projectDir: string }
const activeServers = new Map();

// In-Memory lock of active dependency installation processes:
// projectId -> Promise<boolean>
// Prevents concurrent duplicate npm install runs for the same project.
const activeInstallations = new Map();

export const isInstallingDependencies = (projectId) => {
  if (!projectId) return false;
  return activeInstallations.has(projectId.toString());
};

/**
 * Accurately detects whether project dependencies are actually installed on disk.
 * Distinguishes between package.json existing vs node_modules binaries actually present.
 *
 * @param {string} projectDir - Absolute path to project workspace directory
 * @param {string} [projectType] - Project type (e.g. "react-vite", "react")
 * @returns {boolean}
 */
export const areDependenciesInstalled = (projectDir, projectType = null) => {
  if (!projectDir || !fs.existsSync(projectDir)) return false;

  const pkgJsonPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) return false;

  let pkg = {};
  try {
    const pkgContent = fs.readFileSync(pkgJsonPath, "utf-8");
    pkg = JSON.parse(pkgContent);
  } catch {
    pkg = {};
  }

  const hasDeps = Boolean(
    (pkg.dependencies && Object.keys(pkg.dependencies).length > 0) ||
    (pkg.devDependencies && Object.keys(pkg.devDependencies).length > 0)
  );

  // If no dependencies or devDependencies are declared in package.json, dependencies are satisfied
  if (!hasDeps) {
    return true;
  }

  const nodeModulesPath = path.join(projectDir, "node_modules");
  if (!fs.existsSync(nodeModulesPath)) return false;

  const isWin = process.platform === "win32";
  const binDir = path.join(nodeModulesPath, ".bin");

  // Determine if project relies on Vite
  let isVite = projectType === "react-vite" || projectType === "react";
  if (!isVite) {
    isVite = Boolean(
      pkg.dependencies?.vite ||
      pkg.devDependencies?.vite ||
      pkg.scripts?.dev?.includes("vite") ||
      pkg.scripts?.build?.includes("vite")
    );
  }

  if (isVite) {
    const viteBin = path.join(binDir, isWin ? "vite.cmd" : "vite");
    const vitePkg = path.join(nodeModulesPath, "vite", "package.json");
    const reactPkg = path.join(nodeModulesPath, "react", "package.json");
    const hasVite = fs.existsSync(viteBin) || fs.existsSync(vitePkg);
    const hasReact = fs.existsSync(reactPkg);
    return hasVite && (hasReact || fs.existsSync(vitePkg));
  }

  // General Node.js projects: verify non-empty node_modules
  try {
    const entries = fs.readdirSync(nodeModulesPath);
    const validEntries = entries.filter((e) => !e.startsWith("."));
    return validEntries.length > 0;
  } catch {
    return false;
  }
};

export const getActiveProjectPort = (projectId) => {
  if (!projectId) return null;
  const server = activeServers.get(projectId.toString());
  return server ? server.port : null;
};

/**
 * Builds a cross-platform execution environment ensuring local project binaries
 * (node_modules/.bin) take precedence, system PATH is preserved, and standard UNIX
 * directories (/usr/local/bin:/usr/bin:/bin) exist on Linux/Docker.
 */
export const getProjectExecutionEnv = (projectDir, extraEnv = {}) => {
  const isWindows = process.platform === "win32";
  const systemPath = process.env.PATH || process.env.Path || "";
  const localBin = path.join(projectDir, "node_modules", ".bin");
  const nodeBinDir = path.dirname(process.execPath);
  const fallbackPaths = isWindows
    ? []
    : ["/usr/local/bin", "/usr/bin", "/bin", "/usr/local/sbin", "/usr/sbin", "/sbin"];

  const pathParts = [localBin, nodeBinDir, systemPath, ...fallbackPaths].filter(Boolean);
  const combinedPath = pathParts.join(path.delimiter);

  return {
    ...process.env,
    PATH: combinedPath,
    Path: combinedPath,
    NODE_ENV: extraEnv.NODE_ENV || "development",
    npm_config_production: "false",
    FORCE_COLOR: "true",
    ...extraEnv,
  };
};

/**
 * Checks that Node.js and npm are present and runnable in the host environment.
 */
export const verifyNodeAndNpm = async (projectDir = process.cwd()) => {
  const nodeVersion = process.version;
  const isWindows = process.platform === "win32";
  const shellCmd = isWindows ? "cmd.exe" : "sh";
  const args = isWindows ? ["/c", "npm --version"] : ["-c", "npm --version"];

  return new Promise((resolve) => {
    let output = "";
    let errorOutput = "";
    const child = spawn(shellCmd, args, {
      cwd: projectDir,
      env: getProjectExecutionEnv(projectDir),
      windowsHide: true,
    });

    child.stdout?.on("data", (d) => { output += d.toString(); });
    child.stderr?.on("data", (d) => { errorOutput += d.toString(); });

    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      resolve({ available: false, nodeVersion, error: "npm --version check timed out after 10s" });
    }, 10_000);

    child.on("exit", (code) => {
      clearTimeout(timer);
      const npmVer = output.trim();
      if (code === 0 && npmVer) {
        resolve({ available: true, nodeVersion, npmVersion: npmVer });
      } else {
        resolve({ available: false, nodeVersion, error: errorOutput.trim() || `npm exited with code ${code}` });
      }
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ available: false, nodeVersion, error: err.message });
    });
  });
};

const getWorkspaceFilePath = async (file) => {
  const project = await Project.findById(file.project).select("owner");
  if (!project) throw new Error("Project not found for file sync");

  const pathParts = [];
  let current = file;
  while (current) {
    pathParts.unshift(current.name);
    if (!current.parentId) break;
    current = await FileNode.findOne({ _id: current.parentId, project: file.project }).select("name parentId");
  }

  const projectRoot = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), file.project.toString());
  const filePath = path.resolve(projectRoot, ...(file.relativePath ? [file.relativePath] : pathParts));
  const relativePath = path.relative(projectRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("File path escapes project workspace");
  }

  return filePath;
};

/** Write the latest browser edit to the user's local project workspace. */
export const syncFileNodeToWorkspace = async (fileId, content) => {
  const file = await FileNode.findById(fileId);
  if (!file || file.isFolder) return;

  const filePath = await getWorkspaceFilePath(file);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content || "", "utf-8");
};

const TERMINAL_COMMAND_TIMEOUT_MS = 120_000;
const TERMINAL_OUTPUT_LIMIT = 100_000;
const ALLOWED_TERMINAL_COMMANDS = new Set([
  "npm",
  "npx",
  "node",
  "python",
  "python3",
  "pip",
  "pip3",
  "git",
  "dir",
  "ls",
  "type",
  "cat",
  "echo",
  "mkdir",
  "md",
  "vite",
  "tsc",
  "jest",
  "vitest",
  "pytest",
  "java",
  "javac",
  "gcc",
  "g++",
  "make",
]);

const terminalValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const validateTerminalCommand = (command) => {
  const trimmedCommand = (command || "").trim();
  if (!trimmedCommand) {
    throw terminalValidationError("Enter a command to run.");
  }
  if (trimmedCommand.length > 1_000) {
    throw terminalValidationError("Commands must be 1,000 characters or fewer.");
  }

  // A project terminal should run development commands, not expose shell
  // chaining, redirection, or a second unrestricted shell on the host.
  if (/[\r\n;&|`$<>]/.test(trimmedCommand)) {
    throw terminalValidationError("Command chaining, redirection, and shell expansion are not supported.");
  }

  const executable = trimmedCommand.split(/\s+/)[0].toLowerCase();
  if (!ALLOWED_TERMINAL_COMMANDS.has(executable)) {
    throw terminalValidationError(
      `"${executable}" is not available in the project terminal. Use a development command such as npm, node, python, git, or npx.`
    );
  }

  return trimmedCommand;
};

/**
 * Runs one development command in the current project's isolated working
 * directory. Commands are deliberately bounded in duration and output so a
 * browser request cannot leave an unbounded host process behind.
 */
export const runProjectTerminalCommand = async (projectId, command, io = null) => {
  const safeCommand = validateTerminalCommand(command);
  const projectDir = await syncProjectFilesToDisk(projectId);
  const project = await Project.findById(projectId).select("projectType");

  // If command requires build or dev tools (e.g. npm run build, vite), verify dependencies first
  const isViteOrBuildCmd = /^npm\s+run\s+(build|dev|preview)/i.test(safeCommand) || /^vite\b/i.test(safeCommand);
  if (isViteOrBuildCmd && !areDependenciesInstalled(projectDir, project?.projectType)) {
    appendAndBroadcastLog(projectId, "⚙ Dependencies not detected. Installing dependencies before running command...", io);
    const installed = await installDependencies(projectId, io);
    if (!installed || !areDependenciesInstalled(projectDir, project?.projectType)) {
      const errorMsg = "Dependencies are not installed. Please click Install or run 'npm install' first.";
      appendAndBroadcastLog(projectId, `❌ [TERMINAL] ${errorMsg}`, io);
      return {
        exitCode: 1,
        output: `\n${errorMsg}\n`,
        timedOut: false,
        truncated: false,
      };
    }
  }

  if (project?.projectType === "react-vite") {
    const args = safeCommand.split(/\s+/);
    try {
      const res = await runReactSandboxCommand(projectId, args, { installIfMissing: true });
      if (io && res.output) appendAndBroadcastLog(projectId, res.output, io);
      return res;
    } catch (error) {
      logger.info(`Docker unavailable for terminal command on project ${projectId} (${error.message}). Falling back to native execution.`);
    }
  }

  return new Promise((resolve, reject) => {
    const isWindows = process.platform === "win32";
    const shellCommand = isWindows ? "cmd.exe" : "sh";
    const shellArgs = isWindows ? ["/d", "/s", "/c", safeCommand] : ["-c", safeCommand];
    const execEnv = getProjectExecutionEnv(projectDir);

    logger.info(`[REACT RUNTIME] Executing command for project ${projectId}:\n` +
      `  projectId: ${projectId}\n` +
      `  projectPath: ${projectDir}\n` +
      `  workingDirectory: ${projectDir}\n` +
      `  command: ${safeCommand}\n` +
      `  shell: ${shellCommand}\n` +
      `  node: ${process.version}`
    );

    const child = spawn(shellCommand, shellArgs, {
      cwd: projectDir,
      env: execEnv,
      windowsHide: true,
    });

    let output = "";
    let timedOut = false;
    let settled = false;
    const appendOutput = (chunk) => {
      if (output.length < TERMINAL_OUTPUT_LIMIT) {
        output += chunk.toString().slice(0, TERMINAL_OUTPUT_LIMIT - output.length);
      }
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ ...result, output });
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      if (isWindows) {
        spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], { windowsHide: true });
      } else {
        child.kill("SIGTERM");
      }
    }, TERMINAL_COMMAND_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      appendOutput(chunk);
      if (io) appendAndBroadcastLog(projectId, chunk.toString(), io);
    });
    child.stderr.on("data", (chunk) => {
      appendOutput(chunk);
      if (io) appendAndBroadcastLog(projectId, chunk.toString(), io);
    });
    child.on("error", (error) => {
      logger.error(`[REACT RUNTIME] Command execution failed: ${error.message} (code: ${error.code || "UNKNOWN"})`);
      appendAndBroadcastLog(projectId, `❌ Command spawn error: ${error.message}`, io);
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
      if (exitCode === 127) {
        const errorMsg = `Command "${safeCommand}" failed with exit code 127 (command not found). Ensure required executables (like vite or npm) exist and are installed.`;
        logger.error(`[REACT RUNTIME] Exit code 127 in project ${projectId}: ${errorMsg}`);
        appendAndBroadcastLog(projectId, `❌ ${errorMsg}`, io);
      }
      finish({
        exitCode: exitCode ?? 1,
        timedOut,
        truncated: output.length >= TERMINAL_OUTPUT_LIMIT,
      });
    });
  });
};

/**
 * Finds an available open TCP port starting from a preferred port number.
 * @param {number} startPort 
 * @returns {Promise<number>}
 */
export const findAvailablePort = (startPort = 5173) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, "127.0.0.1", () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
};

/**
 * Polls a TCP port until a server starts accepting socket connections.
 * @param {number} port
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
export const waitForPortOpen = (port, timeoutMs = 15000) => {
  const startTime = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const socket = new net.Socket();
      socket.setTimeout(500);
      socket.on("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - startTime > timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 300);
        }
      });
      socket.on("timeout", () => {
        socket.destroy();
        if (Date.now() - startTime > timeoutMs) {
          resolve(false);
        } else {
          setTimeout(check, 300);
        }
      });
      socket.connect(port, "127.0.0.1");
    };
    check();
  });
};

/**
 * Writes all MongoDB project FileNode documents to the persistent physical directory on disk for execution.
 * @param {string} projectId 
 * @returns {Promise<string>} - Absolute path of created project directory
 */
export const syncProjectFilesToDisk = async (projectId) => {
  const project = await Project.findById(projectId).select("owner");
  if (!project) throw new Error("Project not found");
  
  const projectDir = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), projectId.toString());

  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const files = await FileNode.find({ project: projectId, isDeleted: false });

  const fileMap = new Map(files.map((f) => [f._id.toString(), f]));
  const getRelativePath = (f) => {
    if (f.relativePath) return f.relativePath;
    const parts = [f.name];
    let curr = f;
    while (curr.parentId && fileMap.has(curr.parentId.toString())) {
      curr = fileMap.get(curr.parentId.toString());
      parts.unshift(curr.name);
    }
    return parts.join("/");
  };

  // 1. Create folders first
  const folders = files.filter((f) => f.isFolder);
  for (const folder of folders) {
    const relPath = getRelativePath(folder);
    const folderPath = resolveProjectPath(projectDir, relPath);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  }

  // 2. Write file contents
  const codeFiles = files.filter((f) => !f.isFolder);
  for (const file of codeFiles) {
    const relPath = getRelativePath(file);
    const filePath = resolveProjectPath(projectDir, relPath);
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
    fs.writeFileSync(filePath, file.content || "", "utf-8");
  }

  return projectDir;
};

/**
 * Appends a terminal log line and broadcasts it over Socket.IO room.
 */
export const appendAndBroadcastLog = (projectId, logLine, io = null) => {
  const server = activeServers.get(projectId);
  if (server) {
    server.logs.push(logLine);
    if (server.logs.length > 500) server.logs.shift(); // Cap log buffer
  }

  if (io) {
    io.to(`project:${projectId}`).emit("project-terminal-log", {
      projectId,
      log: logLine,
      timestamp: new Date().toISOString(),
    });
  }
};

/**
 * Updates project status in MongoDB & broadcasts to Socket room.
 */
const formatPreviewUrl = (projectId, port) => {
  if (!port || !projectId) return null;
  return `/preview/${projectId}/`;
};

const updateServerStatus = async (projectId, status, port = null, io = null, containerId = null) => {
  await Project.findByIdAndUpdate(projectId, {
    serverStatus: status,
    devServerPort: port,
    previewUrl: formatPreviewUrl(projectId, port),
    containerId,
  });

  const serverRecord = activeServers.get(projectId);
  if (serverRecord) {
    serverRecord.status = status;
    if (port !== undefined) serverRecord.port = port;
  }

  if (io) {
    io.to(`project:${projectId}`).emit("project-status-change", {
      projectId,
      status,
      port,
      previewUrl: formatPreviewUrl(projectId, port),
    });
  }
};

/**
 * Installs project dependencies (e.g. npm install) if required.
 * Guards against concurrent duplicate npm install runs per project.
 */
export const installDependencies = async (projectId, io = null) => {
  const strId = projectId.toString();

  // Prevent duplicate concurrent npm install processes for the same project
  if (activeInstallations.has(strId)) {
    appendAndBroadcastLog(projectId, "⚙ Dependency installation is already in progress. Waiting for completion...", io);
    return activeInstallations.get(strId);
  }

  const installPromise = (async () => {
    try {
      const project = await Project.findById(projectId);
      if (!project) throw new Error("Project not found");

      const projectDir = await syncProjectFilesToDisk(projectId);

      // Verify package.json exists before attempting installation
      const pkgJsonPath = path.join(projectDir, "package.json");
      if (!fs.existsSync(pkgJsonPath)) {
        await syncProjectFilesToDisk(projectId);
      }
      if (!fs.existsSync(pkgJsonPath)) {
        const errorMsg = `package.json not found in this project (${projectDir}). Cannot install dependencies.`;
        appendAndBroadcastLog(projectId, `❌ [INSTALL] ${errorMsg}`, io);
        return false;
      }

      // Check node and npm availability
      const envCheck = await verifyNodeAndNpm(projectDir);
      if (!envCheck.available) {
        const errorMsg = `Node.js / npm environment check failed: ${envCheck.error}. Node version: ${envCheck.nodeVersion}`;
        appendAndBroadcastLog(projectId, `❌ [INSTALL] ${errorMsg}`, io);
        await updateServerStatus(projectId, "error", null, io);
        return { success: false, error: errorMsg };
      }

      // Determine install command: use npm ci if package-lock exists, otherwise npm install
      const hasLockfile = fs.existsSync(path.join(projectDir, "package-lock.json"));
      let defaultInstall = hasLockfile ? "npm ci --include=dev" : "npm install --include=dev";
      let installCmd = project?.installCommand || defaultInstall;
      if (installCmd.startsWith("npm")) {
        if (!installCmd.includes("--include=dev")) {
          installCmd = `${installCmd} --include=dev`;
        }
        if (!installCmd.includes("--legacy-peer-deps")) {
          installCmd = `${installCmd} --legacy-peer-deps`;
        }
        if (!installCmd.includes("--no-audit")) {
          installCmd = `${installCmd} --no-audit`;
        }
        if (!installCmd.includes("--no-fund")) {
          installCmd = `${installCmd} --no-fund`;
        }
      }

      if (!installCmd) {
        return { success: true };
      }

      // Skip if dependencies are already fully installed
      if (areDependenciesInstalled(projectDir, project?.projectType)) {
        appendAndBroadcastLog(projectId, "✔ Dependencies already installed (Vite found in node_modules).", io);
        return { success: true };
      }

      await updateServerStatus(projectId, "installing", null, io);

      // Try Docker sandbox execution first if applicable and Docker daemon is responsive
      const dockerAvailable = await isDockerAvailable();
      if (dockerAvailable && project?.projectType === "react-vite") {
        appendAndBroadcastLog(projectId, "⚙ Installing dependencies in Docker sandbox...", io);
        try {
          const result = await runReactSandboxCommand(projectId, ["npm", "install", "--legacy-peer-deps", "--no-audit", "--no-fund"], {
            timeoutMs: 300_000,
          });
          if (result.output) appendAndBroadcastLog(projectId, result.output, io);
          const installed = result.exitCode === 0;
          if (installed && areDependenciesInstalled(projectDir, project?.projectType)) {
            appendAndBroadcastLog(projectId, "✅ Dependencies installed successfully!", io);
            await updateServerStatus(projectId, "ready", null, io);
            return { success: true };
          } else if (installed) {
            appendAndBroadcastLog(projectId, "✅ Dependencies installed successfully in container!", io);
            await updateServerStatus(projectId, "ready", null, io);
            return { success: true };
          } else {
            const errorMsg = `Docker dependency install failed (exit code ${result.exitCode}): ${result.output?.slice(-400) || ""}`;
            appendAndBroadcastLog(projectId, `❌ ${errorMsg}`, io);
            await updateServerStatus(projectId, "error", null, io);
            return { success: false, error: errorMsg };
          }
        } catch (error) {
          logger.warn(`Docker sandbox install failed: ${error.message}. Falling back to native dependency installation.`);
          appendAndBroadcastLog(projectId, `⚠️ Docker Desktop is unavailable (${error.message}). Falling back to native dependency installation...`, io);
        }
      } else if (project?.projectType === "react-vite") {
        appendAndBroadcastLog(projectId, "⚙ Docker unavailable in environment. Proceeding with native dependency installation...", io);
      }

      // Native dependency installation on host
      appendAndBroadcastLog(projectId, `⚙ Running dependency installation: ${installCmd}...`, io);

      const isWin = process.platform === "win32";
      const shellCmd = isWin ? "cmd.exe" : "sh";
      const args = isWin ? ["/c", installCmd] : ["-c", installCmd];

      return await new Promise((resolve) => {
        let lastStderr = "";
        let lastStdout = "";
        const child = spawn(shellCmd, args, {
          cwd: projectDir,
          env: getProjectExecutionEnv(projectDir),
        });

        child.stdout.on("data", (data) => {
          const text = data.toString();
          lastStdout += text;
          if (lastStdout.length > 20_000) lastStdout = lastStdout.slice(-20_000);
          appendAndBroadcastLog(projectId, text, io);
        });

        child.stderr.on("data", (data) => {
          const text = data.toString();
          lastStderr += text;
          if (lastStderr.length > 20_000) lastStderr = lastStderr.slice(-20_000);
          appendAndBroadcastLog(projectId, text, io);
        });

        child.on("exit", async (code) => {
          const installed = areDependenciesInstalled(projectDir, project?.projectType);
          if (code === 0 && installed) {
            appendAndBroadcastLog(projectId, "✅ Dependencies installed successfully!", io);
            await updateServerStatus(projectId, "ready", null, io);
            resolve({ success: true });
          } else if (code === 0) {
            const errorMsg = "Dependency installation completed with exit code 0, but required binaries (e.g. Vite) were not detected in node_modules.";
            appendAndBroadcastLog(projectId, `❌ [INSTALL] ${errorMsg}`, io);
            await updateServerStatus(projectId, "error", null, io);
            resolve({ success: false, error: errorMsg });
          } else {
            const errSummary = lastStderr.trim().slice(-400) || lastStdout.trim().slice(-400) || `exit code ${code}`;
            const errorMsg = `Dependency installation failed (exit code ${code}): ${errSummary}`;
            appendAndBroadcastLog(projectId, `❌ [INSTALL] ${errorMsg}`, io);
            await updateServerStatus(projectId, "error", null, io);
            resolve({ success: false, error: errorMsg });
          }
        });

        child.on("error", async (err) => {
          const errorMsg = `Failed to spawn install process (${installCmd}): ${err.message}`;
          appendAndBroadcastLog(projectId, `❌ [INSTALL] ${errorMsg}`, io);
          await updateServerStatus(projectId, "error", null, io);
          resolve({ success: false, error: errorMsg });
        });
      });
    } finally {
      // Guarantee lock release even on error or crash
      activeInstallations.delete(strId);
    }
  })();

  activeInstallations.set(strId, installPromise);
  return installPromise;
};

/**
 * Starts dev server for a project on a unique allocated port.
 */
export const startDevServer = async (projectId, io = null, options = {}) => {
  const isPreview = options.mode === "preview";
  const targetStatus = isPreview ? "previewing" : "running";
  const startingServer = activeServers.get(projectId);
  if (startingServer?.status === "starting") {
    return {
      status: "starting",
      projectId,
      port: startingServer.port,
      previewUrl: formatPreviewUrl(projectId, startingServer.port),
    };
  }

  // If server is already running with matching status, return current state
  if (activeServers.has(projectId) && activeServers.get(projectId).status === targetStatus) {
    const existing = activeServers.get(projectId);
    return {
      status: targetStatus,
      projectId,
      port: existing.port,
      previewUrl: formatPreviewUrl(projectId, existing.port),
    };
  }

  // Auto-detect project framework type & start command if missing
  const projectInfo = await detectAndSaveProjectType(projectId);
  const project = await Project.findById(projectId);

  let startCmd = isPreview ? "npm run preview" : (project.startCommand || projectInfo.startCommand || "npm run dev");
  const preferredPort = projectInfo.defaultPort || 5173;

  // Allocate open port using portManager
  const allocatedPort = await allocatePortForProject(projectId, preferredPort);

  appendAndBroadcastLog(projectId, `[PROJECT] Starting project ${projectId}`, io);
  appendAndBroadcastLog(projectId, `[PORT] Allocated ${allocatedPort}`, io);

  const projectDir = await syncProjectFilesToDisk(projectId);

  // 1. Verify package.json exists or auto-scaffold if it's a web project
  let pkgJsonPath = path.join(projectDir, "package.json");
  if (!fs.existsSync(pkgJsonPath)) {
    await syncProjectFilesToDisk(projectId);
  }
  if (!fs.existsSync(pkgJsonPath)) {
    const isReact = project?.language === "react" || (project?.projectType === "react-vite" && project?.language !== "javascript");
    if (isReact) {
      appendAndBroadcastLog(projectId, "📦 Auto-scaffolding package.json for React project...", io);
      const defaultPkg = {
        name: (project?.name || "cloud-project").toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        private: true,
        version: "0.0.0",
        type: "module",
        scripts: {
          dev: "vite --host 0.0.0.0",
          build: "vite build",
          preview: "vite preview --host 0.0.0.0",
        },
        dependencies: {
          react: "^18.3.1",
          "react-dom": "^18.3.1",
        },
        devDependencies: {
          "@vitejs/plugin-react": "^4.3.4",
          vite: "^6.0.0",
        },
      };
      const pkgContent = JSON.stringify(defaultPkg, null, 2);
      fs.writeFileSync(pkgJsonPath, pkgContent, "utf8");
      await FileNode.create({
        name: "package.json",
        isFolder: false,
        project: projectId,
        parentId: null,
        content: pkgContent,
        relativePath: "package.json",
        language: "json",
        size: Buffer.byteLength(pkgContent, "utf8"),
      }).catch(() => {});

      const viteCfgPath = path.join(projectDir, "vite.config.js");
      if (!fs.existsSync(viteCfgPath)) {
        const viteContent = `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { host: "0.0.0.0", strictPort: false },\n});\n`;
        fs.writeFileSync(viteCfgPath, viteContent, "utf8");
        await FileNode.create({
          name: "vite.config.js",
          isFolder: false,
          project: projectId,
          parentId: null,
          content: viteContent,
          relativePath: "vite.config.js",
          language: "javascript",
          size: Buffer.byteLength(viteContent, "utf8"),
        }).catch(() => {});
      }
      if (io) {
        io.to(`project:${projectId}`).emit("files-updated", { action: "scaffold-package", projectId });
      }
    } else if (project?.language === "javascript") {
      appendAndBroadcastLog(projectId, "📦 Auto-scaffolding package.json for Node.js project...", io);
      const defaultPkg = {
        name: (project?.name || "cloud-project").toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        private: true,
        version: "1.0.0",
        type: "module",
        scripts: {
          start: "node index.js",
          dev: "node index.js",
        },
      };
      const pkgContent = JSON.stringify(defaultPkg, null, 2);
      fs.writeFileSync(pkgJsonPath, pkgContent, "utf8");
      await FileNode.create({
        name: "package.json",
        isFolder: false,
        project: projectId,
        parentId: null,
        content: pkgContent,
        relativePath: "package.json",
        language: "json",
        size: Buffer.byteLength(pkgContent, "utf8"),
      }).catch(() => {});
      if (io) {
        io.to(`project:${projectId}`).emit("files-updated", { action: "scaffold-package", projectId });
      }
    }
  }
  if (!fs.existsSync(pkgJsonPath)) {
    const errorMsg = "package.json not found in this project. Cannot start development server.";
    appendAndBroadcastLog(projectId, `❌ [EXECUTOR] ${errorMsg}`, io);
    await updateServerStatus(projectId, "error", null, io);
    releaseProjectPort(projectId);
    throw new Error(errorMsg);
  }

  // 2. Strictly verify dependencies are installed BEFORE attempting to execute Vite
  if (!areDependenciesInstalled(projectDir, project?.projectType)) {
    appendAndBroadcastLog(projectId, "⚙ Dependencies not detected. Installing dependencies before starting dev server...", io);
    const installRes = await installDependencies(projectId, io);
    const isInstalled = typeof installRes === "object" ? installRes.success : Boolean(installRes);
    if (!isInstalled || !areDependenciesInstalled(projectDir, project?.projectType)) {
      const detailError = (typeof installRes === "object" && installRes.error)
        ? installRes.error
        : "Dependency installation failed. Review terminal logs for details.";
      const errorMsg = `Cannot start development server: ${detailError}`;
      appendAndBroadcastLog(projectId, `❌ [EXECUTOR] ${errorMsg}`, io);
      await updateServerStatus(projectId, "error", null, io);
      releaseProjectPort(projectId);
      throw new Error(errorMsg);
    }
  }

  // 3. Try Docker sandbox execution if applicable and Docker daemon is available
  const dockerAvailable = await isDockerAvailable();
  if (dockerAvailable && project?.projectType === "react-vite") {
    activeServers.set(projectId, {
      process: null,
      port: allocatedPort,
      status: "starting",
      logs: [],
      projectDir,
      sandbox: true,
    });
    await updateServerStatus(projectId, "starting", allocatedPort, io);
    appendAndBroadcastLog(projectId, `[DOCKER] Starting React ${isPreview ? "preview" : "development"} server in Docker on port ${allocatedPort}...`, io);
    try {
      const sandbox = await startReactSandbox(projectId, allocatedPort, isPreview ? "preview" : "dev", {
        onLog: (line) => appendAndBroadcastLog(projectId, line, io),
        onExit: () => {
          updateServerStatus(projectId, "stopped", null, io);
          releaseProjectPort(projectId);
          activeServers.delete(projectId);
          releaseProjectEditLock(projectId, null, io);
        },
      });
      const serverRecord = activeServers.get(projectId);
      if (serverRecord) {
        serverRecord.container = sandbox.container;
        serverRecord.status = "running";
      }
      await updateServerStatus(projectId, targetStatus, allocatedPort, io, sandbox.containerId);
      appendAndBroadcastLog(projectId, `[PREVIEW] /preview/${projectId}/`, io);
      appendAndBroadcastLog(projectId, `[PROJECT] Status: ${targetStatus}`, io);
      return {
        status: targetStatus,
        projectId,
        port: allocatedPort,
        previewUrl: formatPreviewUrl(projectId, allocatedPort),
      };
    } catch (error) {
      activeServers.delete(projectId);
      logger.info(`Docker sandbox start failed for project ${projectId} (${error.message}). Falling back to native process mode.`);
      appendAndBroadcastLog(projectId, `[DOCKER] Docker unavailable (${error.message}). Falling back to native execution mode...`, io);
    }
  } else if (project?.projectType === "react-vite") {
    appendAndBroadcastLog(projectId, "[REACT RUNTIME] Docker unavailable. Using native Node.js process mode...", io);
  }

  // 4. Native development server execution (Dependencies are guaranteed installed!)
  activeServers.set(projectId, {
    process: null,
    port: allocatedPort,
    status: "starting",
    logs: [],
    projectDir,
  });

  await updateServerStatus(projectId, "starting", allocatedPort, io);
  appendAndBroadcastLog(projectId, `[EXECUTOR] Starting ${isPreview ? "preview" : "dev"} server on port ${allocatedPort}...`, io);

  // Inject PORT environment variable for dev server
  const isWin = process.platform === "win32";
  const envVars = {
    PORT: String(allocatedPort),
    VITE_PORT: String(allocatedPort),
    BROWSER: "none",
  };

  // Adjust startCommand to pass port if Vite / Next.js.
  // `npm run dev` does not contain "vite", so without this Vite binds 5173
  // and collides with the IDE frontend.
  let finalCmd = startCmd;
  const isViteProject =
    project?.projectType === "react-vite" ||
    finalCmd.includes("vite") ||
    /\bnpm run (dev|preview)\b/.test(finalCmd);
  if (isViteProject) {
    finalCmd = `${startCmd} -- --port ${allocatedPort} --host 0.0.0.0`;
  } else if (finalCmd.includes("next")) {
    finalCmd = `${startCmd} -- -p ${allocatedPort}`;
  }

  const shellCmd = isWin ? "cmd.exe" : "sh";
  const args = isWin ? ["/c", finalCmd] : ["-c", finalCmd];
  const executionEnv = getProjectExecutionEnv(projectDir, envVars);

  logger.info(`[REACT RUNTIME] Starting dev server:\n` +
    `  projectId: ${projectId}\n` +
    `  projectPath: ${projectDir}\n` +
    `  workingDirectory: ${projectDir}\n` +
    `  command: ${finalCmd}\n` +
    `  arguments: ${JSON.stringify(args)}\n` +
    `  shell: ${shellCmd}\n` +
    `  node: ${process.version}\n` +
    `  port: ${allocatedPort}`
  );

  appendAndBroadcastLog(projectId, `[REACT RUNTIME] Command: ${finalCmd}`, io);
  appendAndBroadcastLog(projectId, `[REACT RUNTIME] Working Directory: ${projectDir}`, io);
  appendAndBroadcastLog(projectId, `[REACT RUNTIME] Node: ${process.version} | Port: ${allocatedPort}`, io);

  const child = spawn(shellCmd, args, {
    cwd: projectDir,
    env: executionEnv,
  });

  const serverRecord = activeServers.get(projectId);
  if (serverRecord) {
    serverRecord.process = child;
  }

  child.stdout.on("data", (data) => {
    const text = data.toString();
    appendAndBroadcastLog(projectId, text, io);

    // Detect actual port bound by Vite from stdout
    const portMatch = text.match(/(?:Local|Network):\s+https?:\/\/(?:[a-zA-Z0-9.-]+):(\d+)/i);
    if (portMatch) {
      const detectedPort = parseInt(portMatch[1], 10);
      if (detectedPort && detectedPort !== allocatedPort) {
        logger.info(`[REACT RUNTIME] Vite bound to port ${detectedPort} (originally allocated ${allocatedPort})`);
        allocatedPort = detectedPort;
        const sRecord = activeServers.get(projectId);
        if (sRecord) sRecord.port = detectedPort;
      }
    }

    // Detect when dev server is ready from console logs
    if (
      /\b(?:ready in|Local:\s*http|running at|Compiled successfully|Server running|Listening on)\b/i.test(text)
    ) {
      updateServerStatus(projectId, targetStatus, allocatedPort, io);
    }
  });

  child.stderr.on("data", (data) => {
    const text = data.toString();
    appendAndBroadcastLog(projectId, text, io);
  });

  child.on("exit", (code) => {
    appendAndBroadcastLog(projectId, `[PROJECT] Server exited with code ${code}`, io);
    updateServerStatus(projectId, "stopped", null, io);
    releaseProjectPort(projectId);
    activeServers.delete(projectId);
    releaseProjectEditLock(projectId, null, io);
  });

  child.on("error", (err) => {
    appendAndBroadcastLog(projectId, `[EXECUTOR] Server error: ${err.message}`, io);
    updateServerStatus(projectId, "error", null, io);
    releaseProjectPort(projectId);
    activeServers.delete(projectId);
    releaseProjectEditLock(projectId, null, io);
  });

  // Poll until TCP port is open and listening before marking status as running (timeout up to 30s)
  const isPortReady = await waitForPortOpen(allocatedPort, 30000);
  if (isPortReady) {
    await updateServerStatus(projectId, targetStatus, allocatedPort, io);
    appendAndBroadcastLog(projectId, `[PREVIEW] /preview/${projectId}/`, io);
    appendAndBroadcastLog(projectId, `[PROJECT] Status: ${targetStatus}`, io);
  } else {
    const isExited = child.exitCode !== null;
    let errorMsg = "";
    if (isExited) {
      errorMsg = `Server process exited prematurely with exit code ${child.exitCode}.`;
      if (child.exitCode === 127) {
        errorMsg += ` (Command or executable not found. Ensure Vite and npm dependencies are installed.)`;
      }
      errorMsg += ` Review terminal logs for details.`;
    } else {
      errorMsg = `Dev server on port ${allocatedPort} did not become ready within 30s timeout.`;
    }
    logger.error(`[REACT RUNTIME] Dev server failure: ${errorMsg} for project ${projectId}\n` +
      `  exitCode: ${child.exitCode}\n` +
      `  command: ${finalCmd}\n` +
      `  cwd: ${projectDir}`
    );
    appendAndBroadcastLog(projectId, `❌ [EXECUTOR] ${errorMsg}`, io);
    await updateServerStatus(projectId, "error", null, io);
    releaseProjectPort(projectId);
    activeServers.delete(projectId);
    throw new Error(errorMsg);
  }

  return {
    status: targetStatus,
    projectId,
    port: allocatedPort,
    previewUrl: formatPreviewUrl(projectId, allocatedPort),
  };
};

/**
 * Stops running dev server process for a project.
 */
export const stopDevServer = async (projectId, io = null) => {
  const serverRecord = activeServers.get(projectId);
  const project = await Project.findById(projectId).select("projectType");

  if (serverRecord?.sandbox || project?.projectType === "react-vite") {
    appendAndBroadcastLog(projectId, "🛑 Stopping development container/sandbox...", io);
    try {
      await stopReactSandbox(projectId);
    } catch (err) {
      logger.warn(`Ignored error while stopping sandbox: ${err.message}`);
    }
  }

  if (serverRecord && serverRecord.process) {
    appendAndBroadcastLog(projectId, "🛑 Stopping development server process...", io);
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(serverRecord.process.pid), "/f", "/t"], { windowsHide: true });
      } else {
        try {
          process.kill(-serverRecord.process.pid, "SIGTERM");
        } catch {
          serverRecord.process.kill("SIGTERM");
        }
      }
    } catch (err) {
      logger.warn(`Failed to kill process: ${err.message}`);
    }
  }

  releaseProjectPort(projectId);

  activeServers.delete(projectId);
  await updateServerStatus(projectId, "stopped", null, io);
  releaseProjectEditLock(projectId, null, io);

  return { status: "stopped" };
};

/**
 * Gets active dev server status and terminal logs for a project.
 */
export const getDevServerStatus = async (projectId) => {
  const project = await Project.findById(projectId);
  const serverRecord = activeServers.get(projectId);

  const status = serverRecord?.status || project?.serverStatus || "stopped";
  const port = serverRecord?.port || project?.devServerPort || null;
  const logs = serverRecord?.logs || [];

  return {
    serverStatus: status,
    devServerPort: port,
    previewUrl: formatPreviewUrl(projectId, port),
    projectType: project?.projectType || "general",
    startCommand: project?.startCommand || "",
    installCommand: project?.installCommand || "",
    logs,
  };
};
