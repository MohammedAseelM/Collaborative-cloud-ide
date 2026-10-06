// src/routes/auth.routes.js
// Responsibility: Define all authentication-related REST endpoints and
// wire together validation -> controller -> (where needed) auth
// middleware, following REST conventions.

import express from "express";
import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";
import {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  forgotPassword,
  resetPassword,
  googleLogin,
} from "../controllers/auth.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import {
  registerValidationRules,
  loginValidationRules,
  forgotPasswordValidationRules,
  resetPasswordValidationRules,
  handleValidationErrors,
} from "../middlewares/validators/auth.validator.js";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 50 : 500,
  skip: () => env.NODE_ENV === "test" || process.env.NODE_ENV === "test",
  message: {
    success: false,
    message: "Too many authentication attempts from this IP, please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

// @route  POST /api/auth/register
router.post(
  "/register",
  authLimiter,
  registerValidationRules,
  handleValidationErrors,
  registerUser
);

// @route  POST /api/auth/login
router.post("/login", authLimiter, loginValidationRules, handleValidationErrors, loginUser);

// @route  POST /api/auth/logout
router.post("/logout", protect, logoutUser);

// @route  GET /api/auth/me
router.get("/me", protect, getMe);

// @route  POST /api/auth/forgot-password
router.post(
  "/forgot-password",
  forgotPasswordValidationRules,
  handleValidationErrors,
  forgotPassword
);

// @route  POST /api/auth/reset-password/:token
router.post(
  "/reset-password/:token",
  resetPasswordValidationRules,
  handleValidationErrors,
  resetPassword
);

// @route  POST /api/auth/google
router.post("/google", googleLogin);

export default router;
