// tests/test_helper.js
// Responsibility: Shared testing helper utilities.

import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { env } from "../src/config/env.js";

/**
 * Clear all collections in the active mongoose database connection.
 */
export const clearDatabase = async () => {
  if (mongoose.connection.readyState === 0) return;
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
};

/**
 * Generate a signed JWT authorization cookie for a user.
 */
export const getAuthCookie = (userId) => {
  const token = jwt.sign({ userId: userId }, env.JWT_SECRET || "testsecret", { expiresIn: "1h" });
  return `token=${token}`;
};
