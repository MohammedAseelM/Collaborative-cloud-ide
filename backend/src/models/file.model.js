// src/models/file.model.js
// Responsibility: Define the schema/model for files and folders inside a project.
// Flat listing with parent references optimizes queries and avoids the 16MB document limit.

import mongoose from "mongoose";

const fileNodeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "File or folder name is required"],
      trim: true,
      maxlength: [100, "Name must be at most 100 characters"],
    },
    isFolder: {
      type: Boolean,
      required: true,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project ID is required"],
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FileNode",
      default: null, // null means it's located at the root level of the project
    },
    content: {
      type: String,
      default: "", // Default content for files; empty for folders
    },
    relativePath: {
      type: String,
      default: "",
    },
    size: {
      type: Number,
      default: 0,
    },
    language: {
      type: String,
      default: "",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes to speed up queries for files in a project or folder
fileNodeSchema.index({ project: 1, parentId: 1 });
fileNodeSchema.index({ project: 1, name: 1, parentId: 1 }, { unique: true });

const FileNode = mongoose.model("FileNode", fileNodeSchema);

export default FileNode;
