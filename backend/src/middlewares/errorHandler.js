// src/middlewares/errorHandler.js
// Responsibility: Catch errors passed via next(err) and send a
// consistent, structured JSON error response to the client.

/* eslint-disable no-unused-vars */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode && err.statusCode !== 200 ? err.statusCode : 500;

  console.error(`[Error] ${req.method} ${req.originalUrl} -> ${err.message}`);
  if (err.stack) {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message: err.message || "An unexpected server error occurred.",
    error: err.message || "An unexpected server error occurred.",
    errorCode: err.errorCode || (statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED"),
    ...(process.env.NODE_ENV !== "production" ? { stack: err.stack } : {}),
  });
};

export default errorHandler;
