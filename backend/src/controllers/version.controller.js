// src/controllers/version.controller.js
// Responsibility: Logic to save code snapshots, list saved snapshots,
// and restore workspace code to a previous snapshot state.

import Project from "../models/project.model.js";
import Version from "../models/version.model.js";
import Activity from "../models/activity.model.js";
import { findMemberProjectOrThrow, verifyProjectPermission } from "./project.controller.js";

/**
 * @route   POST /api/projects/:id/versions
 * @desc    Save a new code version snapshot
 * @access  Private (members only)
 */
export const createVersion = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    const { description } = req.body;

    // Get latest version number to auto-increment
    const latestVersion = await Version.findOne({ project: project._id })
      .sort({ versionNumber: -1 });

    const versionNumber = latestVersion ? latestVersion.versionNumber + 1 : 1;

    const version = await Version.create({
      project: project._id,
      code: project.code || "",
      versionNumber,
      description: description || `Snapshot v${versionNumber}`,
      createdBy: req.user._id,
    });

    // Log save version activity
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "SAVE_VERSION",
      details: { versionNumber, description: version.description },
    });

    res.status(201).json({
      success: true,
      message: `Version ${versionNumber} saved successfully`,
      version,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:id/versions
 * @desc    Get all saved versions for a project
 * @access  Private (members only)
 */
export const getVersions = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);
    const versions = await Version.find({ project: project._id })
      .sort({ versionNumber: -1 })
      .populate("createdBy", "name email");

    res.status(200).json({
      success: true,
      count: versions.length,
      versions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:id/versions/:versionId/restore
 * @desc    Restore project code to a previous snapshot state
 * @access  Private (members only)
 */
export const restoreVersion = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);
    verifyProjectPermission(project, req.user._id, "Editor");
    const { versionId } = req.params;

    const version = await Version.findOne({ _id: versionId, project: project._id });
    if (!version) {
      const error = new Error("Version snapshot not found");
      error.statusCode = 404;
      throw error;
    }

    // Update project code content to snapshot code
    project.code = version.code;
    project.lastEditedBy = req.user._id;
    project.lastEditedAt = new Date();
    await project.save();

    // Log restore activity
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "RESTORE_VERSION",
      details: { versionNumber: version.versionNumber },
    });

    res.status(200).json({
      success: true,
      message: `Project restored to Version ${version.versionNumber} successfully`,
      code: version.code,
    });
  } catch (error) {
    next(error);
  }
};
