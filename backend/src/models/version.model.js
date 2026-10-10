// src/models/version.model.js
// Responsibility: Define the schema/model for code snapshots (versions).
// Separate collection prevents project documents from exceeding the 16MB limit.

import mongoose from "mongoose";

const versionFileItemSchema = new mongoose.Schema(
  {
    originalId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isFolder: {
      type: Boolean,
      required: true,
      default: false,
    },
    parentId: {
      type: String,
      default: null,
    },
    relativePath: {
      type: String,
      default: "",
    },
    content: {
      type: String,
      default: "",
    },
    language: {
      type: String,
      default: "",
    },
    size: {
      type: Number,
      default: 0,
    },
  },
  { _id: false }
);

const versionSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project ID is required"],
      index: true,
    },
    name: {
      type: String,
      trim: true,
      maxlength: [100, "Snapshot name must be at most 100 characters"],
      default: "",
    },
    code: {
      type: String,
      default: "",
    },
    versionNumber: {
      type: Number,
      required: [true, "Version number is required"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description must be at most 500 characters"],
      default: "",
    },
    files: {
      type: [versionFileItemSchema],
      default: [],
    },
    totalFiles: {
      type: Number,
      default: 0,
    },
    totalFolders: {
      type: Number,
      default: 0,
    },
    metadata: {
      type: Object,
      default: {},
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator ID is required"],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // only log snapshot creation date
  }
);

// Optimize fetching all versions for a specific project sorted by versionNumber
versionSchema.index({ project: 1, versionNumber: -1 });

const Version = mongoose.model("Version", versionSchema);

export default Version;
