// src/middlewares/errorHandler.js
// Responsibility: Catch errors passed via next(err) and send a
// consistent, structured JSON error response to the client.

/* eslint-disable no-unused-vars */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode && err.statusCode !== 200 ? err.statusCode : 500;

  console.error(`[Error] ${req.method} ${req.originalUrl} -> ${err.message}`);

  res.status(statusCode).json({
    success: false,
    message: err.expose || statusCode < 500
      ? err.message || "Request failed"
      : "An unexpected server error occurred.",
    errorCode: err.errorCode || (statusCode >= 500 ? "INTERNAL_SERVER_ERROR" : "REQUEST_FAILED"),
  });
};

export default errorHandler;
