// src/routes/file.routes.js
// Responsibility: Register REST endpoints for managing project folders and files.

import express from "express";
import {
  getProjectFiles,
  createFileNode,
  renameFileNode,
  deleteFileNode,
  getFileContent,
  uploadFile,
  uploadFolder,
  importProject,
  importIntoProject,
  getProjectTree,
} from "../controllers/file.controller.js";
import { protect } from "../middlewares/auth.middleware.js";
import upload, { uploadMultiple } from "../config/multer.js";

const router = express.Router();

// Guard all endpoints
router.use(protect);

// Project import & tree operations
router.post("/projects/import", uploadMultiple.array("files", 500), importProject);
router.post("/projects/:projectId/import", uploadMultiple.array("files", 500), importIntoProject);
router.get("/projects/:projectId/tree", getProjectTree);

// Project specific file structures
router.get("/projects/:projectId/files", getProjectFiles);
router.post("/projects/:projectId/files", createFileNode);
router.post("/projects/:projectId/upload", upload.single('file'), uploadFile);
router.post("/projects/:projectId/upload-folder", uploadMultiple.array('files', 500), uploadFolder);

// Single file operations
router.route("/:fileId")
  .get(getFileContent)
  .patch(renameFileNode)
  .delete(deleteFileNode);

export default router;
