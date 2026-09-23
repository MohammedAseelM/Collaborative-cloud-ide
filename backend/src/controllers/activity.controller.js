// src/controllers/activity.controller.js

import Activity from "../models/activity.model.js";
import { findMemberProjectOrThrow } from "./project.controller.js";

/**
 * @route   GET /api/projects/:id/activities
 * @desc    Get recent activity history logs for the project timeline
 * @access  Private (members only)
 */
export const getActivities = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);

    const activities = await Activity.find({ project: project._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("user", "name email");

    res.status(200).json({
      success: true,
      count: activities.length,
      activities,
    });
  } catch (error) {
    next(error);
  }
};
