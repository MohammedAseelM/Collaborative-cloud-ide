// src/models/message.model.js
// Responsibility: Define the schema for chat messages sent within a project workspace.

import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: [true, "Project ID is required"],
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Sender ID is required"],
    },
    text: {
      type: String,
      required: [true, "Message content is required"],
      trim: true,
      maxlength: [1000, "Message must be at most 1000 characters"],
    },
  },
  {
    timestamps: true,
  }
);

// Add index for fetching historical chat logs ordered by creation time
messageSchema.index({ project: 1, createdAt: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
