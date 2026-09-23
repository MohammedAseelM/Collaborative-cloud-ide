// src/models/project.model.js
// Responsibility: Define the Mongoose schema/model for a Project.
// A Project belongs to one owner (the user who created it) and will
// later support multiple collaborating members, files, and a chosen
// language/runtime for compilation.

import mongoose from "mongoose";

const projectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Project name is required"],
      trim: true,
      minlength: [2, "Project name must be at least 2 characters"],
      maxlength: [100, "Project name must be at most 100 characters"],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description must be at most 500 characters"],
      default: "",
    },
    // The user who created the project. Only the owner can rename or
    // delete it (see the ownership check in project.controller.js).
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Reserved for real-time collaboration in a later phase - the list
    // of users (besides the owner) who can access this project.
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    memberRoles: {
      type: Map,
      of: {
        type: String,
        enum: ["Owner", "Admin", "Editor", "Viewer", "Client"],
      },
      default: {},
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    // Reserved for the "compile code" feature in a later phase.
    language: {
      type: String,
      enum: [
        "javascript",
        "python",
        "java",
        "cpp",
        "c",
        "typescript",
        "other",
      ],
      default: "javascript",
    },
    code: {
      type: String,
      default: "",
    },
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastEditedAt: {
      type: Date,
    },
    // Full-App Execution attributes
    projectType: {
      type: String,
      default: "general",
    },
    startCommand: {
      type: String,
      default: "",
    },
    installCommand: {
      type: String,
      default: "",
    },
    devServerPort: {
      type: Number,
      default: null,
    },
    serverStatus: {
      type: String,
      enum: ["stopped", "installing", "starting", "running", "error", "creating", "building", "ready", "previewing"],
      default: "stopped",
    },
  },
  {
    timestamps: true, // createdAt / updatedAt - used to sort "recent" projects
  }
);

// Speeds up the dashboard's "search my projects by name" query, which
// filters by owner and matches against name.
projectSchema.index({ owner: 1, name: 1 });

const Project = mongoose.model("Project", projectSchema);

export default Project;
