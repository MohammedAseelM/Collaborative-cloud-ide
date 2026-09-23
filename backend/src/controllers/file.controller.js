// src/controllers/file.controller.js
// Responsibility: Implement CRUD operations for files and folders (FileNode)
// including flat list fetching, file creations, renames, and recursive deletes.

import fs from "fs";
import path from "path";
import FileNode from "../models/file.model.js";
import Project from "../models/project.model.js";
import Activity from "../models/activity.model.js";
import { findMemberProjectOrThrow, verifyProjectPermission } from "./project.controller.js";
import {
  detectProjectLanguage,
  buildTreeFromRelativePaths,
} from "../services/projectImport.service.js";
import { assertProjectEditable } from "../services/projectEditLock.service.js";
import { syncDiskToDatabase } from "../services/workspaceSync.service.js";
import { env } from "../config/env.js";
import logger from "../utils/logger.js";

// Starter templates based on file extension
const codeTemplates = {
  js: `// JavaScript File\nconsole.log("Hello from Javascript!");\n`,
  py: `# Python File\nprint("Hello from Python!")\n`,
  java: `// Java File\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n    }\n}\n`,
  cpp: `// C++ File\n#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello from C++!" << endl;\n    return 0;\n}\n`,
  c: `// C File\n#include <stdio.h>\n\nint main() {\n    printf("Hello from C!\\n");\n    return 0;\n}\n`,
  ts: `// TypeScript File\nconst greet = (name: string): string => {\n    return \`Hello \${name}\`;\n};\nconsole.log(greet("TypeScript"));\n`,
  html: `<!-- HTML File -->\n<!DOCTYPE html>\n<html>\n<head>\n    <title>Workspace</title>\n</head>\n<body>\n    <h1>Hello World</h1>\n</body>\n</html>\n`,
  css: `/* CSS File */\nbody {\n    background-color: #0f172a;\n    color: #f1f5f9;\n}\n`,
  md: `# Readme File\n\nWrite your project notes here...\n`,
};

export const resolveNodeRelativePath = async (name, parentId, projectId) => {
  if (!parentId) return name;
  const parts = [name];
  let currentId = parentId;
  while (currentId) {
    const parentNode = await FileNode.findOne({ _id: currentId, project: projectId }).select("name parentId relativePath");
    if (!parentNode) break;
    if (parentNode.relativePath) {
      parts.unshift(parentNode.relativePath);
      break;
    }
    parts.unshift(parentNode.name);
    currentId = parentNode.parentId;
  }
  return parts.join("/");
};

export const writeNodeToDisk = async (projectOwnerId, projectId, relativePath, isFolder, content = "") => {
  try {
    const projectDir = path.resolve(env.WORKSPACE_ROOT, projectOwnerId.toString(), projectId.toString());
    const targetPath = path.join(projectDir, relativePath);
    if (isFolder) {
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
    } else {
      const parentDir = path.dirname(targetPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
      fs.writeFileSync(targetPath, content || "", "utf-8");
    }
  } catch (err) {
    logger.error(`Failed to write node to disk at ${relativePath}:`, err);
  }
};

export const deleteNodeFromDisk = async (projectOwnerId, projectId, relativePath) => {
  try {
    const projectDir = path.resolve(env.WORKSPACE_ROOT, projectOwnerId.toString(), projectId.toString());
    const targetPath = path.join(projectDir, relativePath);
    if (fs.existsSync(targetPath)) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  } catch (err) {
    logger.error(`Failed to delete node from disk at ${relativePath}:`, err);
  }
};

/**
 * @route   GET /api/projects/:projectId/files
 * @desc    Fetch all files and folders belonging to a project
 * @access  Private (members only)
 */
export const getProjectFiles = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    await findMemberProjectOrThrow(projectId, req.user._id);

    // Sync disk changes to database first
    await syncDiskToDatabase(projectId);

    const files = await FileNode.find({ project: projectId }).sort({ isFolder: -1, name: 1 });

    res.status(200).json({
      success: true,
      count: files.length,
      files,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/files
 * @desc    Create a new file or folder in a project
 * @access  Private (members only)
 */
export const createFileNode = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { name, isFolder, parentId, content: customContent } = req.body;

    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    assertProjectEditable(projectId, req.user);

    if (!name) {
      const error = new Error("Name is required");
      error.statusCode = 400;
      throw error;
    }

    // Check if node with same name already exists in this folder level
    const existing = await FileNode.findOne({
      project: projectId,
      name,
      parentId: parentId || null,
    });

    if (existing) {
      const error = new Error(`A file or folder named "${name}" already exists at this level`);
      error.statusCode = 400;
      throw error;
    }

    // Assign starter template if it is a file and content was not supplied
    let content = "";
    if (!isFolder) {
      if (customContent !== undefined) {
        content = customContent;
      } else {
        const ext = name.split(".").pop()?.toLowerCase();
        content = codeTemplates[ext] || "// Write your code here...\n";
      }
    }

    const relativePath = await resolveNodeRelativePath(name, parentId, projectId);

    const node = await FileNode.create({
      name,
      isFolder,
      project: projectId,
      parentId: parentId || null,
      relativePath,
      content: isFolder ? undefined : content,
    });

    // Write to disk immediately so it exists on physical filesystem
    await writeNodeToDisk(project.owner, projectId, relativePath, isFolder, content);

    // Log creation activity
    await Activity.create({
      project: projectId,
      user: req.user._id,
      type: "EDIT", // categorize file modifications as EDIT action
      details: { action: "create", name, type: isFolder ? "folder" : "file" },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${projectId}`).emit("files-updated", {
        action: "create",
        file: node,
        fileId: node._id,
        name,
        isFolder,
        userId: req.user._id,
      });
    }

    res.status(201).json({
      success: true,
      message: `${isFolder ? "Folder" : "File"} created successfully`,
      file: node,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/files/:fileId
 * @desc    Rename a file or folder
 * @access  Private (members only)
 */
export const renameFileNode = async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const { name } = req.body;

    if (!name) {
      const error = new Error("New name is required");
      error.statusCode = 400;
      throw error;
    }

    const node = await FileNode.findById(fileId);
    if (!node) {
      const error = new Error("File or folder not found");
      error.statusCode = 404;
      throw error;
    }

    const project = await findMemberProjectOrThrow(node.project, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    assertProjectEditable(node.project, req.user);

    // Verify name uniqueness in parent directory
    const existing = await FileNode.findOne({
      project: node.project,
      name,
      parentId: node.parentId,
      _id: { $ne: fileId },
    });

    if (existing) {
      const error = new Error(`A file or folder named "${name}" already exists at this level`);
      error.statusCode = 400;
      throw error;
    }

    const oldName = node.name;
    const oldRelPath = node.relativePath || oldName;
    const newRelPath = await resolveNodeRelativePath(name, node.parentId, node.project);

    // Rename on disk first
    try {
      const projectDir = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), node.project.toString());
      const oldDiskPath = path.join(projectDir, oldRelPath);
      const newDiskPath = path.join(projectDir, newRelPath);
      if (fs.existsSync(oldDiskPath)) {
        fs.renameSync(oldDiskPath, newDiskPath);
      }
    } catch (diskErr) {
      logger.error("Failed to rename file node on disk:", diskErr);
    }

    node.name = name;
    node.relativePath = newRelPath;
    await node.save();

    // If folder, update relativePath of all descendants in DB
    if (node.isFolder) {
      const descendants = await FileNode.find({ project: node.project });
      for (const desc of descendants) {
        if (desc.relativePath && desc.relativePath.startsWith(`${oldRelPath}/`)) {
          desc.relativePath = `${newRelPath}/${desc.relativePath.slice(oldRelPath.length + 1)}`;
          await desc.save();
        }
      }
    }

    // Log rename activity
    await Activity.create({
      project: node.project,
      user: req.user._id,
      type: "EDIT",
      details: { action: "rename", oldName, newName: name, type: node.isFolder ? "folder" : "file" },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${node.project.toString()}`).emit("files-updated", {
        action: "rename",
        file: node,
        fileId: node._id,
        name,
        oldName,
        isFolder: node.isFolder,
        userId: req.user._id,
      });
    }

    res.status(200).json({
      success: true,
      message: "Renamed successfully",
      file: node,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Recursive helper to delete folder nodes and all nested child records in MongoDB.
 */
const deleteRecursively = async (nodeId) => {
  const children = await FileNode.find({ parentId: nodeId });
  for (const child of children) {
    await deleteRecursively(child._id);
  }
  await FileNode.findByIdAndDelete(nodeId);
};

/**
 * @route   DELETE /api/files/:fileId
 * @desc    Delete a file or folder (recursively cleans subfolders)
 * @access  Private (members only)
 */
export const deleteFileNode = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const node = await FileNode.findById(fileId);
    if (!node) {
      const error = new Error("File or folder not found");
      error.statusCode = 404;
      throw error;
    }

    const project = await findMemberProjectOrThrow(node.project, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    assertProjectEditable(node.project, req.user);

    const targetProjectId = node.project.toString();
    const deletedName = node.name;
    const wasFolder = node.isFolder;

    // 1. Delete from physical disk first so syncDiskToDatabase won't resurrect it
    const targetRelPath = node.relativePath || node.name;
    await deleteNodeFromDisk(project.owner, node.project, targetRelPath);

    // 2. Recursively clean up subfolders and child file nodes in MongoDB
    await deleteRecursively(fileId);

    // Log delete activity
    await Activity.create({
      project: node.project,
      user: req.user._id,
      type: "EDIT",
      details: { action: "delete", name: deletedName, type: wasFolder ? "folder" : "file" },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${targetProjectId}`).emit("files-updated", {
        action: "delete",
        fileId,
        name: deletedName,
        isFolder: wasFolder,
        userId: req.user._id,
      });
    }

    res.status(200).json({
      success: true,
      message: `${wasFolder ? "Folder" : "File"} deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/files/:fileId
 * @desc    Fetch content of a single file
 * @access  Private (members only)
 */
export const getFileContent = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const node = await FileNode.findById(fileId);
    if (!node || node.isFolder) {
      const error = new Error("File not found");
      error.statusCode = 404;
      throw error;
    }

    await findMemberProjectOrThrow(node.project, req.user._id);

    res.status(200).json({
      success: true,
      content: node.content || "",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/upload
 * @desc    Upload a file from user's computer to the project
 * @access  Private (members only)
 */
export const uploadFile = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { parentId } = req.body;

    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    assertProjectEditable(projectId, req.user);

    if (!req.file) {
      const error = new Error("No file uploaded");
      error.statusCode = 400;
      throw error;
    }

    const fileName = req.file.originalname;
    const fileContent = req.file.buffer.toString('utf-8');

    // Check if node with same name already exists in this folder level
    const existing = await FileNode.findOne({
      project: projectId,
      name: fileName,
      parentId: parentId || null,
    });

    if (existing) {
      const error = new Error(`A file named "${fileName}" already exists at this level`);
      error.statusCode = 400;
      throw error;
    }

    const relativePath = await resolveNodeRelativePath(fileName, parentId, projectId);

    const node = await FileNode.create({
      name: fileName,
      isFolder: false,
      project: projectId,
      parentId: parentId || null,
      relativePath,
      content: fileContent,
    });

    await writeNodeToDisk(project.owner, projectId, relativePath, false, fileContent);

    // Log upload activity
    await Activity.create({
      project: projectId,
      user: req.user._id,
      type: "EDIT",
      details: { action: "upload", name: fileName, type: "file" },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${projectId}`).emit("files-updated", {
        action: "upload",
        file: node,
        fileId: node._id,
        name: fileName,
        isFolder: false,
        userId: req.user._id,
      });
    }

    res.status(201).json({
      success: true,
      message: "File uploaded successfully",
      file: node,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Helper function to create folder structure recursively
 */
const createFolderStructure = async (projectId, folderPath, baseParentId = null, projectOwnerId = null) => {
  const folders = folderPath.split('/').filter(f => f);
  let currentParentId = baseParentId;
  let currentPath = "";

  for (const folderName of folders) {
    currentPath = currentPath ? `${currentPath}/${folderName}` : folderName;
    // Check if folder already exists
    let existingFolder = await FileNode.findOne({
      project: projectId,
      name: folderName,
      isFolder: true,
      parentId: currentParentId,
    });

    if (!existingFolder) {
      // Create the folder
      existingFolder = await FileNode.create({
        name: folderName,
        isFolder: true,
        project: projectId,
        parentId: currentParentId,
        relativePath: currentPath,
      });

      if (projectOwnerId) {
        await writeNodeToDisk(projectOwnerId, projectId, currentPath, true);
      }
    }

    currentParentId = existingFolder._id;
  }

  return currentParentId;
};

/**
 * @route   POST /api/projects/:projectId/upload-folder
 * @desc    Upload multiple files/folders from user's computer to the project
 * @access  Private (members only)
 */
export const uploadFolder = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { parentId } = req.body;

    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    assertProjectEditable(projectId, req.user);

    if (!req.files || req.files.length === 0) {
      const error = new Error("No files uploaded");
      error.statusCode = 400;
      throw error;
    }

    const uploadedFiles = [];
    const errors = [];

    for (const file of req.files) {
      try {
        const relativePath = file.originalname; // This will contain the full relative path
        const fileContent = file.buffer.toString('utf-8');

        // Extract folder path and file name
        const pathParts = relativePath.split('/');
        const fileName = pathParts.pop();
        const folderPath = pathParts.join('/');

        // Create folder structure if needed
        let finalParentId = parentId || null;
        if (folderPath) {
          finalParentId = await createFolderStructure(projectId, folderPath, parentId, project.owner);
        }

        // Check if file already exists
        const existing = await FileNode.findOne({
          project: projectId,
          name: fileName,
          parentId: finalParentId,
        });

        if (existing) {
          errors.push(`File "${relativePath}" already exists`);
          continue;
        }

        // Create the file
        const node = await FileNode.create({
          name: fileName,
          isFolder: false,
          project: projectId,
          parentId: finalParentId,
          relativePath,
          content: fileContent,
        });

        await writeNodeToDisk(project.owner, projectId, relativePath, false, fileContent);

        uploadedFiles.push(node);
      } catch (err) {
        errors.push(`Failed to upload "${file.originalname}": ${err.message}`);
      }
    }

    // Log upload activity
    await Activity.create({
      project: projectId,
      user: req.user._id,
      type: "EDIT",
      details: { action: "upload-folder", count: uploadedFiles.length, type: "folder" },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${projectId}`).emit("files-updated", {
        action: "upload-folder",
        count: uploadedFiles.length,
        userId: req.user._id,
      });
    }

    res.status(201).json({
      success: true,
      message: `Uploaded ${uploadedFiles.length} files successfully`,
      files: uploadedFiles,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/import
 * @desc    Import an entire project folder from user's local system
 * @access  Private
 */
export const importProject = async (req, res, next) => {
  try {
    const { name, description } = req.body;
    const files = req.files || [];

    if (!name || name.trim().length < 2) {
      const error = new Error("Project name must be at least 2 characters");
      error.statusCode = 400;
      throw error;
    }

    // Auto-detect project language if files are provided
    const detectedLanguage = detectProjectLanguage(files);

    const project = await Project.create({
      name: name.trim(),
      description: description ? description.trim() : `Imported project (${files.length} files)`,
      owner: req.user._id,
      members: [req.user._id],
      memberRoles: new Map([[req.user._id.toString(), "Owner"]]),
      language: detectedLanguage,
    });

    let result = { createdFiles: [], skippedFiles: [] };

    if (files.length > 0) {
      result = await buildTreeFromRelativePaths({
        projectId: project._id,
        files,
        userId: req.user._id,
      });
    }

    // Create Activity Log
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "CREATE",
      details: {
        action: "import_project",
        name: project.name,
        filesCount: result.createdFiles.length,
        language: detectedLanguage,
      },
    });

    res.status(201).json({
      success: true,
      message: "Project imported successfully",
      project,
      createdFilesCount: result.createdFiles.length,
      skippedFiles: result.skippedFiles,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/import
 * @desc    Import files/folders into an existing project
 * @access  Private (members with Editor permission)
 */
export const importIntoProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { parentId } = req.body;
    const files = req.files || [];

    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    assertProjectEditable(projectId, req.user);

    if (files.length === 0) {
      const error = new Error("No files selected for import");
      error.statusCode = 400;
      throw error;
    }

    const result = await buildTreeFromRelativePaths({
      projectId,
      files,
      baseParentId: parentId || null,
      userId: req.user._id,
    });

    // Create Activity Log
    await Activity.create({
      project: projectId,
      user: req.user._id,
      type: "EDIT",
      details: {
        action: "import_into_project",
        count: result.createdFiles.length,
      },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${projectId}`).emit("files-updated", {
        action: "import",
        count: result.createdFiles.length,
        userId: req.user._id,
      });
    }

    res.status(200).json({
      success: true,
      message: `Imported ${result.createdFiles.length} files successfully`,
      createdFilesCount: result.createdFiles.length,
      skippedFiles: result.skippedFiles,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:projectId/tree
 * @desc    Get project file structure as a nested tree object
 * @access  Private (members only)
 */
export const getProjectTree = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    await findMemberProjectOrThrow(projectId, req.user._id);

    const files = await FileNode.find({ project: projectId }).sort({ isFolder: -1, name: 1 });

    // Construct nested tree
    const nodeMap = new Map();
    const roots = [];

    files.forEach((file) => {
      nodeMap.set(file._id.toString(), {
        ...file.toObject(),
        children: file.isFolder ? [] : undefined,
      });
    });

    files.forEach((file) => {
      const node = nodeMap.get(file._id.toString());
      if (file.parentId && nodeMap.has(file.parentId.toString())) {
        const parent = nodeMap.get(file.parentId.toString());
        if (parent.children) {
          parent.children.push(node);
        }
      } else {
        roots.push(node);
      }
    });

    res.status(200).json({
      success: true,
      tree: roots,
      totalCount: files.length,
    });
  } catch (error) {
    next(error);
  }
};
