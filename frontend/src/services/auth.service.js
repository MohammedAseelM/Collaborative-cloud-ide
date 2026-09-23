// src/services/auth.service.js
// Responsibility: Encapsulate all Axios calls related to authentication.
// Components/context should call these functions instead of using
// axios/api directly.

import api from "./api";

/**
 * Registers a new user.
 * @param {{ name: string, email: string, password: string }} payload
 */
export const registerRequest = async (payload) => {
  const { data } = await api.post("/auth/register", payload);
  return data;
};

/**
 * Logs in an existing user.
 * @param {{ email: string, password: string }} payload
 */
export const loginRequest = async (payload) => {
  const { data } = await api.post("/auth/login", payload);
  return data;
};

/**
 * Logs out the current user (clears the httpOnly cookie server-side).
 */
export const logoutRequest = async () => {
  const { data } = await api.post("/auth/logout");
  return data;
};

/**
 * Fetches the currently authenticated user's profile.
 * Used on app load to check whether an existing session is still valid.
 */
export const fetchCurrentUser = async () => {
  const { data } = await api.get("/auth/me");
  return data;
};

/**
 * Sends a password reset email request.
 * @param {string} email
 */
export const forgotPasswordRequest = async (email) => {
  const { data } = await api.post("/auth/forgot-password", { email });
  return data;
};

/**
 * Resets the password using a reset token.
 * @param {string} token
 * @param {string} password
 */
export const resetPasswordRequest = async (token, password) => {
  const { data } = await api.post(`/auth/reset-password/${token}`, { password });
  return data;
};

/**
 * Log in / Sign up with Google OAuth ID token.
 * @param {string} idToken
 */
export const googleLoginRequest = async (idToken) => {
  const { data } = await api.post("/auth/google", { idToken });
  return data;
};
