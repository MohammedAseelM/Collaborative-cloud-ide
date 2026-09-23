// src/services/chat.service.js
// Responsibility: Encapsulate chat history API calls.

import api from "./api";

/**
 * Fetch historical messages for a project workspace.
 * @param {string} projectId
 * @returns {Promise<any>}
 */
export const fetchProjectMessages = async (projectId) => {
  const { data } = await api.get(`/projects/${projectId}/messages`);
  return data;
};
