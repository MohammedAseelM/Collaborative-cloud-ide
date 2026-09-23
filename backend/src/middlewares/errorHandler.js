// src/middlewares/errorHandler.js
// Responsibility: Catch errors passed via next(err) and send a
// consistent, structured JSON error response to the client.

/* eslint-disable no-unused-vars */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode && err.statusCode !== 200 ? err.statusCode : 500;

  console.error(`[Error] ${req.method} ${req.originalUrl} -> ${err.message}`);

  res.status(statusCode).json({
    success: false,
    message: err.message || "Internal Server Error",
    // Stack trace is only exposed in development for debugging purposes
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
};

export default errorHandler;
