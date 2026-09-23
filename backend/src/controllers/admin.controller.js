// src/controllers/admin.controller.js
// Responsibility: Implement administrator portal operations: analytics, user management, project governance, and log reading.

import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import User from "../models/user.model.js";
import Project from "../models/project.model.js";
import FileNode from "../models/file.model.js";
import Version from "../models/version.model.js";
import Activity from "../models/activity.model.js";
import Message from "../models/message.model.js";
import Invitation from "../models/invitation.model.js";
import escapeRegex from "../utils/escapeRegex.js";
import logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDir = path.resolve(path.join(__dirname, "../../logs"));

/**
 * @route   GET /api/admin/stats
 * @desc    Get aggregate analytics and system details
 * @access  Private (Admin only)
 */
export const getStats = async (req, res, next) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalProjects = await Project.countDocuments();
    const totalFiles = await FileNode.countDocuments({ isFolder: false });
    const totalFolders = await FileNode.countDocuments({ isFolder: true });
    
    // Count total compilation runs via Activities
    const totalCodeRuns = await Activity.countDocuments({ type: "RUN" });

    // Node & System Metrics
    const systemInfo = {
      platform: os.platform(),
      arch: os.arch(),
      totalMem: (os.totalmem() / (1024 * 1024 * 1024)).toFixed(2) + " GB",
      freeMem: (os.freemem() / (1024 * 1024 * 1024)).toFixed(2) + " GB",
      cpuCount: os.cpus().length,
      uptime: (os.uptime() / 3600).toFixed(2) + " hours",
      nodeVersion: process.version,
      memoryUsage: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2) + " MB",
    };

    res.status(200).json({
      success: true,
      stats: {
        totalUsers,
        totalProjects,
        totalFiles,
        totalFolders,
        totalCodeRuns,
      },
      systemInfo,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/users
 * @desc    List all users (with search and pagination)
 * @access  Private (Admin only)
 */
export const listUsers = async (req, res, next) => {
  try {
    const { search } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (search) {
      filter.$or = [
        { name: { $regex: escapeRegex(search), $options: "i" } },
        { email: { $regex: escapeRegex(search), $options: "i" } },
      ];
    }

    const total = await User.countDocuments(filter);
    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: users.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalUsers: total,
      users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/admin/users/:id
 * @desc    Force delete a user account and clean up database
 * @access  Private (Admin only)
 */
export const adminDeleteUser = async (req, res, next) => {
  const { id: userId } = req.params;
  try {
    const user = await User.findById(userId);
    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    if (user.role === "admin") {
      const error = new Error("Cannot delete another administrator account");
      error.statusCode = 400;
      throw error;
    }

    // Clean up projects owned by user
    const ownedProjects = await Project.find({ owner: userId });
    for (const project of ownedProjects) {
      await FileNode.deleteMany({ project: project._id });
      await Version.deleteMany({ project: project._id });
      await Message.deleteMany({ project: project._id });
      await Invitation.deleteMany({ project: project._id });
      await Activity.deleteMany({ project: project._id });
      await project.deleteOne();
    }

    // Remove from collaborator lists
    await Project.updateMany(
      { members: userId },
      { $pull: { members: userId } }
    );

    // Delete message history sent by user
    await Message.deleteMany({ sender: userId });

    // Delete pending user invitations
    await Invitation.deleteMany({ email: user.email });

    // Delete user
    await user.deleteOne();

    res.status(200).json({
      success: true,
      message: `User ${user.name} and all owned resources deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/projects
 * @desc    List all projects (with search, pagination, populating owner)
 * @access  Private (Admin only)
 */
export const listProjects = async (req, res, next) => {
  try {
    const { search } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const filter = {};
    if (search) {
      filter.name = { $regex: escapeRegex(search), $options: "i" };
    }

    const total = await Project.countDocuments(filter);
    const projects = await Project.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("owner", "name email");

    res.status(200).json({
      success: true,
      count: projects.length,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      totalProjects: total,
      projects,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/admin/projects/:id
 * @desc    Force delete a project and clean up database
 * @access  Private (Admin only)
 */
export const adminDeleteProject = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      const error = new Error("Project not found");
      error.statusCode = 404;
      throw error;
    }

    // Clean up all related items
    await FileNode.deleteMany({ project: project._id });
    await Version.deleteMany({ project: project._id });
    await Message.deleteMany({ project: project._id });
    await Invitation.deleteMany({ project: project._id });
    await Activity.deleteMany({ project: project._id });
    await project.deleteOne();

    res.status(200).json({
      success: true,
      message: `Project "${project.name}" deleted successfully`,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/logs
 * @desc    Retrieve Winston rotating log lines for today
 * @access  Private (Admin only)
 */
export const getLogs = async (req, res, next) => {
  try {
    // Construct log file name based on date (combined-YYYY-MM-DD.log)
    const todayStr = new Date().toISOString().split("T")[0];
    const logFilePath = path.join(logDir, `combined-${todayStr}.log`);

    if (!fs.existsSync(logFilePath)) {
      return res.status(200).json({
        success: true,
        message: "No logs recorded today yet.",
        logs: "",
      });
    }

    // Read log file content (limit to last 200 lines to prevent memory overflow)
    const content = fs.readFileSync(logFilePath, "utf8");
    const lines = content.trim().split("\n");
    const lastLines = lines.slice(-200).join("\n");

    res.status(200).json({
      success: true,
      logs: lastLines,
    });
  } catch (error) {
    next(error);
  }
};
