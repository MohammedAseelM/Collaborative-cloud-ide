// frontend/src/services/task.service.js
// Responsibility: API client for fetching, assigning, updating, and deleting project tasks.

import api from "./api";

export const fetchProjectTasks = async (projectId) => {
  const response = await api.get(`/projects/${projectId}/tasks`);
  return response.data;
};

export const createProjectTask = async (projectId, taskData) => {
  const response = await api.post(`/projects/${projectId}/tasks`, taskData);
  return response.data;
};

export const updateTaskStatusRequest = async (projectId, taskId, status) => {
  const response = await api.patch(`/projects/${projectId}/tasks/${taskId}/status`, { status });
  return response.data;
};

export const deleteProjectTaskRequest = async (projectId, taskId) => {
  const response = await api.delete(`/projects/${projectId}/tasks/${taskId}`);
  return response.data;
};
