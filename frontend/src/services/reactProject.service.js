// src/services/reactProject.service.js
// Responsibility: HTTP API client for the React Project Command System.

import api from "./api";

/**
 * 1. Create React Project (Vite + React)
 */
export const createReactProjectRequest = async (name, description = "") => {
  const response = await api.post("/projects/react/create", { name, description });
  return response.data;
};

/**
 * 2. Install dependencies (npm install)
 */
export const installDependenciesRequest = async (projectId) => {
  const response = await api.post(`/projects/${projectId}/install`);
  return response.data;
};

/**
 * 3. Run React dev server (npm run dev)
 */
export const runReactProjectRequest = async (projectId) => {
  const response = await api.post(`/projects/${projectId}/run`);
  return response.data;
};

/**
 * 4. Stop React dev server
 */
export const stopReactProjectRequest = async (projectId) => {
  const response = await api.post(`/projects/${projectId}/stop`);
  return response.data;
};

/**
 * 5. Restart React dev server
 */
export const restartReactProjectRequest = async (projectId) => {
  const response = await api.post(`/projects/${projectId}/restart`);
  return response.data;
};

/**
 * 6. Build React project for production (npm run build)
 */
export const buildReactProjectRequest = async (projectId) => {
  const response = await api.post(`/projects/${projectId}/build`);
  return response.data;
};

/**
 * 7. Reset project to original React template
 */
export const resetReactProjectRequest = async (projectId) => {
  const response = await api.post(`/projects/${projectId}/reset`);
  return response.data;
};

/**
 * 8. Delete React Project
 */
export const deleteReactProjectRequest = async (projectId) => {
  const response = await api.delete(`/projects/${projectId}/react`);
  return response.data;
};

/**
 * 9. Install npm package (npm install <pkg>)
 */
export const installPackageRequest = async (projectId, packageName, version = "") => {
  const response = await api.post(`/projects/${projectId}/packages/install`, { packageName, version });
  return response.data;
};

/**
 * 10. Uninstall npm package (npm uninstall <pkg>)
 */
export const uninstallPackageRequest = async (projectId, packageName) => {
  const response = await api.post(`/projects/${projectId}/packages/uninstall`, { packageName });
  return response.data;
};

/**
 * 11. Update npm packages (npm update)
 */
export const updatePackagesRequest = async (projectId) => {
  const response = await api.post(`/projects/${projectId}/packages/update`);
  return response.data;
};

/**
 * 12. Preview production build (npm run preview)
 */
export const previewReactProjectRequest = async (projectId) => {
  const response = await api.post(`/projects/${projectId}/preview`);
  return response.data;
};

/**
 * 13. Get available npm scripts from package.json
 */
export const getProjectScriptsRequest = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/scripts`);
  return response.data;
};

/**
 * 14. Run a specific npm script
 */
export const runProjectScriptRequest = async (projectId, scriptName) => {
  const response = await api.post(`/projects/${projectId}/scripts/run`, { scriptName });
  return response.data;
};

/**
 * 15. Check Node.js version
 */
export const getNodeVersionRequest = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/node-version`);
  return response.data;
};

/**
 * 16. Check npm version
 */
export const getNpmVersionRequest = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/npm-version`);
  return response.data;
};

