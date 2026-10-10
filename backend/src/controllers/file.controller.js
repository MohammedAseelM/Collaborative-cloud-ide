// src/controllers/file.controller.js
// Responsibility: Implement CRUD operations for files and folders (FileNode)
// including flat list fetching, file creations, renames, and recursive deletes.

import fs from "fs";
import path from "path";
import FileNode from "../models/file.model.js";
import Project from "../models/project.model.js";
import Activity from "../models/activity.model.js";
import Version from "../models/version.model.js";
import { findMemberProjectOrThrow, verifyProjectPermission } from "./project.controller.js";
import {
  detectProjectLanguage,
  buildTreeFromRelativePaths,
} from "../services/projectImport.service.js";
import { assertProjectEditable } from "../services/projectEditLock.service.js";
import { syncDiskToDatabase } from "../services/workspaceSync.service.js";
import { env } from "../config/env.js";
import logger from "../utils/logger.js";
import { resolveProjectPath } from "../utils/projectPath.js";

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
    const targetPath = resolveProjectPath(projectDir, relativePath);
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
    if (err.statusCode === 400) throw err;
  }
};

export const deleteNodeFromDisk = async (projectOwnerId, projectId, relativePath) => {
  try {
    const projectDir = path.resolve(env.WORKSPACE_ROOT, projectOwnerId.toString(), projectId.toString());
    const targetPath = resolveProjectPath(projectDir, relativePath);
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

    const files = await FileNode.find({ project: projectId, isDeleted: { $ne: true } }).sort({ isFolder: -1, name: 1 });

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

    // Check if node with same name already exists in this folder level (active files)
    const existing = await FileNode.findOne({
      project: projectId,
      name,
      parentId: parentId || null,
      isDeleted: { $ne: true },
    });

    if (existing) {
      const error = new Error(`A file or folder named "${name}" already exists at this level`);
      error.statusCode = 400;
      throw error;
    }

    const isFolderBool = Boolean(isFolder);

    // Assign starter template if it is a file and content was not supplied
    let content = "";
    if (!isFolderBool) {
      if (customContent !== undefined) {
        content = customContent;
      } else {
        const ext = name.split(".").pop()?.toLowerCase();
        content = codeTemplates[ext] || "// Write your code here...\n";
      }
    }

    const relativePath = await resolveNodeRelativePath(name, parentId, projectId);
    resolveProjectPath(path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), projectId.toString()), relativePath);

    const node = await FileNode.create({
      name,
      isFolder: isFolderBool,
      project: projectId,
      parentId: parentId || null,
      relativePath,
      content: isFolderBool ? undefined : content,
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

    // Verify name uniqueness in parent directory among active files
    const existing = await FileNode.findOne({
      project: node.project,
      name,
      parentId: node.parentId,
      isDeleted: { $ne: true },
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
      const oldDiskPath = resolveProjectPath(projectDir, oldRelPath);
      const newDiskPath = resolveProjectPath(projectDir, newRelPath);
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
 * Helper to soft-delete folder nodes and all nested child records in MongoDB.
 */
const softDeleteRecursively = async (nodeId, userId) => {
  const children = await FileNode.find({ parentId: nodeId, isDeleted: { $ne: true } });
  for (const child of children) {
    await softDeleteRecursively(child._id, userId);
  }
  await FileNode.findByIdAndUpdate(nodeId, {
    isDeleted: true,
    deletedAt: new Date(),
    deletedBy: userId,
  });
};

/**
 * @route   DELETE /api/files/:fileId
 * @desc    Soft-delete a file or folder (recursively marks subfolders as deleted)
 *          Stores a recoverable snapshot in Version before deletion.
 * @access  Private (members with Editor permission)
 */
export const deleteFileNode = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const node = await FileNode.findById(fileId);
    if (!node || node.isDeleted) {
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

    // 1. Store recoverable version snapshot before destructive delete
    if (!wasFolder) {
      try {
        const latestVersion = await Version.findOne({ project: node.project }).sort({ versionNumber: -1 });
        const nextVersionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
        await Version.create({
          project: node.project,
          code: node.content || "",
          versionNumber: nextVersionNumber,
          description: `Snapshot before deleting ${deletedName}`,
          createdBy: req.user._id,
        });
      } catch (snapErr) {
        logger.warn(`Could not save pre-deletion snapshot for ${deletedName}: ${snapErr.message}`);
      }
    }

    // 2. Delete from physical disk so workspace sync won't pick it up
    const targetRelPath = node.relativePath || node.name;
    await deleteNodeFromDisk(project.owner, node.project, targetRelPath);

    // 3. Soft delete in MongoDB
    await softDeleteRecursively(fileId, req.user._id);

    // 4. Log delete activity
    await Activity.create({
      project: node.project,
      user: req.user._id,
      type: "DELETE",
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
 * Helper to safely resolve a non-colliding name when restoring a node.
 */
export const resolveAvailableName = async (projectId, originalName, parentId, isFolder, excludeId = null) => {
  let candidateName = originalName;
  let counter = 1;
  while (true) {
    const query = {
      project: projectId,
      name: candidateName,
      parentId: parentId || null,
      isDeleted: { $ne: true },
    };
    if (excludeId) {
      query._id = { $ne: excludeId };
    }
    const existing = await FileNode.findOne(query);
    if (!existing) {
      return candidateName;
    }
    const ext = isFolder ? "" : path.extname(originalName);
    const base = isFolder ? originalName : path.basename(originalName, ext);
    candidateName = `${base} (restored${counter > 1 ? ` ${counter}` : ""})${ext}`;
    counter++;
  }
};

/**
 * @route   POST /api/files/:fileId/restore
 * @desc    Restore a soft-deleted file or folder, recursively restoring any soft-deleted
 *          ancestor folders in order so the file is properly visible in the explorer.
 * @access  Private (members with Editor permission)
 */
export const restoreFileNode = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const node = await FileNode.findById(fileId);
    if (!node) {
      const error = new Error("File or folder not found");
      error.statusCode = 404;
      throw error;
    }

    if (!node.isDeleted) {
      const error = new Error("File is not deleted");
      error.statusCode = 400;
      throw error;
    }

    const project = await findMemberProjectOrThrow(node.project, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    assertProjectEditable(node.project, req.user);

    // 1. Resolve soft-deleted ancestor hierarchy from root to target's parent
    const ancestorsToRestore = [];
    let currParentId = node.parentId;
    const visited = new Set();
    while (currParentId) {
      const pidStr = currParentId.toString();
      if (visited.has(pidStr)) break;
      visited.add(pidStr);

      const ancestor = await FileNode.findOne({ _id: currParentId, project: node.project });
      if (!ancestor) break; // Missing parent record

      if (ancestor.isDeleted) {
        ancestorsToRestore.unshift(ancestor); // Unshift so root-most ancestor is index 0
      }
      currParentId = ancestor.parentId;
    }

    // Handle missing parents: if top ancestor has non-existent parent, reparent to root
    if (ancestorsToRestore.length > 0 && ancestorsToRestore[0].parentId) {
      const topParentExists = await FileNode.exists({ _id: ancestorsToRestore[0].parentId, project: node.project });
      if (!topParentExists) {
        ancestorsToRestore[0].parentId = null;
      }
    } else if (ancestorsToRestore.length === 0 && node.parentId) {
      const parentExists = await FileNode.exists({ _id: node.parentId, project: node.project });
      if (!parentExists) {
        node.parentId = null;
      }
    }

    // 2. Restore necessary ancestor folders in correct root-to-leaf order
    const restoredAncestors = [];
    for (const ancestor of ancestorsToRestore) {
      const safeAncestorName = await resolveAvailableName(
        node.project,
        ancestor.name,
        ancestor.parentId,
        ancestor.isFolder,
        ancestor._id
      );
      ancestor.name = safeAncestorName;
      const ancestorRelPath = await resolveNodeRelativePath(safeAncestorName, ancestor.parentId, node.project);
      ancestor.relativePath = ancestorRelPath;
      ancestor.isDeleted = false;
      ancestor.deletedAt = null;
      ancestor.deletedBy = null;
      ancestor.updatedBy = req.user._id;
      await ancestor.save();

      await writeNodeToDisk(project.owner, node.project, ancestorRelPath, ancestor.isFolder, ancestor.content || "");
      restoredAncestors.push(ancestor);

      await Activity.create({
        project: node.project,
        user: req.user._id,
        type: "RESTORE_VERSION",
        details: {
          action: "restore_ancestor",
          name: safeAncestorName,
          type: "folder",
        },
      });
    }

    // 3. Restore the target node
    const safeNodeName = await resolveAvailableName(
      node.project,
      node.name,
      node.parentId,
      node.isFolder,
      node._id
    );
    node.name = safeNodeName;
    const relativePath = await resolveNodeRelativePath(safeNodeName, node.parentId, node.project);
    node.relativePath = relativePath;
    node.isDeleted = false;
    node.deletedAt = null;
    node.deletedBy = null;
    node.updatedBy = req.user._id;
    await node.save();

    await writeNodeToDisk(project.owner, node.project, relativePath, node.isFolder, node.content || "");

    // 4. If target is a folder, also restore its soft-deleted children
    if (node.isFolder) {
      const restoreSubtree = async (folderId) => {
        const children = await FileNode.find({ parentId: folderId, isDeleted: true });
        for (const child of children) {
          const childSafeName = await resolveAvailableName(node.project, child.name, child.parentId, child.isFolder, child._id);
          child.name = childSafeName;
          child.relativePath = await resolveNodeRelativePath(childSafeName, child.parentId, node.project);
          child.isDeleted = false;
          child.deletedAt = null;
          child.deletedBy = null;
          child.updatedBy = req.user._id;
          await child.save();
          await writeNodeToDisk(project.owner, node.project, child.relativePath, child.isFolder, child.content || "");
          if (child.isFolder) {
            await restoreSubtree(child._id);
          }
        }
      };
      await restoreSubtree(node._id);
    }

    // Record restoration activity and version snapshot
    const latestVersion = await Version.findOne({ project: node.project }).sort({ versionNumber: -1 });
    const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
    await Version.create({
      project: node.project,
      code: node.content || "",
      versionNumber,
      description: `Restored ${safeNodeName} (v${versionNumber})`,
      createdBy: req.user._id,
    });

    await Activity.create({
      project: node.project,
      user: req.user._id,
      type: "RESTORE_VERSION",
      details: {
        action: "restore",
        name: safeNodeName,
        type: node.isFolder ? "folder" : "file",
        versionNumber,
        restoredAncestorsCount: restoredAncestors.length,
      },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${node.project.toString()}`).emit("files-updated", {
        action: "restore",
        file: node,
        fileId: node._id,
        name: safeNodeName,
        isFolder: node.isFolder,
        restoredAncestors: restoredAncestors.map((a) => ({ _id: a._id, name: a.name })),
        userId: req.user._id,
      });
    }

    res.status(200).json({
      success: true,
      message: `${node.isFolder ? "Folder" : "File"} restored successfully`,
      file: node,
      restoredAncestors,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/files/:fileId/permanent
 * @desc    Permanently delete a soft-deleted file or folder (Owner/Admin only)
 * @access  Private (Owner/Admin only)
 */
export const permanentDeleteFileNode = async (req, res, next) => {
  try {
    const { fileId } = req.params;

    const node = await FileNode.findById(fileId);
    if (!node) {
      const error = new Error("File or folder not found");
      error.statusCode = 404;
      throw error;
    }

    if (!node.isDeleted) {
      const error = new Error("Cannot permanently delete an active file. Please soft-delete it first.");
      error.statusCode = 400;
      throw error;
    }

    const project = await findMemberProjectOrThrow(node.project, req.user._id);
    verifyProjectPermission(project, req.user._id, "Admin"); // Owner/Admin only
    assertProjectEditable(node.project, req.user);

    // Durable audit log before permanent destruction
    await Activity.create({
      project: node.project,
      user: req.user._id,
      type: "DELETE",
      details: {
        action: "permanent_delete",
        name: node.name,
        type: node.isFolder ? "folder" : "file",
        relativePath: node.relativePath,
      },
    });

    // Delete disk artifact
    const targetRelPath = node.relativePath || node.name;
    await deleteNodeFromDisk(project.owner, node.project, targetRelPath);

    // Recursively collect all descendant IDs if folder
    const collectDescendantIds = async (folderId) => {
      const list = [folderId];
      const children = await FileNode.find({ parentId: folderId });
      for (const child of children) {
        const sub = await collectDescendantIds(child._id);
        list.push(...sub);
      }
      return list;
    };

    const idsToDelete = node.isFolder ? await collectDescendantIds(node._id) : [node._id];
    await FileNode.deleteMany({ _id: { $in: idsToDelete } });

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${node.project.toString()}`).emit("files-updated", {
        action: "permanent_delete",
        fileId: node._id,
        name: node.name,
        isFolder: node.isFolder,
        userId: req.user._id,
      });
    }

    res.status(200).json({
      success: true,
      message: `${node.isFolder ? "Folder" : "File"} permanently deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/files/projects/:projectId/trash
 * @desc    Empty project's Trash by permanently deleting all soft-deleted records (Owner/Admin only)
 * @access  Private (Owner/Admin only)
 */
export const emptyTrash = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const project = await findMemberProjectOrThrow(projectId, req.user._id);
    verifyProjectPermission(project, req.user._id, "Admin"); // Owner/Admin only
    assertProjectEditable(projectId, req.user);

    const deletedNodes = await FileNode.find({ project: projectId, isDeleted: true });
    if (deletedNodes.length === 0) {
      return res.status(200).json({
        success: true,
        message: "Trash is already empty",
        count: 0,
      });
    }

    // Durable audit log before permanent destruction
    await Activity.create({
      project: projectId,
      user: req.user._id,
      type: "DELETE",
      details: {
        action: "empty_trash",
        deletedCount: deletedNodes.length,
        names: deletedNodes.slice(0, 25).map((n) => n.name),
      },
    });

    // Delete disk artifacts safely
    for (const node of deletedNodes) {
      if (node.relativePath) {
        await deleteNodeFromDisk(project.owner, projectId, node.relativePath);
      }
    }

    const deleteResult = await FileNode.deleteMany({ project: projectId, isDeleted: true });

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${projectId.toString()}`).emit("files-updated", {
        action: "empty_trash",
        count: deleteResult.deletedCount,
        userId: req.user._id,
      });
    }

    res.status(200).json({
      success: true,
      message: "Trash emptied successfully",
      count: deleteResult.deletedCount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:projectId/trash
 * @desc    Get all soft-deleted files in a project for recovery
 * @access  Private (members only)
 */
export const getTrashFiles = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    await findMemberProjectOrThrow(projectId, req.user._id);

    const deletedFiles = await FileNode.find({ project: projectId, isDeleted: true })
      .populate("deletedBy", "name email")
      .sort({ deletedAt: -1 });

    res.status(200).json({
      success: true,
      count: deletedFiles.length,
      files: deletedFiles,
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
    resolveProjectPath(path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), projectId.toString()), relativePath);

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
        resolveProjectPath(path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), projectId.toString()), relativePath);

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
