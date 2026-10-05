// Runs React project commands in resource-limited Docker containers.
import Docker from "dockerode";
import fs from "fs";
import path from "path";
import Project from "../models/project.model.js";
import { env } from "../config/env.js";

const docker = new Docker();
const IMAGE = env.PROJECT_SANDBOX_IMAGE || "node:22-alpine";
const CONTAINER_PORT = 5173;
const activeSandboxes = new Map();
const OUTPUT_LIMIT = 100_000;

const sandboxError = (message, statusCode = 503, errorCode = "DOCKER_UNAVAILABLE") => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  error.expose = true;
  return error;
};

async function getProjectWorkspace(projectId) {
  const project = await Project.findById(projectId).select("owner projectType");
  if (!project) throw sandboxError("Project not found", 404, "PROJECT_NOT_FOUND");
  if (project.projectType !== "react-vite") {
    throw sandboxError("Docker execution is currently enabled for React + Vite projects", 400, "UNSUPPORTED_PROJECT_TYPE");
  }
  const workspace = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), projectId.toString());
  fs.mkdirSync(workspace, { recursive: true });
  return { project, workspace };
}

function dockerOptions(workspace, port) {
  return {
    Image: IMAGE,
    WorkingDir: "/workspace",
    HostConfig: {
      Binds: [`${workspace}:/workspace`],
      Memory: 1024 * 1024 * 1024,
      NanoCpus: 1_000_000_000,
      PidsLimit: 256,
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      ...(port ? {
        PortBindings: {
          [`${CONTAINER_PORT}/tcp`]: [{ HostIp: "127.0.0.1", HostPort: String(port) }],
        },
      } : {}),
    },
    ...(port ? { ExposedPorts: { [`${CONTAINER_PORT}/tcp`]: {} } } : {}),
    Tty: true,
    OpenStdin: false,
  };
}

async function ensureProjectVolume(projectId) {
  const volumeName = `ccide-node-modules-${projectId}`;
  try {
    await docker.getVolume(volumeName).inspect();
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    await docker.createVolume({ Name: volumeName, Labels: { "app": "collaborative-cloud-ide", "project": String(projectId) } });
  }
  return volumeName;
}

function ensureDockerError(error) {
  if (error.statusCode) return error;
  const wrapped = sandboxError(
    "Docker could not start the project sandbox. Start Docker Desktop and make sure the configured Node image is available.",
    503,
    "DOCKER_UNAVAILABLE"
  );
  wrapped.cause = error;
  return wrapped;
}

async function ensureImage() {
  try {
    await docker.getImage(IMAGE).inspect();
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    const stream = await new Promise((resolve, reject) => {
      docker.pull(IMAGE, (pullError, pullStream) => pullError ? reject(pullError) : resolve(pullStream));
    });
    await new Promise((resolve, reject) => {
      docker.modem.followProgress(stream, (pullError) => pullError ? reject(pullError) : resolve());
    });
  }
}

async function runOneShot(projectId, args, { timeoutMs = 180_000, installIfMissing = false } = {}) {
  const { workspace } = await getProjectWorkspace(projectId);
  let container;
  let timeoutHandle;
  try {
    await ensureImage();
    const nodeModulesVolume = await ensureProjectVolume(projectId);
    const script = installIfMissing
      ? "if [ ! -d node_modules ]; then npm install --no-audit --no-fund || exit $?; fi; exec \"$@\""
      : null;
    const cmd = script ? ["sh", "-lc", script, "sandbox", ...args] : args;
    container = await docker.createContainer({
      ...dockerOptions(workspace),
      Cmd: cmd,
      HostConfig: {
        ...dockerOptions(workspace).HostConfig,
        Mounts: [{ Type: "volume", Source: nodeModulesVolume, Target: "/workspace/node_modules" }],
        AutoRemove: false,
      },
    });
    await container.start();
    const timeout = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => reject(sandboxError("Sandbox command timed out", 408, "SANDBOX_TIMEOUT")), timeoutMs);
    });
    const waitResult = await Promise.race([container.wait(), timeout]);
    const logs = await container.logs({ stdout: true, stderr: true });
    const output = logs.toString("utf8").slice(-OUTPUT_LIMIT);
    return { exitCode: waitResult.StatusCode ?? 1, output, timedOut: false, truncated: logs.length > OUTPUT_LIMIT };
  } catch (error) {
    if (container) {
      try { await container.kill(); } catch {}
    }
    throw ensureDockerError(error);
  } finally {
    clearTimeout(timeoutHandle);
    if (container) {
      try { await container.remove({ force: true }); } catch {}
    }
  }
}

export async function runReactSandboxCommand(projectId, args, options = {}) {
  if (!Array.isArray(args) || args.length === 0 || args.some((arg) => typeof arg !== "string")) {
    throw sandboxError("Invalid sandbox command", 400, "INVALID_SANDBOX_COMMAND");
  }
  return runOneShot(projectId, args, options);
}

export async function startReactSandbox(projectId, port, mode = "dev", callbacks = {}) {
  const current = activeSandboxes.get(projectId);
  if (current) return current;

  const { workspace } = await getProjectWorkspace(projectId);
  let container;
  try {
    await ensureImage();
    const nodeModulesVolume = await ensureProjectVolume(projectId);
    const npmScript = mode === "preview" ? "preview" : "dev";
    const launchScript = `if [ ! -d node_modules ]; then npm install --no-audit --no-fund || exit $?; fi; exec npm run ${npmScript} -- --host 0.0.0.0 --port ${CONTAINER_PORT}`;
    const containerOptions = {
      ...dockerOptions(workspace, port),
      name: `ccide-react-${projectId}`,
      Cmd: ["sh", "-lc", launchScript],
      HostConfig: {
        ...dockerOptions(workspace, port).HostConfig,
        Mounts: [{ Type: "volume", Source: nodeModulesVolume, Target: "/workspace/node_modules" }],
        AutoRemove: false,
      },
    };
    try {
      container = await docker.createContainer(containerOptions);
    } catch (error) {
      if (error.statusCode !== 409) throw error;
      await stopReactSandbox(projectId);
      container = await docker.createContainer(containerOptions);
    }
    await container.start();

    const record = { container, containerId: container.id, port, status: "starting", logs: [] };
    activeSandboxes.set(projectId, record);
    const logStream = await container.logs({ follow: true, stdout: true, stderr: true, timestamps: false });
    record.logStream = logStream;
    await new Promise((resolve, reject) => {
      let settled = false;
      const startupTimeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = sandboxError("The React server did not become ready in time. Check the project logs and try again.", 504, "PROJECT_START_TIMEOUT");
        reject(error);
      }, 120_000);

      logStream.on("data", (chunk) => {
        const line = chunk.toString("utf8");
        record.logs.push(line);
        if (record.logs.length > 500) record.logs.shift();
        if (/\bready in\b|\bLocal:\s*http/i.test(line)) {
          record.status = "running";
          if (!settled) {
            settled = true;
            clearTimeout(startupTimeout);
            resolve();
          }
        }
        callbacks.onLog?.(line);
      });
      logStream.on("end", () => {
        if (activeSandboxes.get(projectId) === record) {
          record.status = "stopped";
          activeSandboxes.delete(projectId);
        }
        callbacks.onExit?.();
        if (!settled) {
          settled = true;
          clearTimeout(startupTimeout);
          reject(sandboxError("The React server exited before it became ready. Check the project logs.", 500, "PROJECT_START_FAILED"));
        }
      });
      logStream.on("error", (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(startupTimeout);
        reject(ensureDockerError(error));
      });
    });
    return record;
  } catch (error) {
    if (container) {
      try { await container.remove({ force: true }); } catch {}
    }
    throw ensureDockerError(error);
  }
}

export async function stopReactSandbox(projectId) {
  const record = activeSandboxes.get(projectId);
  activeSandboxes.delete(projectId);
  try {
    const container = record?.container || docker.getContainer(`ccide-react-${projectId}`);
    const state = await container.inspect();
    if (state.State?.Running) await container.stop({ t: 3 });
    try { await container.remove({ force: true }); } catch {}
    return true;
  } catch (error) {
    // If container not found or Docker is not running/available, stopping is a clean no-op
    return false;
  }
}

export async function destroyReactSandbox(projectId) {
  await stopReactSandbox(projectId);
  try {
    await docker.getVolume(`ccide-node-modules-${projectId}`).remove();
  } catch (error) {
    if (error.statusCode !== 404) throw ensureDockerError(error);
  }
}

export function getReactSandbox(projectId) {
  return activeSandboxes.get(projectId) || null;
}
