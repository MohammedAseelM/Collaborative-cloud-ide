// src/routes/reactProjectRoutes.js
// Responsibility: Route mapping for the React Project Command System.

import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  createReactProjectHandler,
  installDependenciesHandler,
  runProjectHandler,
  stopProjectHandler,
  restartProjectHandler,
  buildProjectHandler,
  deleteProjectHandler,
  resetProjectHandler,
  installPackageHandler,
  uninstallPackageHandler,
  updatePackagesHandler,
  previewProjectHandler,
  getScriptsHandler,
  runScriptHandler,
  getNodeVersionHandler,
  getNpmVersionHandler,
} from "../controllers/reactProjectController.js";

const router = express.Router();

// Guard all React command endpoints with authentication
router.use(protect);

// 1. Create React Project
router.post("/react/create", createReactProjectHandler);

// 2. Lifecycle Management
router.post("/:projectId/install", installDependenciesHandler);
router.post("/:projectId/run", runProjectHandler);
router.post("/:projectId/stop", stopProjectHandler);
router.post("/:projectId/restart", restartProjectHandler);
router.post("/:projectId/build", buildProjectHandler);
router.post("/:projectId/preview", previewProjectHandler);

// 3. Project Reset & Delete
router.post("/:projectId/reset", resetProjectHandler);
router.delete("/:projectId/react", deleteProjectHandler);

// 4. Package Management
router.post("/:projectId/packages/install", installPackageHandler);
router.post("/:projectId/packages/uninstall", uninstallPackageHandler);
router.post("/:projectId/packages/update", updatePackagesHandler);

// 5. Scripts & Runtime Environment Info
router.get("/:projectId/scripts", getScriptsHandler);
router.post("/:projectId/scripts/run", runScriptHandler);
router.get("/:projectId/node-version", getNodeVersionHandler);
router.get("/:projectId/npm-version", getNpmVersionHandler);

export default router;

