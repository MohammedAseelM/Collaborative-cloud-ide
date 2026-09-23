import Docker from "dockerode";
import { env } from "../config/env.js";
import logger from "../utils/logger.js";
import path from "path";

const docker = new Docker();

export const startSandbox = async (projectId, userId) => {
  const containerName = `sandbox_${projectId}`;
  const workspacePath = path.join(env.WORKSPACE_ROOT, userId.toString(), projectId.toString());
  
  try {
    const container = await docker.createContainer({
      Image: "node:18",
      Cmd: ["tail", "-f", "/dev/null"],
      name: containerName,
      HostConfig: {
        Binds: [`${workspacePath}:/workspace`],
        Memory: 256 * 1024 * 1024, // 256MB
      },
      WorkingDir: "/workspace"
    });
    
    await container.start();
    logger.info(`Started sandbox container ${containerName}`);
    return container;
  } catch (error) {
    if (error.statusCode === 409) {
      logger.info(`Sandbox ${containerName} already running.`);
      return docker.getContainer(containerName);
    }
    throw error;
  }
};

export const createTerminalSession = async (container, socket) => {
  try {
    const exec = await container.exec({
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
      Cmd: ["/bin/sh"]
    });

    const stream = await exec.start({ hijack: true, stdin: true });
    
    socket.on("terminal:input", (data) => {
      stream.write(data);
    });
    
    stream.on("data", (chunk) => {
      socket.emit("terminal:output", chunk.toString('utf-8'));
    });

  } catch (error) {
    logger.error("Terminal session error:", error);
  }
};
