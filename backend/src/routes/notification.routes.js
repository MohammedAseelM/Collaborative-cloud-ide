// src/routes/notification.routes.js
// Responsibility: Register endpoints for listing and updating user notifications.

import express from "express";
import {
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from "../controllers/notification.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Require authentication for all notifications endpoints
router.use(protect);

// @route  GET /api/notifications
// @desc   List user notifications
router.get("/", getUserNotifications);

// @route  PATCH /api/notifications/read-all
// @desc   Mark all user notifications as read
router.patch("/read-all", markAllNotificationsRead);

// @route  PATCH /api/notifications/:id/read
// @desc   Mark a single notification as read
router.patch("/:id/read", markNotificationRead);

export default router;
