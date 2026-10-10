// src/controllers/version.controller.js
// Responsibility: Logic to save code snapshots, list saved snapshots,
// inspect snapshot details with full tree & file contents, and safely
// restore workspace code & folder hierarchy with real-time sync.

import fs from "fs";
import path from "path";
import Project from "../models/project.model.js";
import Version from "../models/version.model.js";
import FileNode from "../models/file.model.js";
import Activity from "../models/activity.model.js";
import { findMemberProjectOrThrow, verifyProjectPermission } from "./project.controller.js";
import { resolveProjectPath } from "../utils/projectPath.js";
import { env } from "../config/env.js";
import logger from "../utils/logger.js";

/**
 * @route   POST /api/projects/:id/versions
 * @desc    Save a new project version snapshot with full file hierarchy & contents
 * @access  Private (members with Editor permission or higher)
 */
export const createVersion = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");

    const { name, description } = req.body;

    // Get latest version number to auto-increment
    const latestVersion = await Version.findOne({ project: project._id })
      .sort({ versionNumber: -1 });

    const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;
    const snapshotName = (name && name.trim()) || `Snapshot v${versionNumber}`;
    const snapshotDesc = (description && description.trim()) || "";

    // Fetch all active, non-deleted files and folders for this project
    const activeNodes = await FileNode.find({
      project: project._id,
      isDeleted: false,
    }).sort({ isFolder: -1, relativePath: 1, name: 1 });

    // Build snapshot file items preserving relative tree linkages and contents
    const snapshotFiles = activeNodes.map((node) => ({
      originalId: node._id,
      name: node.name,
      isFolder: Boolean(node.isFolder),
      parentId: node.parentId ? node.parentId.toString() : null,
      relativePath: node.relativePath || "",
      content: node.isFolder ? "" : (node.content || ""),
      language: node.language || "",
      size: node.size || 0,
    }));

    const totalFiles = snapshotFiles.filter((f) => !f.isFolder).length;
    const totalFolders = snapshotFiles.filter((f) => f.isFolder).length;

    // Determine primary code string for backward compatibility / Monaco diff preview
    let primaryCode = project.code || "";
    const mainFile = snapshotFiles.find(
      (f) => !f.isFolder && (
        f.name === "main.jsx" ||
        f.name === "App.jsx" ||
        f.name === "index.js" ||
        f.name === "index.html" ||
        f.name.endsWith(".js") ||
        f.name.endsWith(".jsx")
      )
    );
    if (mainFile && mainFile.content) {
      primaryCode = mainFile.content;
    } else if (snapshotFiles.length > 0) {
      const firstWithContent = snapshotFiles.find((f) => !f.isFolder && f.content);
      if (firstWithContent) primaryCode = firstWithContent.content;
    }

    const version = await Version.create({
      project: project._id,
      name: snapshotName,
      code: primaryCode,
      versionNumber,
      description: snapshotDesc,
      files: snapshotFiles,
      totalFiles,
      totalFolders,
      metadata: {
        projectType: project.projectType || "general",
        activeNodeCount: activeNodes.length,
      },
      createdBy: req.user._id,
    });

    // Durable audit logging
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "SAVE_VERSION",
      details: {
        versionNumber,
        name: version.name,
        description: version.description,
        totalFiles,
        totalFolders,
      },
    });

    res.status(201).json({
      success: true,
      message: `Version ${versionNumber} ("${version.name}") saved successfully`,
      version,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:id/versions
 * @desc    Get all saved versions for a project (summary list)
 * @access  Private (members only)
 */
export const getVersions = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);
    const versions = await Version.find({ project: project._id })
      .sort({ versionNumber: -1 })
      .select("-files.content") // Keep list response token-efficient
      .populate("createdBy", "name email");

    res.status(200).json({
      success: true,
      count: versions.length,
      versions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:id/versions/:versionId
 * @desc    Inspect full snapshot details with tree hierarchy and file contents
 * @access  Private (members only)
 */
export const getVersionById = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);
    const { versionId } = req.params;

    const version = await Version.findOne({
      _id: versionId,
      project: project._id,
    }).populate("createdBy", "name email");

    if (!version) {
      const error = new Error("Version snapshot not found");
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      version,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:id/versions/:versionId/restore
 * @desc    Restore project files & folders to a previous snapshot state
 * @access  Private (members with Editor permission or higher)
 */
export const restoreVersion = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    const { versionId } = req.params;

    const version = await Version.findOne({ _id: versionId, project: project._id });
    if (!version) {
      const error = new Error("Version snapshot not found");
      error.statusCode = 404;
      throw error;
    }

    // 1. SAFETY RECOVERY PATH: Auto-save current workspace state prior to restoring
    // so user can seamlessly revert accidental restorations
    const currentActiveNodes = await FileNode.find({
      project: project._id,
      isDeleted: false,
    });

    if (currentActiveNodes.length > 0) {
      const latestVer = await Version.findOne({ project: project._id }).sort({ versionNumber: -1 });
      const safetyVersionNumber = latestVer ? latestVer.versionNumber + 1 : 1;
      const safetyFiles = currentActiveNodes.map((n) => ({
        originalId: n._id,
        name: n.name,
        isFolder: Boolean(n.isFolder),
        parentId: n.parentId ? n.parentId.toString() : null,
        relativePath: n.relativePath || "",
        content: n.isFolder ? "" : (n.content || ""),
        language: n.language || "",
        size: n.size || 0,
      }));

      await Version.create({
        project: project._id,
        name: `Auto-backup before v${version.versionNumber} restore`,
        code: project.code || "",
        versionNumber: safetyVersionNumber,
        description: `Safety auto-save created prior to restoring snapshot v${version.versionNumber} ("${version.name || ""}")`,
        files: safetyFiles,
        totalFiles: safetyFiles.filter((f) => !f.isFolder).length,
        totalFolders: safetyFiles.filter((f) => f.isFolder).length,
        metadata: { isAutoRollbackBackup: true, restoredTargetVersion: version.versionNumber },
        createdBy: req.user._id,
      });
    }

    // 2. Clear existing active project nodes before restoring snapshot (safety backup was saved above)
    await FileNode.deleteMany({ project: project._id });

    // 3. RECREATE SNAPSHOT NODES
    let restoredFileCount = 0;
    let restoredFolderCount = 0;

    if (Array.isArray(version.files) && version.files.length > 0) {
      const idMap = new Map(); // Maps snapshot originalId / index string to new FileNode._id

      // Step A: Separate folders and files
      const snapshotFolders = version.files.filter((f) => f.isFolder);
      const snapshotFiles = version.files.filter((f) => !f.isFolder);

      // Step B: Recreate folders hierarchically
      const pendingFolders = [...snapshotFolders];
      let iterations = 0;
      const maxIterations = 20;

      while (pendingFolders.length > 0 && iterations < maxIterations) {
        iterations++;
        const remaining = [];

        for (const folder of pendingFolders) {
          const parentKey = folder.parentId ? folder.parentId.toString() : null;
          // Root folders (parentKey null) or folders whose parent has already been created
          if (!parentKey || idMap.has(parentKey)) {
            const mappedParentId = parentKey ? idMap.get(parentKey) : null;
            const newFolder = await FileNode.create({
              name: folder.name,
              isFolder: true,
              project: project._id,
              parentId: mappedParentId,
              relativePath: folder.relativePath || folder.name,
              createdBy: req.user._id,
              updatedBy: req.user._id,
              isDeleted: false,
            });

            const originalKey = folder.originalId ? folder.originalId.toString() : null;
            if (originalKey) {
              idMap.set(originalKey, newFolder._id);
            }
            // Also map by relative path for robust lookup
            if (folder.relativePath) {
              idMap.set(folder.relativePath, newFolder._id);
            }
            restoredFolderCount++;
          } else {
            remaining.push(folder);
          }
        }

        // If no progress made, attach remaining folders at root level
        if (remaining.length === pendingFolders.length) {
          for (const folder of remaining) {
            const newFolder = await FileNode.create({
              name: folder.name,
              isFolder: true,
              project: project._id,
              parentId: null,
              relativePath: folder.relativePath || folder.name,
              createdBy: req.user._id,
              updatedBy: req.user._id,
              isDeleted: false,
            });
            const originalKey = folder.originalId ? folder.originalId.toString() : null;
            if (originalKey) idMap.set(originalKey, newFolder._id);
            restoredFolderCount++;
          }
          break;
        }

        pendingFolders.length = 0;
        pendingFolders.push(...remaining);
      }

      // Step C: Recreate files
      for (const file of snapshotFiles) {
        const parentKey = file.parentId ? file.parentId.toString() : null;
        let mappedParentId = null;
        if (parentKey && idMap.has(parentKey)) {
          mappedParentId = idMap.get(parentKey);
        } else if (file.relativePath && file.relativePath.includes("/")) {
          const parentPath = file.relativePath.substring(0, file.relativePath.lastIndexOf("/"));
          if (idMap.has(parentPath)) {
            mappedParentId = idMap.get(parentPath);
          }
        }

        await FileNode.create({
          name: file.name,
          isFolder: false,
          project: project._id,
          parentId: mappedParentId,
          content: file.content || "",
          relativePath: file.relativePath || file.name,
          language: file.language || "",
          size: Buffer.byteLength(file.content || "", "utf8"),
          createdBy: req.user._id,
          updatedBy: req.user._id,
          isDeleted: false,
        });
        restoredFileCount++;
      }

      // Step D: Sync restored files to disk
      try {
        const projectDir = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), project._id.toString());
        if (!fs.existsSync(projectDir)) {
          fs.mkdirSync(projectDir, { recursive: true });
        }
        for (const f of snapshotFiles) {
          if (!f.isFolder && f.relativePath) {
            const filePath = resolveProjectPath(projectDir, f.relativePath);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, f.content || "", "utf8");
          }
        }
      } catch (diskErr) {
        logger.warn(`Disk sync failed during version restore: ${diskErr.message}`);
      }
    } else if (version.code) {
      // Legacy snapshot fallback: check if code is React/JSX
      const isReact = /import\s+React|from\s+['"]react['"]|<[A-Z][a-zA-Z]*[\s/>]|export\s+default/.test(version.code);
      const fileName = isReact ? "App.jsx" : "index.js";
      await FileNode.create({
        name: fileName,
        isFolder: false,
        project: project._id,
        parentId: null,
        content: version.code,
        relativePath: fileName,
        language: "javascript",
        size: Buffer.byteLength(version.code, "utf8"),
        createdBy: req.user._id,
        updatedBy: req.user._id,
        isDeleted: false,
      });
      restoredFileCount = 1;

      if (isReact) {
        const companions = [
          {
            name: "index.html",
            relativePath: "index.html",
            language: "html",
            content: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n  <title>${project.name || "Sample React App"}</title>\n</head>\n<body>\n  <div id="root"></div>\n  <script type="module" src="/main.jsx"></script>\n</body>\n</html>\n`,
          },
          {
            name: "main.jsx",
            relativePath: "main.jsx",
            language: "javascript",
            content: `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App.jsx";\n\ncreateRoot(document.getElementById("root")).render(\n  <React.StrictMode>\n    <App />\n  </React.StrictMode>\n);\n`,
          },
          {
            name: "package.json",
            relativePath: "package.json",
            language: "json",
            content: JSON.stringify(
              {
                name: (project.name || "sample").toLowerCase().replace(/[^a-z0-9-]/g, "-"),
                private: true,
                version: "0.0.0",
                type: "module",
                scripts: {
                  dev: "vite --host 0.0.0.0",
                  build: "vite build",
                  preview: "vite preview --host 0.0.0.0",
                },
                dependencies: {
                  react: "^18.3.1",
                  "react-dom": "^18.3.1",
                },
                devDependencies: {
                  "@vitejs/plugin-react": "^4.3.4",
                  vite: "^6.0.0",
                },
              },
              null,
              2
            ),
          },
          {
            name: "vite.config.js",
            relativePath: "vite.config.js",
            language: "javascript",
            content: `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    host: "0.0.0.0",\n    port: 5173,\n    strictPort: false,\n  },\n});\n`,
          },
        ];
        for (const comp of companions) {
          await FileNode.create({
            name: comp.name,
            isFolder: false,
            project: project._id,
            parentId: null,
            content: comp.content,
            relativePath: comp.relativePath,
            language: comp.language,
            size: Buffer.byteLength(comp.content, "utf8"),
            createdBy: req.user._id,
            updatedBy: req.user._id,
            isDeleted: false,
          });
          restoredFileCount++;
        }
      }

      // Sync to disk
      try {
        const projectDir = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), project._id.toString());
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
        const createdNodes = await FileNode.find({ project: project._id, isDeleted: false });
        for (const n of createdNodes) {
          if (!n.isFolder) {
            const targetPath = resolveProjectPath(projectDir, n.relativePath || n.name);
            fs.mkdirSync(path.dirname(targetPath), { recursive: true });
            fs.writeFileSync(targetPath, n.content || "", "utf8");
          }
        }
      } catch (diskErr) {
        logger.warn(`Disk sync failed during fallback restore: ${diskErr.message}`);
      }
    }

    // 4. Update project model
    project.code = version.code || project.code || "";
    project.lastEditedBy = req.user._id;
    project.lastEditedAt = new Date();
    await project.save();

    // 5. Durable audit log
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "RESTORE_VERSION",
      details: {
        versionNumber: version.versionNumber,
        name: version.name,
        restoredFileCount,
        restoredFolderCount,
      },
    });

    const activeFiles = await FileNode.find({ project: project._id, isDeleted: false }).sort({ isFolder: -1, name: 1 });

    // 6. REAL-TIME COLLABORATION BROADCAST (Socket.IO)
    const io = req.app.get("io");
    if (io) {
      io.to(`project:${project._id}`).emit("files-updated", {
        action: "restore",
        versionNumber: version.versionNumber,
        versionName: version.name,
        userId: req.user._id,
        files: activeFiles,
      });
      io.to(`project:${project._id}`).emit("project-version-restored", {
        projectId: project._id.toString(),
        versionNumber: version.versionNumber,
        versionName: version.name,
        restoredBy: req.user.name || "Collaborator",
        files: activeFiles,
      });
    }

    res.status(200).json({
      success: true,
      message: `Project restored to Version ${version.versionNumber} ("${version.name || ""}") successfully`,
      versionNumber: version.versionNumber,
      name: version.name,
      code: version.code,
      files: activeFiles,
      restoredFileCount,
      restoredFolderCount,
    });
  } catch (error) {
    next(error);
  }
};

