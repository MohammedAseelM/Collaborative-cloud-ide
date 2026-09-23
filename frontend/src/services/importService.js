// frontend/src/services/importService.js
// Responsibility: File system scanning (showDirectoryPicker / webkitdirectory) and HTTP multipart API calls for project imports.

import api from "./api.js";

const IGNORED_PATHS = [
  "node_modules/",
  ".git/",
  "dist/",
  "build/",
  ".next/",
  "__pycache__/",
  ".venv/",
  "venv/",
  ".idea/",
  ".vscode/",
];

/**
 * Checks if a file path should be ignored during upload
 * @param {string} relativePath 
 * @returns {boolean}
 */
export const shouldIgnoreFile = (relativePath = "") => {
  const path = relativePath.replace(/\\/g, "/");
  return IGNORED_PATHS.some((ignored) => path.includes(ignored));
};

/**
 * Reads all files inside a directory handle recursively using the File System Access API
 * @param {FileSystemDirectoryHandle} dirHandle 
 * @param {string} pathPrefix 
 * @returns {Promise<Array<File>>}
 */
export const scanDirectoryHandle = async (dirHandle, pathPrefix = "") => {
  const fileList = [];

  for await (const entry of dirHandle.values()) {
    const entryPath = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;

    if (entry.kind === "directory") {
      if (
        [
          "node_modules",
          ".git",
          "dist",
          "build",
          ".next",
          "__pycache__",
          ".venv",
          "venv",
          ".idea",
          ".vscode",
        ].includes(entry.name)
      ) {
        continue; // Skip ignored directory trees early
      }
      const subFiles = await scanDirectoryHandle(entry, entryPath);
      fileList.push(...subFiles);
    } else if (entry.kind === "file") {
      const file = await entry.getFile();
      // Attach relative path property for backend hierarchy building
      Object.defineProperty(file, "webkitRelativePath", {
        value: entryPath,
        writable: true,
        configurable: true,
      });
      fileList.push(file);
    }
  }

  return fileList;
};

/**
 * Filter file array from <input type="file" webkitdirectory /> or Drag & Drop
 * @param {FileList|Array<File>} files 
 * @returns {Array<File>}
 */
export const filterImportFiles = (files = []) => {
  const fileArray = Array.from(files);
  return fileArray.filter((file) => {
    const relPath = file.webkitRelativePath || file.name;
    return !shouldIgnoreFile(relPath);
  });
};

/**
 * Creates a new project and imports folder/files in one bulk atomic API request
 * @param {Object} payload 
 * @param {string} payload.name
 * @param {string} [payload.description]
 * @param {Array<File>} payload.files
 * @param {Function} [onProgress] - Upload progress callback (0 - 100)
 */
export const importProject = async ({ name, description, files }, onProgress) => {
  const formData = new FormData();
  formData.append("name", name);
  if (description) formData.append("description", description);

  const cleanFiles = filterImportFiles(files);

  cleanFiles.forEach((file) => {
    const relPath = file.webkitRelativePath || file.name;
    formData.append("files", file, relPath);
  });

  const response = await api.post("/files/projects/import", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    },
  });

  return response.data;
};

/**
 * Imports files into an existing project folder
 * @param {string} projectId 
 * @param {Array<File>} files 
 * @param {string} [parentId] 
 * @param {Function} [onProgress] 
 */
export const importIntoProject = async (projectId, files, parentId = null, onProgress) => {
  const formData = new FormData();
  if (parentId) formData.append("parentId", parentId);

  const cleanFiles = filterImportFiles(files);

  cleanFiles.forEach((file) => {
    const relPath = file.webkitRelativePath || file.name;
    formData.append("files", file, relPath);
  });

  const response = await api.post(`/files/projects/${projectId}/import`, formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
    onUploadProgress: (progressEvent) => {
      if (progressEvent.total && onProgress) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    },
  });

  return response.data;
};

/**
 * Fetches nested tree object structure for a project
 * @param {string} projectId 
 */
export const getProjectTree = async (projectId) => {
  const response = await api.get(`/files/projects/${projectId}/tree`);
  return response.data;
};
