// src/routes/compiler.routes.js
// Responsibility: Expose execution endpoints for standalone online compiler playground.

import express from "express";
import { runStandaloneCode } from "../controllers/compiler.controller.js";
import { optionalProtect } from "../middlewares/auth.middleware.js";
import rateLimit from "express-rate-limit";

// Capping standalone playground execution at 30 runs per 15-minute window
const runRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: "Too many compilation runs from this IP. Please wait 15 minutes.",
    stdout: "",
    stderr: "Too many compilation runs from this IP. Please wait 15 minutes.",
    compileError: "",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const router = express.Router();

// Standalone execution runs in online compiler playground
router.post("/run", optionalProtect, runRateLimiter, runStandaloneCode);

export default router;
