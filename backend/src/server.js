// src/server.js
// Responsibility: Application entry point. Connects to the database,
// initializes Socket.io, and starts the HTTP server.

import http from "http";
import { Server } from "socket.io";
import app from "./app.js";
import connectDB from "./config/db.js";
import { env } from "./config/env.js";
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

    const allowedOrigins = (env.CLIENT_URL || "")
      .split(",")
      .map((url) => url.trim())
      .concat(["http://localhost:5173", "http://localhost:3000", "http://localhost:80", "http://localhost"])
      .filter(Boolean);

    const io = new Server(server, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
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

process.on("unhandledRejection", (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});
