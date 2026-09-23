// src/services/projectImport.service.js
// Responsibility: Pure business logic for processing imported project files,
// detecting project runtimes, sanitizing relative paths, and generating nested FileNode hierarchies.

import FileNode from "../models/file.model.js";

// Common build/dependency paths to ignore during bulk folder imports
const IGNORED_DIRECTORIES = new Set([
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
]);

/**
 * Sanitizes a relative file path to prevent directory traversal attacks.
 * @param {string} rawPath - The relative path (e.g., "src/components/Button.jsx")
 * @returns {string} - Cleaned relative path
 */
export const sanitizeRelativePath = (rawPath) => {
  if (!rawPath) return "";
  let clean = rawPath.replace(/\\/g, "/"); // Normalize Windows backslashes
  clean = clean.replace(/^\/+/, ""); // Remove leading slashes
  // Remove any attempts to traverse upwards
  clean = clean
    .split("/")
    .filter((segment) => segment !== "." && segment !== "..")
    .join("/");
  return clean;
};

/**
 * Auto-detects primary project programming language from file manifest or extensions.
 * @param {Array<{ originalname: string }>} files - List of uploaded file objects
 * @returns {string} - Detected language tag ("javascript", "python", "java", "cpp", "c", "typescript", "other")
 */
export const detectProjectLanguage = (files = []) => {
  const filenames = files.map((f) => {
    const cleanPath = sanitizeRelativePath(f.originalname || f.name || "");
    return cleanPath.split("/").pop().toLowerCase();
  });

  if (filenames.includes("package.json") || filenames.some((f) => f.endsWith(".jsx"))) {
    if (filenames.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"))) {
      return "typescript";
    }
    return "javascript";
  }

  if (filenames.includes("requirements.txt") || filenames.some((f) => f.endsWith(".py"))) {
    return "python";
  }

  if (
    filenames.includes("pom.xml") ||
    filenames.includes("build.gradle") ||
    filenames.some((f) => f.endsWith(".java"))
  ) {
    return "java";
  }

  if (filenames.some((f) => f.endsWith(".cpp") || f.endsWith(".hpp") || f.endsWith(".cc"))) {
    return "cpp";
  }

  if (filenames.some((f) => f.endsWith(".c") || f.endsWith(".h"))) {
    return "c";
  }

  if (filenames.some((f) => f.endsWith(".ts") || f.endsWith(".tsx"))) {
    return "typescript";
  }

  return "javascript";
};

/**
 * Detects specific file language based on file extension.
 * @param {string} filename 
 * @returns {string}
 */
export const detectFileLanguage = (filename) => {
  const ext = filename.split(".").pop()?.toLowerCase();
  const map = {
    js: "javascript",
    jsx: "javascript",
    ts: "typescript",
    tsx: "typescript",
    py: "python",
    java: "java",
    cpp: "cpp",
    c: "c",
    html: "html",
    css: "css",
    json: "json",
    md: "markdown",
    xml: "xml",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] || "plaintext";
};

/**
 * Helper function to parse relative paths and build folder hierarchy recursively in MongoDB.
 * @param {string} projectId - Target MongoDB Project ObjectId
 * @param {string} folderPath - Path segment (e.g. "src/components")
 * @param {string} baseParentId - Parent folder ID
 * @param {Map<string, string>} folderCache - Cache map from relative folder path -> FileNode _id
 * @returns {Promise<string>} - Created or found folder FileNode ObjectId
 */
export const ensureFolderExists = async (projectId, folderPath, baseParentId = null, folderCache = new Map()) => {
  if (!folderPath) return baseParentId;

  if (folderCache.has(folderPath)) {
    return folderCache.get(folderPath);
  }

  const parts = folderPath.split("/").filter(Boolean);
  let currentParentId = baseParentId;
  let accumulatedPath = "";

  for (const folderName of parts) {
    if (IGNORED_DIRECTORIES.has(folderName)) {
      return null; // Skip ignored directory branches
    }

    accumulatedPath = accumulatedPath ? `${accumulatedPath}/${folderName}` : folderName;

    if (folderCache.has(accumulatedPath)) {
      currentParentId = folderCache.get(accumulatedPath);
      continue;
    }

    let folderNode = await FileNode.findOne({
      project: projectId,
      name: folderName,
      isFolder: true,
      parentId: currentParentId,
    });

    if (!folderNode) {
      folderNode = await FileNode.create({
        name: folderName,
        isFolder: true,
        project: projectId,
        parentId: currentParentId,
        relativePath: accumulatedPath,
      });
    }

    currentParentId = folderNode._id.toString();
    folderCache.set(accumulatedPath, currentParentId);
  }

  return currentParentId;
};

/**
 * Bulk imports uploaded files into MongoDB under a project, creating all nested parent folders.
 * @param {Object} params
 * @param {string} params.projectId
 * @param {Array<Object>} params.files - Array of Multer file objects (with originalname, buffer, size)
 * @param {string} [params.baseParentId] - Optional parent folder ID
 * @param {string} [params.userId] - ID of importing user
 * @returns {Promise<{ createdFiles: Array<Object>, skippedFiles: Array<string> }>}
 */
export const buildTreeFromRelativePaths = async ({
  projectId,
  files = [],
  baseParentId = null,
  userId = null,
}) => {
  const createdFiles = [];
  const skippedFiles = [];
  const folderCache = new Map();

  for (const file of files) {
    const rawPath = file.originalname || file.name;
    const cleanPath = sanitizeRelativePath(rawPath);
    if (!cleanPath) continue;

    const pathParts = cleanPath.split("/");
    const fileName = pathParts.pop();

    // Check if path contains an ignored directory
    const containsIgnored = pathParts.some((p) => IGNORED_DIRECTORIES.has(p));
    if (containsIgnored) {
      skippedFiles.push(cleanPath);
      continue;
    }

    const folderPath = pathParts.join("/");
    let parentId = baseParentId;

    if (folderPath) {
      parentId = await ensureFolderExists(projectId, folderPath, baseParentId, folderCache);
      if (parentId === null) {
        skippedFiles.push(cleanPath);
        continue;
      }
    }

    // Check if file already exists at this target folder level
    const existing = await FileNode.findOne({
      project: projectId,
      name: fileName,
      parentId: parentId || null,
    });

    if (existing) {
      skippedFiles.push(`${cleanPath} (File already exists)`);
      continue;
    }

    const content = file.buffer ? file.buffer.toString("utf-8") : file.content || "";
    const size = file.size || Buffer.byteLength(content, "utf-8");
    const language = detectFileLanguage(fileName);

    const fileNode = await FileNode.create({
      name: fileName,
      isFolder: false,
      project: projectId,
      parentId: parentId || null,
      content,
      relativePath: cleanPath,
      size,
      language,
      createdBy: userId || null,
      updatedBy: userId || null,
    });

    createdFiles.push(fileNode);
  }

  return { createdFiles, skippedFiles };
};
