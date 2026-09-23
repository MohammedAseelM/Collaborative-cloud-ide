// src/controllers/reactProjectController.js
// Responsibility: Expose REST endpoints for the React Project Command System,
// verifying RBAC permissions and delegating to reactProjectService.

import { findMemberProjectOrThrow, verifyProjectPermission } from "./project.controller.js";
import { runCode } from "./run.controller.js";
import {
  createReactProject,
  installReactDependencies,
  runReactProject,
  stopReactProject,
  restartReactProject,
  buildReactProject,
  deleteReactProject,
  resetReactProject,
  installPackage,
  uninstallPackage,
  updatePackages,
  previewReactProject,
  getAvailableScripts,
  runProjectScript,
  getNodeVersion,
  getNpmVersion,
} from "../services/reactProjectService.js";

/**
 * @route   POST /api/projects/react/create
 * @desc    Scaffold a new Vite + React project
 * @access  Private
 */
export const createReactProjectHandler = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const io = req.app.get("io");

    const result = await createReactProject({
      userId: req.user._id,
      name,
      description,
      io,
    });

    res.status(201).json({
      success: true,
      message: `React project "${result.project.name}" created successfully.`,
      project: result.project,
      files: result.files,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/install
 * @desc    Install npm dependencies
 * @access  Private (Owner, Admin, Editor)
 */
export const installDependenciesHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const result = await installReactDependencies(projectId, io);

    res.status(200).json({
      success: result.success,
      message: result.success ? "Dependencies installed successfully" : "Failed to install dependencies",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/run
 * @desc    Launch React dev server (npm run dev)
 * @access  Private (Owner, Admin, Editor)
 */
export const runProjectHandler = async (req, res, next) => {
  try {
    if (req.body && typeof req.body.code === "string") {
      req.params.id = req.params.id || req.params.projectId;
      return runCode(req, res, next);
    }
    const { projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const result = await runReactProject(projectId, req.user, io);

    res.status(200).json({
      success: true,
      message: `Dev server started on port ${result.port}`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/stop
 * @desc    Stop running React dev server
 * @access  Private (Owner, Admin, Editor)
 */
export const stopProjectHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const result = await stopReactProject(projectId, req.user, io);

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
 * @route   POST /api/projects/:projectId/restart
 * @desc    Restart React dev server
 * @access  Private (Owner, Admin, Editor)
 */
export const restartProjectHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const result = await restartReactProject(projectId, req.user, io);

    res.status(200).json({
      success: true,
      message: `Dev server restarted on port ${result.port}`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/build
 * @desc    Build React project for production (npm run build)
 * @access  Private (Owner, Admin, Editor)
 */
export const buildProjectHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const result = await buildReactProject(projectId, io);

    res.status(200).json({
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? "Project built successfully" : "Project build failed",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/projects/:projectId/react
 * @desc    Delete React project
 * @access  Private (Owner only)
 */
export const deleteProjectHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Owner");

    const io = req.app.get("io");
    const result = await deleteReactProject(projectId, req.user._id, io);

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/reset
 * @desc    Reset project to original React template
 * @access  Private (Owner only)
 */
export const resetProjectHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Owner");

    const io = req.app.get("io");
    const result = await resetReactProject(projectId, req.user._id, io);

    res.status(200).json({
      success: true,
      message: "Project restored to original React template state.",
      project: result.project,
      files: result.files,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/packages/install
 * @desc    Install a package (npm install <pkg>)
 * @access  Private (Owner, Admin, Editor)
 */
export const installPackageHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { packageName, version } = req.body;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const result = await installPackage(projectId, packageName, version, io);

    res.status(200).json({
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? `Package "${packageName}" installed successfully` : `Failed to install package "${packageName}"`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/packages/uninstall
 * @desc    Uninstall a package (npm uninstall <pkg>)
 * @access  Private (Owner, Admin, Editor)
 */
export const uninstallPackageHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { packageName } = req.body;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const result = await uninstallPackage(projectId, packageName, io);

    res.status(200).json({
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? `Package "${packageName}" removed successfully` : `Failed to remove package "${packageName}"`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/packages/update
 * @desc    Update project packages (npm update)
 * @access  Private (Owner, Admin, Editor)
 */
export const updatePackagesHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const result = await updatePackages(projectId, io);

    res.status(200).json({
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? "Dependencies updated successfully" : "Failed to update dependencies",
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/preview
 * @desc    Launch Vite production preview server (npm run preview)
 * @access  Private (Owner, Admin, Editor)
 */
export const previewProjectHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const result = await previewReactProject(projectId, req.user, io);

    res.status(200).json({
      success: true,
      message: `Production preview server started on port ${result.port}`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:projectId/scripts
 * @desc    Get available npm scripts from package.json
 * @access  Private (Project members)
 */
export const getScriptsHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    await findMemberProjectOrThrow(projectId, req.user._id);

    const result = await getAvailableScripts(projectId);
    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/scripts/run
 * @desc    Execute a specific npm script
 * @access  Private (Owner, Admin, Editor)
 */
export const runScriptHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { scriptName } = req.body;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const io = req.app.get("io");
    const result = await runProjectScript(projectId, scriptName, io);

    res.status(200).json({
      success: result.exitCode === 0,
      message: result.exitCode === 0 ? `Script "${scriptName}" finished successfully` : `Script "${scriptName}" exited with error`,
      ...result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:projectId/node-version
 * @desc    Check runtime Node.js version
 * @access  Private (Project members)
 */
export const getNodeVersionHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    await findMemberProjectOrThrow(projectId, req.user._id);

    const result = await getNodeVersion(projectId);
    res.status(200).json({
      success: true,
      version: result.version,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:projectId/npm-version
 * @desc    Check runtime npm version
 * @access  Private (Project members)
 */
export const getNpmVersionHandler = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    await findMemberProjectOrThrow(projectId, req.user._id);

    const result = await getNpmVersion(projectId);
    res.status(200).json({
      success: true,
      version: result.version,
    });
  } catch (error) {
    next(error);
  }
};

