// src/routes/task.routes.js
// Responsibility: Routes for project task assignments and status updates.

import express from "express";
import { protect } from "../middlewares/auth.middleware.js";
import {
  getProjectTasks,
  createProjectTask,
  updateTaskStatus,
  deleteTask,
} from "../controllers/task.controller.js";

const router = express.Router({ mergeParams: true });

router.use(protect);

router.route("/:projectId/tasks")
  .get(getProjectTasks)
  .post(createProjectTask);

router.route("/:projectId/tasks/:taskId/status")
  .patch(updateTaskStatus);

router.route("/:projectId/tasks/:taskId")
  .delete(deleteTask);

export default router;
