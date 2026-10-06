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
import { runReactSandboxCommand, startReactSandbox, stopReactSandbox } from "./sandboxService.js";
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

export const getActiveProjectPort = (projectId) => {
  if (!projectId) return null;
  const server = activeServers.get(projectId.toString());
  return server ? server.port : null;
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

const TERMINAL_COMMAND_TIMEOUT_MS = 30_000;
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
    const child = spawn(shellCommand, shellArgs, {
      cwd: projectDir,
      env: {
        ...process.env,
        PATH: `${path.join(projectDir, "node_modules", ".bin")}${path.delimiter}${process.env.PATH || ""}`,
      },
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
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (exitCode) => {
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

  const files = await FileNode.find({ project: projectId });

  // 1. Create folders first
  const folders = files.filter((f) => f.isFolder);
  for (const folder of folders) {
    const folderPath = resolveProjectPath(projectDir, folder.relativePath || folder.name);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
  }

  // 2. Write file contents
  const codeFiles = files.filter((f) => !f.isFolder);
  for (const file of codeFiles) {
    const filePath = resolveProjectPath(projectDir, file.relativePath || file.name);
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
 */
export const installDependencies = async (projectId, io = null) => {
  const projectDir = await syncProjectFilesToDisk(projectId);
  const nodeModulesPath = path.join(projectDir, "node_modules");

  const project = await Project.findById(projectId);
  let installCmd = project?.installCommand || "npm install";
  if (installCmd.startsWith("npm install") && !installCmd.includes("--legacy-peer-deps")) {
    installCmd = `${installCmd} --legacy-peer-deps --no-audit --no-fund`;
  }

  if (!installCmd) {
    return true; // No install command required
  }

  if (project?.projectType === "react-vite") {
    await updateServerStatus(projectId, "installing", null, io);
    appendAndBroadcastLog(projectId, "⚙ Installing dependencies in the Docker sandbox...", io);
    try {
      const result = await runReactSandboxCommand(projectId, ["npm", "install", "--legacy-peer-deps", "--no-audit", "--no-fund"], {
        timeoutMs: 300_000,
      });
      if (result.output) appendAndBroadcastLog(projectId, result.output, io);
      const installed = result.exitCode === 0;
      if (!installed) {
        appendAndBroadcastLog(projectId, `❌ Dependency installation failed (exit code ${result.exitCode}).`, io);
        await updateServerStatus(projectId, "error", null, io);
      }
      return installed;
    } catch (error) {
      if (error.errorCode !== "DOCKER_UNAVAILABLE") {
        await updateServerStatus(projectId, "error", null, io);
        throw error;
      }
      appendAndBroadcastLog(projectId, "⚠️ Docker Desktop is unavailable. Falling back to native dependency installation...", io);
    }
  }

  // Skip if node_modules already exists and contains installed binaries (.bin)
  const binPath = path.join(nodeModulesPath, ".bin");
  if (fs.existsSync(nodeModulesPath) && fs.existsSync(binPath) && installCmd.includes("npm")) {
    appendAndBroadcastLog(projectId, "✔ Dependencies already installed (node_modules present).", io);
    return true;
  }

  await updateServerStatus(projectId, "installing", null, io);
  appendAndBroadcastLog(projectId, `⚙ Running dependency installation: ${installCmd}...`, io);

  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    const shellCmd = isWin ? "cmd.exe" : "sh";
    const args = isWin ? ["/c", installCmd] : ["-c", installCmd];

    const child = spawn(shellCmd, args, {
      cwd: projectDir,
      env: {
        ...process.env,
        FORCE_COLOR: "true",
        PATH: `${path.join(projectDir, "node_modules", ".bin")}${path.delimiter}${process.env.PATH || ""}`,
      },
    });

    child.stdout.on("data", (data) => {
      const text = data.toString();
      appendAndBroadcastLog(projectId, text, io);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString();
      appendAndBroadcastLog(projectId, text, io);
    });

    child.on("exit", (code) => {
      if (code === 0) {
        appendAndBroadcastLog(projectId, "✅ Dependencies installed successfully!", io);
        resolve(true);
      } else {
        appendAndBroadcastLog(projectId, `❌ Dependency installation failed with exit code ${code}`, io);
        updateServerStatus(projectId, "error", null, io);
        resolve(false);
      }
    });

    child.on("error", (err) => {
      appendAndBroadcastLog(projectId, `❌ Installation error: ${err.message}`, io);
      updateServerStatus(projectId, "error", null, io);
      resolve(false);
    });
  });
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

  if (project?.projectType === "react-vite") {
    await syncProjectFilesToDisk(projectId);
    activeServers.set(projectId, {
      process: null,
      port: allocatedPort,
      status: "starting",
      logs: [],
      projectDir: null,
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
  }

  // Initialize server record
  const projectDir = await syncProjectFilesToDisk(projectId);

  activeServers.set(projectId, {
    process: null,
    port: allocatedPort,
    status: "starting",
    logs: [],
    projectDir,
  });

  // Run dependency installation first
  const installed = await installDependencies(projectId, io);
  if (!installed) {
    throw new Error("Failed to install project dependencies.");
  }

  await updateServerStatus(projectId, "starting", allocatedPort, io);
  appendAndBroadcastLog(projectId, `[EXECUTOR] Starting ${isPreview ? "preview" : "dev"} server on port ${allocatedPort}...`, io);

  // Inject PORT environment variable for dev server
  const isWin = process.platform === "win32";
  const envVars = {
    ...process.env,
    PORT: String(allocatedPort),
    VITE_PORT: String(allocatedPort),
    BROWSER: "none",
    FORCE_COLOR: "true",
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

  appendAndBroadcastLog(projectId, `[INFO] Node: ${process.version}`, io);
  appendAndBroadcastLog(projectId, `[INFO] Working Directory: ${projectDir}`, io);
  appendAndBroadcastLog(projectId, `[EXECUTOR] Command: ${finalCmd}`, io);

  const shellCmd = isWin ? "cmd.exe" : "sh";
  const args = isWin ? ["/c", finalCmd] : ["-c", finalCmd];

  const child = spawn(shellCmd, args, {
    cwd: projectDir,
    env: {
      ...envVars,
      PATH: `${path.join(projectDir, "node_modules", ".bin")}${path.delimiter}${process.env.PATH || ""}`,
    },
  });

  const serverRecord = activeServers.get(projectId);
  if (serverRecord) {
    serverRecord.process = child;
  }

  child.stdout.on("data", (data) => {
    const text = data.toString();
    appendAndBroadcastLog(projectId, text, io);

    // Detect when dev server is ready from console logs
    if (
      text.includes("Local:") ||
      text.includes("ready in") ||
      text.includes("Compiled successfully") ||
      text.includes("running at") ||
      text.includes("Server running") ||
      text.includes("Listening on")
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

  // Poll until TCP port is open and listening before marking status as running
  const isPortReady = await waitForPortOpen(allocatedPort, 15000);
  if (isPortReady) {
    await updateServerStatus(projectId, targetStatus, allocatedPort, io);
    appendAndBroadcastLog(projectId, `[PREVIEW] /preview/${projectId}/`, io);
    appendAndBroadcastLog(projectId, `[PROJECT] Status: ${targetStatus}`, io);
  } else {
    const isExited = child.exitCode !== null;
    const errorMsg = isExited
      ? `Server process exited prematurely with exit code ${child.exitCode}. Review terminal logs for details.`
      : `Dev server on port ${allocatedPort} did not become ready within 15s timeout.`;
    logger.error(`[EXECUTOR] ${errorMsg} for project ${projectId}`);
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
        serverRecord.process.kill("SIGTERM");
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
