// src/services/file.service.js
// Responsibility: Encapsulate all Axios calls related to the File Explorer
// (CRUD operations on folders and files).

import api from "./api";

/**
 * Fetches all files and folders belonging to a project.
 * @param {string} projectId
 */
export const fetchProjectFiles = async (projectId) => {
  const { data } = await api.get(`/files/projects/${projectId}/files`);
  return data;
};

/**
 * Creates a new file or folder in a project.
 * @param {string} projectId
 * @param {{ name: string, isFolder: boolean, parentId?: string }} payload
 */
export const createFileNodeRequest = async (projectId, payload) => {
  const { data } = await api.post(`/files/projects/${projectId}/files`, payload);
  return data;
};

/**
 * Renames a file or folder.
 * @param {string} fileId
 * @param {string} name - new name
 */
export const renameFileNodeRequest = async (fileId, name) => {
  const { data } = await api.patch(`/files/${fileId}`, { name });
  return data;
};

/**
 * Deletes a file or folder (recursively deletes subfolders).
 * @param {string} fileId
 */
export const deleteFileNodeRequest = async (fileId) => {
  const { data } = await api.delete(`/files/${fileId}`);
  return data;
};

/**
 * Fetches content of a single file.
 * @param {string} fileId
 */
export const fetchFileContent = async (fileId) => {
  const { data } = await api.get(`/files/${fileId}`);
  return data;
};

/**
 * Uploads a file from the user's computer.
 * @param {string} projectId
 * @param {FormData} formData - contains the file and optional parentId
 */
export const uploadFileRequest = async (projectId, formData) => {
  const { data } = await api.post(`/files/projects/${projectId}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
};

/**
 * Uploads a folder with multiple files from the user's computer.
 * @param {string} projectId
 * @param {FormData} formData - contains the files and optional parentId
 */
export const uploadFolderRequest = async (projectId, formData) => {
  const { data } = await api.post(`/files/projects/${projectId}/upload-folder`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return data;
};
