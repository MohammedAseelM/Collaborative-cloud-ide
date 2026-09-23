// src/models/activity.model.js
// Responsibility: Define the schema/model for project activity log history.

import mongoose from "mongoose";

const activitySchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project ID is required"],
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User ID is required"],
    },
    type: {
      type: String,
      required: true,
      enum: [
        "CREATE",
        "EDIT",
        "RUN",
        "SAVE_VERSION",
        "RESTORE_VERSION",
        "JOIN",
        "LEAVE",
        "ADD_MEMBER",
        "REMOVE_MEMBER",
      ],
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // only log event timestamp
  }
);

// Optimize fetching activity history for a project
activitySchema.index({ project: 1, createdAt: -1 });

const Activity = mongoose.model("Activity", activitySchema);

export default Activity;
