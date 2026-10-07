// src/server.js
// Responsibility: Application entry point. Connects to the database,
// initializes Socket.io, and starts the HTTP server.

import http from "http";
import mongoose from "mongoose";
import { Server } from "socket.io";
import app from "./app.js";
import connectDB from "./config/db.js";
import { env } from "./config/env.js";
import User from "./models/user.model.js";
import { registerSocketHandlers } from "./sockets/projectSocket.js";
import logger from "./utils/logger.js";

const PORT = env.PORT;
const HOST = env.HOST || "0.0.0.0";

// Create HTTP server wrapping the Express app.
const server = http.createServer(app);

const startServer = async () => {
  try {
    // 1. Connect to MongoDB before accepting traffic
    await connectDB();

    // Ensure Demo Developer account exists for instant testing
    try {
      const demoExists = await User.findOne({ email: "developer@ide.local" });
      if (!demoExists) {
        await User.create({
          name: "Demo Developer",
          email: "developer@ide.local",
          password: "password123",
          role: "admin",
        });
        logger.info("Demo developer account created (developer@ide.local)");
      }
    } catch (seedErr) {
      logger.warn(`Demo user seed skipped: ${seedErr.message}`);
    }

    const allowedOrigins = (env.CLIENT_URL || "")
      .split(",")
      .map((url) => url.trim())
      .concat([
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:80",
        "http://localhost",
        "https://collaborative-cloud-ide.vercel.app",
      ])
      .filter(Boolean);

    const io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (
            !origin ||
            allowedOrigins.includes(origin) ||
            origin.endsWith(".vercel.app") ||
            /^http:\/\/localhost(:\d+)?$/.test(origin) ||
            /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)
          ) {
            return callback(null, true);
          }
          return callback(null, true);
        },
        credentials: true,
      },
    });
    app.set("io", io);
    registerSocketHandlers(io);

    // 3. Start listening for requests on all network interfaces (localhost and network IP)
    server.listen(PORT, HOST, () => {
      logger.info(`Server running in ${env.NODE_ENV} mode on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    logger.error("Failed to start server: %s", error.message);
    process.exit(1);
  }
};

startServer();

const gracefulShutdown = async (signal) => {
  logger.info(`[SERVER] Received ${signal}. Initiating graceful shutdown...`);
  server.close(async () => {
    logger.info("[SERVER] HTTP server closed.");
    try {
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
        logger.info("[DATABASE] MongoDB connection closed.");
      }
    } catch (err) {
      logger.error(`[DATABASE] Error closing database connection: ${err.message}`);
    }
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("[SERVER] Graceful shutdown timeout exceeded. Terminating process.");
    process.exit(1);
  }, 10000);
};

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});
