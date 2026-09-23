// src/models/version.model.js
// Responsibility: Define the schema/model for code snapshots (versions).
// Separate collection prevents project documents from exceeding the 16MB limit.

import mongoose from "mongoose";

const versionSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project ID is required"],
      index: true,
    },
    code: {
      type: String,
      required: [true, "Code content is required"],
    },
    versionNumber: {
      type: Number,
      required: [true, "Version number is required"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [200, "Description must be at most 200 characters"],
      default: "Auto-save snapshot",
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
