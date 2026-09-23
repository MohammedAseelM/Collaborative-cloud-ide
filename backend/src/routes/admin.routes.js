// src/routes/admin.routes.js
// Responsibility: Register endpoints for admin stats, user/project listings, deletions, and log retrievals.

import express from "express";
import {
  getStats,
  listUsers,
  adminDeleteUser,
  listProjects,
  adminDeleteProject,
  getLogs,
} from "../controllers/admin.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import { adminProtect } from "../middlewares/admin.middleware.js";

const router = express.Router();

// Enforce both general authentication and admin role permissions
router.use(protect);
router.use(adminProtect);

// @route  GET /api/admin/stats
// @desc   Get system stats & info
router.get("/stats", getStats);

// @route  GET /api/admin/users
// @desc   List all user profiles
// @route  DELETE /api/admin/users/:id
// @desc   Delete a user profile and clean up
router.route("/users")
  .get(listUsers);

router.delete("/users/:id", adminDeleteUser);

// @route  GET /api/admin/projects
// @desc   List all project profiles
// @route  DELETE /api/admin/projects/:id
// @desc   Delete a project and clean up
router.route("/projects")
  .get(listProjects);

router.delete("/projects/:id", adminDeleteProject);

// @route  GET /api/admin/logs
// @desc   View Winston logs
router.get("/logs", getLogs);

export default router;
