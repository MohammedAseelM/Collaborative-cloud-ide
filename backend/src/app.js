

import express from "express";
import cors from "cors";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { env } from "./config/env.js";
import routes from "./routes/index.js";
import notFound from "./middlewares/notFound.js";
import errorHandler from "./middlewares/errorHandler.js";
import logger from "./utils/logger.js";

const app = express();

app.use(helmet());

app.use(compression());

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 1000 : 10000,
  skip: () => env.NODE_ENV === "test" || process.env.NODE_ENV === "test",
  message: {
    success: false,
    message: "Too many requests from this IP, please try again after 15 minutes",
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api", apiLimiter);

const allowedOrigins = (env.CLIENT_URL || "")
  .split(",")
  .map((url) => url.trim())
  .concat(["http://localhost:5173", "http://localhost:3000", "http://localhost:80", "http://localhost"])
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || origin.endsWith(".vercel.app")) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

// Parse incoming JSON payloads
app.use(express.json());

// Parse URL-encoded payloads (e.g. form submissions)
app.use(express.urlencoded({ extended: true }));

// Parse cookies attached to incoming requests (needed to read the
// httpOnly JWT cookie set during login/registration)
app.use(cookieParser());

// Pipe HTTP request logs to Winston logger
const morganStream = {
  write: (message) => logger.info(message.trim()),
};
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev", { stream: morganStream }));

// ---------- Routes ----------

// Simple root route to confirm the API is reachable
app.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Collaborative Cloud IDE API is running",
  });
});

// All feature routes are mounted under /api
app.use("/api", routes);

// ---------- Error Handling ----------

// Handles unmatched routes (must come after all valid routes)
app.use(notFound);

// Centralized error handler (must be the last middleware)
app.use(errorHandler);

export default app;
