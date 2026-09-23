// src/routes/compiler.routes.js
// Responsibility: Expose execution endpoints for standalone online compiler playground.

import express from "express";
import { runStandaloneCode } from "../controllers/compiler.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import rateLimit from "express-rate-limit";

// Capping standalone playground execution at 15 runs per 15-minute window
const runRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    success: false,
    stdout: "",
    stderr: "Too many compilation runs from this IP. Please wait 15 minutes.",
    compileError: "",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

// Standalone execution runs require user authentication
router.post("/run", protect, runRateLimiter, runStandaloneCode);

export default router;
