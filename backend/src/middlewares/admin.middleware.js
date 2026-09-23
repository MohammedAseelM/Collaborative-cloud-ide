// src/middlewares/admin.middleware.js
// Responsibility: Restrict endpoint access to users with an 'admin' role.

export const adminProtect = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    const error = new Error("Access denied. Administrator privileges required.");
    error.statusCode = 403;
    next(error);
  }
};
