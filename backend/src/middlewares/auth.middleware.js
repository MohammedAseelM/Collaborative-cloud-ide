// src/middlewares/auth.middleware.js
// Responsibility: Verify a JWT (from either an httpOnly cookie or an
// Authorization header) and attach the corresponding user to the
// request object. Used to guard any route that requires a logged-in user.

import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { env } from "../config/env.js";

/**
 * Express middleware that protects a route by requiring a valid JWT.
 * Accepts the token either from the "token" cookie (preferred) or from
 * an "Authorization: Bearer <token>" header (useful for non-browser
 * clients or tools like Postman).
 */
export const protect = async (req, res, next) => {
  try {
    let token;

    if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    } else if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      const error = new Error("Not authorized, no token provided");
      error.statusCode = 401;
      throw error;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (jwtError) {
      const error = new Error("Not authorized, token is invalid or expired");
      error.statusCode = 401;
      throw error;
    }

    // Fetch the user without the password field and attach to req
    const user = await User.findById(decoded.userId);

    if (!user) {
      const error = new Error("Not authorized, user no longer exists");
      error.statusCode = 401;
      throw error;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};
