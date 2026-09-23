// src/config/env.js
// Responsibility: Load and centralize access to environment variables.
// Other modules should import `env` from here instead of using
// process.env directly, so that all config values live in one place.

import dotenv from "dotenv";

dotenv.config({ quiet: true });

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: process.env.PORT || 5000,
  HOST: process.env.HOST || "0.0.0.0",
  MONGO_URI: process.env.MONGO_URI,
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:5173",

  // Reserved for upcoming phases (JWT auth, Redis, etc.)
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  REDIS_URL: process.env.REDIS_URL,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  PUBLIC_HOST: process.env.PUBLIC_HOST || null,

  // AI assistant settings. Keep the API key on the server; never expose it
  // through Vite environment variables or browser code.
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-5.6",

  WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || (process.platform === 'win32' ? 'C:\\workspace' : '/workspace'),
};

