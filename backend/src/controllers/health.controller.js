// src/controllers/health.controller.js
// Responsibility: Handle logic for the health-check endpoint.
// Used to verify that the server (and later, DB connectivity) is alive.

import mongoose from "mongoose";

/**
 * @route   GET /api/health
 * @desc    Returns server status, uptime, and DB connection state
 * @access  Public
 */
export const getHealthStatus = async (req, res, next) => {
  try {
    const dbStates = ["disconnected", "connected", "connecting", "disconnecting"];

    res.status(200).json({
      success: true,
      message: "Server is up and running",
      uptimeSeconds: process.uptime().toFixed(2),
      timestamp: new Date().toISOString(),
      database: dbStates[mongoose.connection.readyState] || "unknown",
    });
  } catch (error) {
    next(error);
  }
};
