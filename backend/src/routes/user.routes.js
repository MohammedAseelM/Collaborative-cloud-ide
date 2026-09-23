// src/routes/user.routes.js
// Responsibility: Register endpoints for user profile and account configuration.

import express from "express";
import {
  updateProfile,
  updatePassword,
  deleteAccount,
} from "../controllers/user.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// All user configuration endpoints require authentication
router.use(protect);

// @route  PUT /api/users/profile
// @desc   Update profile details (name and email)
router.put("/profile", updateProfile);

// @route  PUT /api/users/password
// @desc   Change user password
router.put("/password", updatePassword);

// @route  DELETE /api/users
// @desc   Delete user account
router.delete("/", deleteAccount);

export default router;
