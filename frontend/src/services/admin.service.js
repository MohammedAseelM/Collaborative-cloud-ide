// src/services/admin.service.js
// Responsibility: Encapsulate administrator configuration and log inspection API calls.

import api from "./api";

/**
 * Fetch platform and system diagnostics.
 * @returns {Promise<any>}
 */
export const fetchAdminStats = async () => {
  const { data } = await api.get("/admin/stats");
  return data;
};

/**
 * Fetch users registered on the platform.
 * @param {string} search
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<any>}
 */
export const fetchAdminUsers = async (search = "", page = 1, limit = 10) => {
  const { data } = await api.get("/admin/users", {
    params: { search, page, limit },
  });
  return data;
};

/**
 * Force delete a user account and their resources.
 * @param {string} userId
 * @returns {Promise<any>}
 */
export const adminDeleteUserRequest = async (userId) => {
  const { data } = await api.delete(`/admin/users/${userId}`);
  return data;
};

/**
 * Fetch all projects active on the platform.
 * @param {string} search
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<any>}
 */
export const fetchAdminProjects = async (search = "", page = 1, limit = 10) => {
  const { data } = await api.get("/admin/projects", {
    params: { search, page, limit },
  });
  return data;
};

/**
 * Force delete a project and clean up files.
 * @param {string} projectId
 * @returns {Promise<any>}
 */
export const adminDeleteProjectRequest = async (projectId) => {
  const { data } = await api.delete(`/admin/projects/${projectId}`);
  return data;
};

/**
 * Fetch combined daily Winston logs.
 * @returns {Promise<any>}
 */
export const fetchAdminLogs = async () => {
  const { data } = await api.get("/admin/logs");
  return data;
};
