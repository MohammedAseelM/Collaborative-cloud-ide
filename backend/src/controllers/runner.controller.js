// src/controllers/runner.controller.js
// Responsibility: Expose REST endpoints for launching full-app development servers,
// running dependency installations, retrieving status, and fetching live preview URLs.

import { findMemberProjectOrThrow, verifyProjectPermission } from "./project.controller.js";
import {
  installDependencies,
  startDevServer,
  stopDevServer,
  getDevServerStatus,
  runProjectTerminalCommand,
} from "../services/projectRunner.service.js";
import Activity from "../models/activity.model.js";
import {
  acquireProjectEditLock,
  assertProjectLockOwner,
  getProjectEditLock,
  releaseProjectEditLock,
} from "../services/projectEditLock.service.js";

/**
 * @route   POST /api/projects/:id/install
 * @desc    Trigger dependency installation (e.g. npm install) for a project
 * @access  Private (members with Editor permission)
 */
export const installProjectDependencies = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const success = await installDependencies(projectId, io);

    await Activity.create({
      project: projectId,
      user: req.user._id,
      type: "RUN",
      details: { action: "install_dependencies", success },
    });

    res.status(200).json({
      success,
      message: success ? "Dependencies installed successfully" : "Dependency installation failed",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:id/start
 * @desc    Launch dev server (npm run dev, python app.py, etc.) on an allocated port
 * @access  Private (members with Editor permission)
 */
export const startProjectServer = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    acquireProjectEditLock(projectId, req.user, "running the development server", io);
    let result;
    try {
      result = await startDevServer(projectId, io);
    } catch (error) {
      releaseProjectEditLock(projectId, req.user, io);
      throw error;
    }

    await Activity.create({
      project: projectId,
      user: req.user._id,
      type: "RUN",
      details: { action: "start_dev_server", port: result.port },
    });

    res.status(200).json({
      success: true,
      message: `Development server started on port ${result.port}`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:id/stop
 * @desc    Stop active dev server process for a project
 * @access  Private (members with Editor permission)
 */
export const stopProjectServer = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    assertProjectLockOwner(projectId, req.user);
    const result = await stopDevServer(projectId, io);

    await Activity.create({
      project: projectId,
      user: req.user._id,
      type: "RUN",
      details: { action: "stop_dev_server" },
    });

    res.status(200).json({
      success: true,
      message: "Development server stopped",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:id/status
 * @desc    Get active dev server status, allocated port, and project type
 * @access  Private (members only)
 */
export const getProjectServerStatus = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    await findMemberProjectOrThrow(projectId, req.user._id);

    const statusData = await getDevServerStatus(projectId);

    res.status(200).json({
      success: true,
      ...statusData,
      editLock: getProjectEditLock(projectId),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:id/logs
 * @desc    Fetch historical terminal logs for dev server
 * @access  Private (members only)
 */
export const getProjectServerLogs = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    await findMemberProjectOrThrow(projectId, req.user._id);

    const statusData = await getDevServerStatus(projectId);

    res.status(200).json({
      success: true,
      logs: statusData.logs || [],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:id/preview-url
 * @desc    Get active live preview iframe URL
 * @access  Private (members only)
 */
export const getProjectPreviewUrl = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    await findMemberProjectOrThrow(projectId, req.user._id);

    const statusData = await getDevServerStatus(projectId);

    res.status(200).json({
      success: true,
      previewUrl: statusData.previewUrl,
      port: statusData.devServerPort,
      serverStatus: statusData.serverStatus,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route POST /api/projects/:id/terminal/execute
 * @desc Run one development command from the project's command terminal.
 * @access Private (members with Editor permission)
 */
export const executeProjectTerminalCommand = async (req, res, next) => {
  try {
    const { id: projectId } = req.params;
    const { command } = req.body;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    // Dev servers intentionally use the existing managed runner so they can
    // continue in the background and appear in the live preview.
    if (/^npm\s+(run\s+dev|start)\s*$/i.test((command || "").trim())) {
      const io = req.app.get("io");
      acquireProjectEditLock(projectId, req.user, "running the development server", io);
      let result;
      try {
        result = await startDevServer(projectId, io);
      } catch (error) {
        releaseProjectEditLock(projectId, req.user, io);
        throw error;
      }
      return res.status(200).json({
        success: true,
        serverStarted: true,
        exitCode: 0,
        output: `Development server started on port ${result.port}.`,
        ...result,
      });
    }

    const result = await runProjectTerminalCommand(projectId, command);
    await Activity.create({
      project: projectId,
      user: req.user._id,
      type: "RUN",
      details: { action: "terminal_command", command: command?.slice(0, 200), exitCode: result.exitCode },
    });

    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    return next(error);
  }
};
