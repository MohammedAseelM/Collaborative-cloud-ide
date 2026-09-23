// src/services/project.service.js
// Responsibility: Encapsulate all Axios API requests related to projects,
// members, sandbox compilation, snapshots, and activity timeline.

import api from "./api";

/**
 * Fetches the current user's projects, supporting pagination and search.
 */
export const fetchProjects = async (search = "", page = 1, limit = 6, favorite = false, archived = false, sortBy = "updatedAt") => {
  const { data } = await api.get("/projects", {
    params: {
      search,
      page,
      limit,
      favorite: favorite ? "true" : undefined,
      archived: archived ? "true" : undefined,
      sortBy,
    },
  });
  return data;
};

/**
 * Creates a new project.
 */
export const createProjectRequest = async (payload) => {
  const { data } = await api.post("/projects", payload);
  return data;
};

/**
 * Creates a standalone Vite + React starter project.
 */
export const createReactStarterRequest = async (name) => {
  const { data } = await api.post("/projects/react-starter", { name });
  return data;
};

/**
 * Fetches a single project by ID (including latest code content).
 */
export const fetchProjectById = async (projectId) => {
  const { data } = await api.get(`/projects/${projectId}`);
  return data;
};

/**
 * Updates a project's metadata.
 */
export const updateProjectRequest = async (projectId, payload) => {
  const { data } = await api.patch(`/projects/${projectId}`, payload);
  return data;
};

/**
 * Deletes a project by ID.
 */
export const deleteProjectRequest = async (projectId) => {
  const { data } = await api.delete(`/projects/${projectId}`);
  return data;
};

/**
 * Fetches collaborators list of a project.
 */
export const fetchMembers = async (projectId) => {
  const { data } = await api.get(`/projects/${projectId}/members`);
  return data;
};

/**
 * Invites a collaborator to the project by email.
 */
export const addMemberRequest = async (projectId, email) => {
  const { data } = await api.post(`/projects/${projectId}/members`, { email });
  return data;
};

/**
 * Removes a collaborator from the project (or leaves the project).
 */
export const removeMemberRequest = async (projectId, memberId) => {
  const { data } = await api.delete(`/projects/${projectId}/member/${memberId}`);
  return data;
};

/**
 * Updates a collaborator's role in the project.
 */
export const updateMemberRoleRequest = async (projectId, memberId, role) => {
  const { data } = await api.patch(`/projects/${projectId}/member/${memberId}/role`, { role });
  return data;
};

/**
 * Fetches list of all saved code snapshots.
 */
export const fetchVersions = async (projectId) => {
  const { data } = await api.get(`/projects/${projectId}/versions`);
  return data;
};

/**
 * Creates a new code snapshot version.
 */
export const saveVersionRequest = async (projectId, description) => {
  const { data } = await api.post(`/projects/${projectId}/versions`, { description });
  return data;
};

/**
 * Restores project code to a previous snapshot state.
 */
export const restoreVersionRequest = async (projectId, versionId) => {
  const { data } = await api.post(`/projects/${projectId}/versions/${versionId}/restore`);
  return data;
};

/**
 * Fetches recent activity timeline logs for the project.
 */
export const fetchActivities = async (projectId) => {
  const { data } = await api.get(`/projects/${projectId}/activities`);
  return data;
};

/**
 * Runs code in secure sandbox.
 */
export const runCodeRequest = async (projectId, code, input, language) => {
  const { data } = await api.post(`/projects/${projectId}/run`, { code, input, language });
  return data;
};

/**
 * Toggle favorite status of a project.
 */
export const toggleFavoriteRequest = async (projectId) => {
  const { data } = await api.patch(`/projects/${projectId}/favorite`);
  return data;
};

/**
 * Toggle archive status of a project.
 */
export const toggleArchiveRequest = async (projectId) => {
  const { data } = await api.patch(`/projects/${projectId}/archive`);
  return data;
};

/**
 * Runs standalone play code in online compiler.
 */
export const runStandaloneCodeRequest = async (code, input, language) => {
  const { data } = await api.post("/compiler/run", { code, input, language });
  return data;
};

/**
 * Starts full-app dev server for project.
 */
export const startServerRequest = async (projectId) => {
  const { data } = await api.post(`/projects/${projectId}/runner/start`);
  return data;
};

/**
 * Stops full-app dev server for project.
 */
export const stopServerRequest = async (projectId) => {
  const { data } = await api.post(`/projects/${projectId}/runner/stop`);
  return data;
};

/**
 * Fetches current dev server status, allocated port, and logs.
 */
export const fetchServerStatusRequest = async (projectId) => {
  const { data } = await api.get(`/projects/${projectId}/runner/status`);
  return data;
};

/**
 * Runs one command from the project's command terminal.
 */
export const executeProjectTerminalCommandRequest = async (projectId, command) => {
  const { data } = await api.post(`/projects/${projectId}/terminal/execute`, { command });
  return data;
};
