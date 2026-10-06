// src/services/portManager.js
// Responsibility: Manage dynamic TCP port allocation and mapping for project execution.

import net from "net";
import logger from "../utils/logger.js";

const projectPorts = new Map();
const portToProject = new Map();

/**
 * Checks if a specific TCP port is open and available on 127.0.0.1.
 */
export const isPortAvailable = (port) => {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
};

/**
 * Finds an available open TCP port starting from a preferred port number.
 */
export const findAvailablePort = async (startPort = 5173) => {
  let port = startPort;
  while (port < 65535) {
    if (!Array.from(projectPorts.values()).includes(port)) {
      const available = await isPortAvailable(port);
      if (available) {
        return port;
      }
    }
    port++;
  }
  throw new Error("No available TCP ports found in range.");
};

/**
 * Allocates or reuses a port for a given project.
 */
export const allocatePortForProject = async (projectId, preferredPort = 5173) => {
  const existingPort = projectPorts.get(projectId);
  if (existingPort) {
    const isStillAvailable = await isPortAvailable(existingPort);
    if (!isStillAvailable) {
      // Port is currently bound and active
      return existingPort;
    }
  }

  const allocatedPort = await findAvailablePort(preferredPort);
  projectPorts.set(projectId, allocatedPort);
  portToProject.set(allocatedPort, projectId);
  logger.info(`[PORT] Allocated port ${allocatedPort} for project ${projectId}`);
  return allocatedPort;
};

/**
 * Retrieves the allocated port for a project.
 */
export const getProjectPort = (projectId) => {
  return projectPorts.get(projectId) || null;
};

/**
 * Releases port allocation for a project.
 */
export const releaseProjectPort = (projectId) => {
  const port = projectPorts.get(projectId);
  if (port) {
    projectPorts.delete(projectId);
    portToProject.delete(port);
    logger.info(`[PORT] Released port ${port} for project ${projectId}`);
  }
};
