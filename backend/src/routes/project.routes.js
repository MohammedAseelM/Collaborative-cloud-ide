// src/routes/project.routes.js
// Responsibility: Register all project-related REST endpoints, including
// collaboration member management, code execution sandbox runs,
// version snapshot saving, and project activity timelines.

import express from "express";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject,
  addMember,
  removeMember,
  getMembers,
  toggleArchiveProject,
  toggleFavoriteProject,
  updateMemberRole,
} from "../controllers/project.controller.js";
import { createReactStarterProject } from "../controllers/reactStarter.controller.js";
import {
  createInvitation,
  getProjectInvitations,
} from "../controllers/invitation.controller.js";
import {
  createVersion,
  getVersions,
  restoreVersion,
} from "../controllers/version.controller.js";
import { getActivities } from "../controllers/activity.controller.js";
import { runCode } from "../controllers/run.controller.js";
import { getProjectMessages } from "../controllers/chat.controller.js";
import {
  installProjectDependencies,
  startProjectServer,
  stopProjectServer,
  getProjectServerStatus,
  getProjectServerLogs,
  getProjectPreviewUrl,
  executeProjectTerminalCommand,
} from "../controllers/runner.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import aiRoutes from "./ai.routes.js";
import { handleValidationErrors } from "../middlewares/validators/auth.validator.js";
import {
  createProjectValidationRules,
  updateProjectValidationRules,
  searchProjectsValidationRules,
} from "../middlewares/validators/project.validator.js";

const router = express.Router();

// Strict rate-limiter for code execution sandbox runs to prevent server overload
const runLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // Limit each IP to 15 execution runs per window
  message: {
    success: false,
    message: "Too many code execution runs from this IP, please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// All project routes require a logged-in user
router.use(protect);

// Prevent filenames such as "newpage.html" from reaching MongoDB ID queries.
router.param("id", (req, res, next, id) => {
  if (!mongoose.isValidObjectId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid project ID",
    });
  }
  return next();
});

// AI assistant for a project (membership is verified by the controller).
router.use(aiRoutes);

// Projects listing & creation
router
  .route("/")
  .get(searchProjectsValidationRules, handleValidationErrors, getProjects)
  .post(createProjectValidationRules, handleValidationErrors, createProject);

// Create a dedicated Vite + React starter from the workspace terminal.
// Keep this above the `/:id` route so "react-starter" is not treated as an ID.
router.post("/react-starter", createReactStarterProject);

// Single project access
router
  .route("/:id")
  .get(getProjectById)
  .patch(updateProjectValidationRules, handleValidationErrors, updateProject)
  .delete(deleteProject);

// Code Execution
router.post("/:id/run", runLimiter, runCode);

// Project Favorites & Archive toggles
router.patch("/:id/archive", toggleArchiveProject);
router.patch("/:id/favorite", toggleFavoriteProject);

// Collaboration Members Management
router.route("/:id/members")
  .get(getMembers)
  .post(addMember);

router.delete("/:id/members/:memberId", removeMember);
router.delete("/:id/member/:userId", removeMember);
router.patch("/:id/member/:userId/role", updateMemberRole);

// Project Invitations Management
router.route("/:id/invitations")
  .get(getProjectInvitations)
  .post(createInvitation);

// Version Snapshotting
router.route("/:id/versions")
  .get(getVersions)
  .post(createVersion);

router.post("/:id/versions/:versionId/restore", restoreVersion);

// Project Activities Timeline log
router.get("/:id/activities", getActivities);

// Project Chat History
router.get("/:id/messages", getProjectMessages);

// Full-App Dev Server Runner Endpoints
router.post("/:id/runner/install", installProjectDependencies);
router.post("/:id/runner/start", startProjectServer);
router.post("/:id/runner/stop", stopProjectServer);
router.get("/:id/runner/status", getProjectServerStatus);
router.get("/:id/runner/logs", getProjectServerLogs);
router.get("/:id/runner/preview-url", getProjectPreviewUrl);
router.post("/:id/terminal/execute", executeProjectTerminalCommand);

export default router;
