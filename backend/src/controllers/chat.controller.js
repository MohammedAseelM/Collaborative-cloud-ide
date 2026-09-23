// src/controllers/chat.controller.js
// Responsibility: Handle fetching historical chat messages for a project workspace.

import Message from "../models/message.model.js";
import { findMemberProjectOrThrow } from "./project.controller.js";

/**
 * @route   GET /api/projects/:id/messages
 * @desc    Get historical chat messages for a project
 * @access  Private (members only)
 */
export const getProjectMessages = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    await findMemberProjectOrThrow(projectId, req.user._id);

    // Fetch messages, populate sender name and email
    const messages = await Message.find({ project: projectId })
      .populate("sender", "name email")
      .sort({ createdAt: 1 })
      .limit(100); // limit to last 100 messages for workspace sanity

    res.status(200).json({
      success: true,
      count: messages.length,
      messages,
    });
  } catch (error) {
    next(error);
  }
};
