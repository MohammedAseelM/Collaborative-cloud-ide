// src/routes/health.routes.js
// Responsibility: Define routes related to server/system health checks.

import express from "express";
import { getHealthStatus } from "../controllers/health.controller.js";

const router = express.Router();

router.get("/", getHealthStatus);

export default router;
