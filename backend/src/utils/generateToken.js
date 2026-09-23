// src/utils/generateToken.js
// Responsibility: Sign a JWT for a given user ID and attach it to the
// response as an httpOnly cookie. Using an httpOnly cookie (rather than
// storing the token in localStorage) protects the token from being
// read or stolen via client-side JavaScript / XSS.

import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/**
 * Signs a JWT containing the user's ID and sets it as an httpOnly cookie
 * on the response.
 * @param {import('express').Response} res
 * @param {string} userId
 * @returns {string} the signed JWT (also returned in case the caller needs it)
 */
const generateToken = (res, userId) => {
  if (!env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not defined in environment variables");
  }

  const token = jwt.sign({ userId }, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
  });

  res.cookie("token", token, {
    httpOnly: true, // not accessible via client-side JS
    secure: env.NODE_ENV === "production", // HTTPS only in production
    sameSite: env.NODE_ENV === "production" ? "none" : "lax", // Cross-site cookies in production (Vercel -> Render)
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, in ms
  });

  return token;
};

export default generateToken;
