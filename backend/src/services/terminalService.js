// backend/src/services/terminalService.js
// Responsibility: Manage interactive project terminal sessions with secure
// container sandboxing (Docker) and safe fallback isolation.

import Docker from "dockerode";
import { spawn } from "child_process";
import path from "path";
import { env } from "../config/env.js";
import logger from "../utils/logger.js";
import Project from "../models/project.model.js";
import { syncProjectFilesToDisk } from "./projectRunner.service.js";

const docker = new Docker();
const DOCKER_IMAGE = env.PROJECT_SANDBOX_IMAGE || "node:22-alpine";

// Active terminal sessions mapped by socket.id
const activeSessions = new Map();

/**
 * Checks whether the Docker daemon is responding.
 */
export const isDockerAvailable = async () => {
  try {
    const pingPromise = docker.ping();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Docker ping timeout")), 1500)
    );
    await Promise.race([pingPromise, timeoutPromise]);
    return true;
  } catch {
    return false;
  }
};

/**
 * Builds a sanitized environment object stripping all sensitive server credentials.
 */
const getSanitizedEnv = (projectDir, projectId) => {
  const safeKeys = [
    "PATH",
    "NODE_ENV",
    "FORCE_COLOR",
    "TERM",
    "COLORTERM",
    "HOME",
    "USERPROFILE",
    "TEMP",
    "TMP",
    "APPDATA",
    "LOCALAPPDATA",
  ];
  const safeEnv = {};
  for (const key of safeKeys) {
    if (process.env[key]) {
      safeEnv[key] = process.env[key];
    }
  }
  safeEnv.PROJECT_ID = String(projectId);
  safeEnv.WORKSPACE_DIR = projectDir;
  safeEnv.NODE_OPTIONS = "--max-old-space-size=512";
  return safeEnv;
};

/**
 * Starts or connects to a project container sandbox using Dockerode.
 */
export const startDockerSandbox = async (projectId, projectDir) => {
  const containerName = `ccide_term_${projectId}`;
  try {
    // Check if image exists; if not, pull it
    try {
      await docker.getImage(DOCKER_IMAGE).inspect();
    } catch (imgErr) {
      if (imgErr.statusCode === 404) {
        logger.info(`Pulling sandbox image ${DOCKER_IMAGE}...`);
        const stream = await new Promise((resolve, reject) => {
          docker.pull(DOCKER_IMAGE, (err, s) => (err ? reject(err) : resolve(s)));
        });
        await new Promise((resolve, reject) => {
          docker.modem.followProgress(stream, (err) => (err ? reject(err) : resolve()));
        });
      }
    }

    // Check if container already exists
    let container;
    try {
      container = docker.getContainer(containerName);
      const inspectData = await container.inspect();
      if (!inspectData.State.Running) {
        await container.start();
      }
      return container;
    } catch (inspectErr) {
      if (inspectErr.statusCode !== 404) throw inspectErr;
    }

    // Create container with resource limits and restricted security posture
    container = await docker.createContainer({
      Image: DOCKER_IMAGE,
      name: containerName,
      Cmd: ["tail", "-f", "/dev/null"],
      WorkingDir: "/workspace",
      User: "node", // Non-root execution inside sandbox container
      HostConfig: {
        Binds: [`${projectDir}:/workspace`],
        Memory: 512 * 1024 * 1024, // 512MB limit
        NanoCpus: 1_000_000_000,   // 1 CPU core limit
        PidsLimit: 128,            // Max 128 processes
        CapDrop: ["NET_RAW", "SYS_ADMIN", "SYS_PTRACE", "SYS_MODULE", "MKNOD"],
        SecurityOpt: ["no-new-privileges:true"],
        AutoRemove: false,
      },
      Env: [
        "NODE_ENV=development",
        "FORCE_COLOR=true",
        "TERM=xterm-256color",
      ],
      Labels: {
        app: "collaborative-cloud-ide",
        project: String(projectId),
      },
    });

    await container.start();
    logger.info(`Started terminal sandbox container ${containerName}`);
    return container;
  } catch (error) {
    logger.error(`Failed to start Docker sandbox container: ${error.message}`);
    throw error;
  }
};

/**
 * Periodic cleaner for abandoned sessions idle for more than 30 minutes.
 */
const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [socketId, session] of activeSessions.entries()) {
    if (now - (session.lastActivity || session.createdAt || now) > SESSION_IDLE_TIMEOUT_MS) {
      logger.info(`Cleaning up abandoned terminal session for socket ${socketId}`);
      if (session.type === "docker") {
        try { session.stream?.end(); } catch {}
      } else if (session.type === "host-restricted" && session.process) {
        try {
          if (process.platform === "win32" && session.process.pid) {
            spawn("taskkill", ["/pid", String(session.process.pid), "/f", "/t"], { windowsHide: true });
          } else {
            session.process.kill("SIGTERM");
          }
        } catch {}
      }
      activeSessions.delete(socketId);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Starts an interactive terminal session for an authenticated socket and project.
 */
export const startProjectTerminalSession = async (socket, projectId, { cols = 80, rows = 24 } = {}) => {
  stopProjectTerminalSession(socket);

  const projectDir = await syncProjectFilesToDisk(projectId);
  const project = await Project.findById(projectId).select("name owner");
  if (!project) {
    socket.emit("project-terminal-error", { message: "Project not found or deleted." });
    return null;
  }
  const projectName = project.name || "Project";

  const dockerRunning = await isDockerAvailable();

  if (dockerRunning) {
    try {
      const container = await startDockerSandbox(projectId, projectDir);
      const exec = await container.exec({
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        Tty: true,
        Cmd: ["/bin/sh"],
        User: "node",
      });

      const stream = await exec.start({ hijack: true, stdin: true });
      
      const session = {
        type: "docker",
        container,
        exec,
        stream,
        projectId: String(projectId),
        userId: socket.user?._id?.toString(),
        socketId: socket.id,
        createdAt: Date.now(),
        lastActivity: Date.now(),
      };
      activeSessions.set(socket.id, session);
      socket.projectTerminalSession = session;

      socket.emit("project-terminal-ready", {
        mode: "docker-tty",
        isolation: "docker-container",
        dockerAvailable: true,
        projectName,
        blocker: null,
      });

      stream.on("data", (chunk) => {
        socket.emit("project-terminal-output", { data: chunk.toString("utf-8") });
      });

      stream.on("end", () => {
        socket.emit("project-terminal-exit", { exitCode: 0 });
        stopProjectTerminalSession(socket);
      });

      stream.on("error", (err) => {
        logger.error(`Terminal stream error: ${err.message}`);
        socket.emit("project-terminal-error", { message: `Stream error: ${err.message}` });
      });

      return session;
    } catch (dockerErr) {
      logger.warn(`Docker container execution failed (${dockerErr.message}). Checking sandbox policy.`);
    }
  }

  // Strict sandbox policy: if production config mandates Docker sandbox and it's unreachable, reject execution.
  if (process.env.REQUIRE_DOCKER_SANDBOX === "true") {
    const errorMsg = "Docker sandbox is required for terminal execution, but Docker daemon is unavailable.";
    logger.error(`[TERMINAL] Denied session: ${errorMsg}`);
    socket.emit("project-terminal-error", {
      message: errorMsg,
      blocker: "Docker engine not reachable (npipe:////./pipe/dockerDesktopLinuxEngine)",
    });
    return null;
  }

  // Development fallback when Docker engine is not available on host:
  // 1. Send clear, explicit security & sandbox explanation identifying the exact blocker
  // 2. Run in project directory with stripped environment (no secrets)
  const isWindows = process.platform === "win32";
  const shell = isWindows ? "cmd.exe" : "sh";
  const shellArgs = isWindows ? ["/Q"] : ["-i"];
  const safeEnv = getSanitizedEnv(projectDir, projectId);

  const notice = 
    "\r\n\x1b[1;33m[SANDBOX NOTICE]\x1b[0m Docker container engine is not running on this host.\r\n" +
    "\x1b[90mMissing infrastructure: Docker Desktop Linux Engine (npipe:////./pipe/dockerDesktopLinuxEngine).\x1b[0m\r\n" +
    `\x1b[36mRunning in workspace development environment:\x1b[0m ${projectDir}\r\n` +
    "\x1b[90mHost credentials and database secrets are stripped from the environment.\x1b[0m\r\n\r\n";

  const terminalProcess = spawn(shell, shellArgs, {
    cwd: projectDir,
    env: safeEnv,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  const session = {
    type: "host-restricted",
    process: terminalProcess,
    projectId: String(projectId),
    userId: socket.user?._id?.toString(),
    socketId: socket.id,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  activeSessions.set(socket.id, session);
  socket.projectTerminalSession = session;

  socket.emit("project-terminal-ready", {
    mode: "host-pipe",
    isolation: "restricted-workspace",
    dockerAvailable: false,
    projectName,
    blocker: "Docker daemon not running (npipe:////./pipe/dockerDesktopLinuxEngine)",
  });

  // Emit sandbox notice banner
  socket.emit("project-terminal-output", { data: notice });

  const forwardOutput = (data) => {
    socket.emit("project-terminal-output", { data: data.toString() });
  };

  terminalProcess.stdout.on("data", forwardOutput);
  terminalProcess.stderr.on("data", forwardOutput);

  terminalProcess.on("error", (error) => {
    logger.error(`Project terminal error: ${error.message}`);
    socket.emit("project-terminal-error", { message: `Unable to start terminal: ${error.message}` });
  });

  terminalProcess.on("exit", (exitCode) => {
    if (activeSessions.get(socket.id)?.process === terminalProcess) {
      activeSessions.delete(socket.id);
      socket.projectTerminalSession = null;
    }
    socket.emit("project-terminal-exit", { exitCode: exitCode ?? 0 });
  });

  return session;
};

/**
 * Handles incoming keyboard/command input from the socket client.
 */
export const handleProjectTerminalInput = (socket, data) => {
  const session = socket.projectTerminalSession || activeSessions.get(socket.id);
  if (!session) return;
  if (session.userId && socket.user?._id && session.userId !== socket.user._id.toString()) {
    logger.warn(`Unauthorized input attempt on socket ${socket.id} from user ${socket.user._id}`);
    return;
  }
  if (typeof data !== "string" || data.length > 8_192) return;

  session.lastActivity = Date.now();

  if (session.type === "docker" && session.stream?.writable) {
    session.stream.write(data);
  } else if (session.type === "host-restricted" && session.process?.stdin?.writable) {
    const isWindows = process.platform === "win32";
    // Normalize keystrokes for raw stdin pipe
    let payload = data;
    if (isWindows) {
      if (data === "\r") {
        payload = "\r\n";
      } else if (data === "\u007f") {
        payload = "\b";
      } else if (data === "\x03") {
        // Ctrl+C signal
        payload = "\x03\r\n";
      }
    }
    session.process.stdin.write(payload);
  }
};

/**
 * Handles terminal resize events.
 */
export const handleProjectTerminalResize = (socket, { cols, rows } = {}) => {
  const session = socket.projectTerminalSession || activeSessions.get(socket.id);
  if (!session) return;

  if (session.type === "docker" && session.exec?.resize && cols && rows) {
    try {
      session.exec.resize({ h: Number(rows), w: Number(cols) }, () => {});
    } catch (e) {
      // Ignore resize error if stream ended
    }
  }
};

/**
 * Terminates and cleans up the active terminal session for a socket.
 */
export const stopProjectTerminalSession = (socket) => {
  const session = socket.projectTerminalSession || activeSessions.get(socket.id);
  if (!session) return;

  activeSessions.delete(socket.id);
  socket.projectTerminalSession = null;

  if (session.type === "docker") {
    try {
      if (session.stream) session.stream.end();
    } catch {}
  } else if (session.type === "host-restricted" && session.process) {
    try {
      if (process.platform === "win32" && session.process.pid) {
        spawn("taskkill", ["/pid", String(session.process.pid), "/f", "/t"], { windowsHide: true });
      } else {
        session.process.kill("SIGTERM");
      }
    } catch (e) {
      logger.warn(`Error stopping terminal process: ${e.message}`);
    }
  }
};
