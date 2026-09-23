// src/models/invitation.model.js
// Responsibility: Define the schema for project collaboration invitations.
// Allows users to invite external users by email with a specific role and access token.

import mongoose from "mongoose";

const invitationSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project reference is required"],
    },
    email: {
      type: String,
      required: [true, "Invitee email is required"],
      lowercase: true,
      trim: true,
      match: [
        /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
        "Please provide a valid email address",
      ],
    },
    role: {
      type: String,
      enum: ["Admin", "Editor", "Viewer", "Client"],
      default: "Editor",
    },
    token: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-delete document from MongoDB when it expires
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
invitationSchema.index({ project: 1, email: 1 }, { unique: true });

const Invitation = mongoose.model("Invitation", invitationSchema);

export default Invitation;
