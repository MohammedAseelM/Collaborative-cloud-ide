// src/services/user.service.js
// Responsibility: Encapsulate profile management and configuration REST calls.

import api from "./api";

/**
 * Update the user's profile details.
 * @param {{ name?: string, email?: string }} payload
 * @returns {Promise<any>}
 */
export const updateProfileRequest = async (payload) => {
  const { data } = await api.put("/users/profile", payload);
  return data;
};

/**
 * Update the user's password.
 * @param {{ currentPassword, newPassword }} payload
 * @returns {Promise<any>}
 */
export const updatePasswordRequest = async (payload) => {
  const { data } = await api.put("/users/password", payload);
  return data;
};

/**
 * Delete the logged-in user's account (cascading cleanup).
 * @returns {Promise<any>}
 */
export const deleteAccountRequest = async () => {
  const { data } = await api.delete("/users");
  return data;
};
