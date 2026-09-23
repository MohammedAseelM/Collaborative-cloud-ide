// src/controllers/project.controller.js
// Responsibility: Business logic for creating, listing, searching,
// renaming, and deleting projects, plus managing collaboration members.

import Project from "../models/project.model.js";
import User from "../models/user.model.js";
import FileNode from "../models/file.model.js";
import Activity from "../models/activity.model.js";
import escapeRegex from "../utils/escapeRegex.js";
import fs from "fs";
import path from "path";
import { env } from "../config/env.js";
import { createReactProject } from "../services/reactProjectService.js";

/**
 * Helper: fetches a project by ID and verifies the current user owns it.
 */
const findOwnedProjectOrThrow = async (projectId, userId) => {
  const project = await Project.findById(projectId);

  if (!project || project.owner.toString() !== userId.toString()) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }

  return project;
};

/**
 * Helper: fetches a project by ID and verifies the user is a member (owner or collaborator).
 */
export const findMemberProjectOrThrow = async (projectId, userId) => {
  const project = await Project.findById(projectId);

  if (!project || !project.members.some((m) => m.toString() === userId.toString())) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }

  return project;
};

/**
 * Helper: retrieves the role of a user in a project.
 */
export const getMemberRole = (project, userId) => {
  if (project.owner.toString() === userId.toString()) return "Owner";
  return project.memberRoles?.get(userId.toString()) || "Editor";
};

/**
 * Helper: verifies if a user has at least the minimum required role level.
 */
export const verifyProjectPermission = (project, userId, minimumRole) => {
  const role = getMemberRole(project, userId);
  const roleLevels = {
    Owner: 4,
    Admin: 3,
    Editor: 2,
    Viewer: 1,
    Client: 1,
  };
  const userLevel = roleLevels[role] || 2;
  const requiredLevel = roleLevels[minimumRole] || 2;

  if (userLevel < requiredLevel) {
    const error = new Error(`Not authorized. Minimum role of "${minimumRole}" is required.`);
    error.statusCode = 403;
    throw error;
  }
};

/**
 * @route   POST /api/projects
 * @desc    Create a new project owned by the current user with an empty workspace
 * @access  Private
 */
export const createProject = async (req, res, next) => {
  try {
    const { name, description, language } = req.body;

    if (language === "react") {
      const io = req.app.get("io");
      const result = await createReactProject({
        userId: req.user._id,
        name,
        description,
        io,
      });
      return res.status(201).json({
        success: true,
        message: "React project created successfully",
        project: result.project,
      });
    }

    const project = await Project.create({
      name,
      description,
      language,
      code: "",
      owner: req.user._id,
      members: [req.user._id],
      memberRoles: {
        [req.user._id.toString()]: "Owner",
      },
    });

    // Create physical workspace directory
    const projectDir = path.join(env.WORKSPACE_ROOT, req.user._id.toString(), project._id.toString());
    fs.mkdirSync(projectDir, { recursive: true });

    // Determine default starter file name based on language
    const defaultFilenames = {
      javascript: "index.js",
      python: "main.py",
      java: "Main.java",
      cpp: "main.cpp",
      c: "main.c",
      typescript: "index.ts",
      other: "code.txt",
    };
    const filename = defaultFilenames[language] || defaultFilenames.other;

    // Create the default file in the files collection
    await FileNode.create({
      name: filename,
      isFolder: false,
      project: project._id,
      parentId: null,
      content: "",
      relativePath: filename,
      createdBy: req.user._id,
    });

    try {
      fs.writeFileSync(path.join(projectDir, filename), "", "utf-8");
    } catch {
      // Ignore write errors in memory test environments
    }

    // Log project creation activity
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "CREATE",
      details: { name },
    });

    res.status(201).json({
      success: true,
      message: "Project created successfully",
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects
 * @desc    List projects the user is a member of, with search, pagination, and sorting
 * @access  Private
 */
export const getProjects = async (req, res, next) => {
  try {
    const { search, favorite, archived, sortBy } = req.query;
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 6;
    const skip = (page - 1) * limit;

    const filter = { members: req.user._id };

    if (search) {
      filter.name = { $regex: escapeRegex(search), $options: "i" };
    }

    if (favorite === "true") {
      filter.favorites = req.user._id;
    }

    if (archived === "true") {
      filter.isArchived = true;
    } else {
      filter.isArchived = { $ne: true };
    }

    let sortOptions = { updatedAt: -1 };
    if (sortBy === "name") sortOptions = { name: 1 };
    if (sortBy === "createdAt") sortOptions = { createdAt: -1 };
    if (sortBy === "updatedAt") sortOptions = { updatedAt: -1 };

    const total = await Project.countDocuments(filter);
    const projects = await Project.find(filter)
      .sort(sortOptions)
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
 * @route   GET /api/projects/:id
 * @desc    Get a single project by ID (accessible to members)
 * @access  Private (members only)
 */
export const getProjectById = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/projects/:id
 * @desc    Update a project's name/description/language
 * @access  Private (owner only)
 */
export const updateProject = async (req, res, next) => {
  try {
    const project = await findOwnedProjectOrThrow(req.params.id, req.user._id);
    const { name, description, language } = req.body;

    if (name !== undefined) project.name = name;
    if (description !== undefined) project.description = description;
    if (language !== undefined) project.language = language;

    await project.save();

    res.status(200).json({
      success: true,
      message: "Project updated successfully",
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/projects/:id
 * @desc    Delete a project and its associated snapshot history
 * @access  Private (owner only)
 */
export const deleteProject = async (req, res, next) => {
  try {
    const project = await findOwnedProjectOrThrow(req.params.id, req.user._id);

    await project.deleteOne();

    res.status(200).json({
      success: true,
      message: "Project deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:id/members
 * @desc    Add a member to the project by email
 * @access  Private (owner only)
 */
export const addMember = async (req, res, next) => {
  try {
    const project = await findOwnedProjectOrThrow(req.params.id, req.user._id);
    const { email } = req.body;

    if (!email) {
      const error = new Error("Collaborator email is required");
      error.statusCode = 400;
      throw error;
    }

    const collaborator = await User.findOne({ email });
    if (!collaborator) {
      const error = new Error("User not found with this email");
      error.statusCode = 404;
      throw error;
    }

    if (project.members.some((m) => m.toString() === collaborator._id.toString())) {
      const error = new Error("User is already a member of this project");
      error.statusCode = 400;
      throw error;
    }

    project.members.push(collaborator._id);
    if (!project.memberRoles) {
      project.memberRoles = new Map();
    }
    project.memberRoles.set(collaborator._id.toString(), "Editor");
    await project.save();

    // Log add member activity
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "ADD_MEMBER",
      details: { memberName: collaborator.name, memberEmail: email },
    });

    res.status(200).json({
      success: true,
      message: `${collaborator.name} added to project successfully`,
      members: project.members,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/projects/:id/members/:memberId
 * @desc    Remove a member from the project (or leave the project)
 * @access  Private (owner or self removing self)
 */
export const removeMember = async (req, res, next) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      const error = new Error("Project not found");
      error.statusCode = 404;
      throw error;
    }

    const memberId = req.params.memberId || req.params.userId;
    const isOwner = project.owner.toString() === req.user._id.toString();
    const requesterRole = project.memberRoles?.get(req.user._id.toString());
    const isRequesterAdmin = requesterRole === "Admin";
    const isSelfRemoving = req.user._id.toString() === memberId;

    if (!isOwner && !isRequesterAdmin && !isSelfRemoving) {
      const error = new Error("Not authorized to remove members from this project");
      error.statusCode = 403;
      throw error;
    }

    if (project.owner.toString() === memberId) {
      const error = new Error("Owner cannot be removed from the project");
      error.statusCode = 400;
      throw error;
    }

    // Admins cannot remove other Admins
    const targetRole = project.memberRoles?.get(memberId);
    if (isRequesterAdmin && !isSelfRemoving && targetRole === "Admin") {
      const error = new Error("Admins cannot remove other Admins");
      error.statusCode = 403;
      throw error;
    }

    project.members = project.members.filter((m) => m.toString() !== memberId);
    if (project.memberRoles) {
      project.memberRoles.delete(memberId);
    }
    await project.save();

    // Log activity
    const removedUser = await User.findById(memberId);
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: isSelfRemoving ? "LEAVE" : "REMOVE_MEMBER",
      details: { memberName: removedUser ? removedUser.name : "Unknown User" },
    });

    // Notify workspace socket room of membership removal
    const io = req.app.get("io");
    if (io) {
      io.to(`project:${project._id.toString()}`).emit("member-removed", {
        userId: memberId,
        name: removedUser ? removedUser.name : "Member",
      });
    }

    res.status(200).json({
      success: true,
      message: isSelfRemoving ? "Left the project successfully" : "Member removed successfully",
      members: project.members,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:id/members
 * @desc    Get all members of a project
 * @access  Private (members only)
 */
export const getMembers = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);
    const populatedProject = await Project.findById(project._id).populate("members", "name email");
    const members = populatedProject.members.map((member) => ({
      _id: member._id,
      name: member.name,
      email: member.email,
      role: populatedProject.owner.toString() === member._id.toString()
        ? "Owner"
        : populatedProject.memberRoles?.get(member._id.toString()) || "Editor",
    }));

    res.status(200).json({
      success: true,
      members,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/projects/:id/archive
 * @desc    Toggle project archive status
 * @access  Private (Owner or Admin only)
 */
export const toggleArchiveProject = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);
    verifyProjectPermission(project, req.user._id, "Admin");

    project.isArchived = !project.isArchived;
    await project.save();

    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "EDIT",
      details: { action: project.isArchived ? "archive" : "unarchive" },
    });

    res.status(200).json({
      success: true,
      message: `Project ${project.isArchived ? "archived" : "unarchived"} successfully`,
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/projects/:id/favorite
 * @desc    Toggle project favorite status for current user
 * @access  Private (members only)
 */
export const toggleFavoriteProject = async (req, res, next) => {
  try {
    const project = await findMemberProjectOrThrow(req.params.id, req.user._id);

    const userIndex = project.favorites.indexOf(req.user._id);
    let isFavorite = false;

    if (userIndex > -1) {
      project.favorites.splice(userIndex, 1);
    } else {
      project.favorites.push(req.user._id);
      isFavorite = true;
    }

    // Use save with version handling to avoid conflicts
    try {
      await project.save();
    } catch (saveError) {
      if (saveError.name === 'VersionError') {
        // Reload the project and try again
        const freshProject = await Project.findById(req.params.id);
        const freshUserIndex = freshProject.favorites.indexOf(req.user._id);
        
        if (freshUserIndex > -1) {
          freshProject.favorites.splice(freshUserIndex, 1);
        } else {
          freshProject.favorites.push(req.user._id);
          isFavorite = true;
        }
        
        await freshProject.save();
        freshProject.__v = undefined; // Remove version key from response
        return res.status(200).json({
          success: true,
          message: `Project ${isFavorite ? "added to" : "removed from"} favorites successfully`,
          project: freshProject,
        });
      }
      throw saveError;
    }

    project.__v = undefined; // Remove version key from response
    res.status(200).json({
      success: true,
      message: `Project ${isFavorite ? "added to" : "removed from"} favorites successfully`,
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/projects/:id/member/:userId/role
 * @desc    Change collaborator's role in the project
 * @access  Private (Owner or Admin only)
 */
export const updateMemberRole = async (req, res, next) => {
  try {
    const { id, userId } = req.params;
    const { role } = req.body;

    if (!role || !["Admin", "Editor", "Viewer", "Client"].includes(role)) {
      const error = new Error("Invalid role specified");
      error.statusCode = 400;
      throw error;
    }

    const project = await Project.findById(id);
    if (!project) {
      const error = new Error("Project not found");
      error.statusCode = 404;
      throw error;
    }

    // Requester must be Owner or Admin
    const isOwner = project.owner.toString() === req.user._id.toString();
    const requesterRole = project.memberRoles?.get(req.user._id.toString());
    const isRequesterAdmin = requesterRole === "Admin";

    if (!isOwner && !isRequesterAdmin) {
      const error = new Error("Not authorized to change roles in this project");
      error.statusCode = 403;
      throw error;
    }

    // Check if target user is a member
    const isMember = project.members.some((m) => m.toString() === userId);
    if (!isMember) {
      const error = new Error("User is not a member of this project");
      error.statusCode = 400;
      throw error;
    }

    // Cannot change owner's role
    if (project.owner.toString() === userId) {
      const error = new Error("Cannot change role of the project owner");
      error.statusCode = 400;
      throw error;
    }

    // Admin cannot promote someone to Admin, only Owner can, and Admin cannot change Admin roles
    const targetRole = project.memberRoles?.get(userId);
    if (isRequesterAdmin && (targetRole === "Admin" || role === "Admin")) {
      const error = new Error("Admins can only manage Editors, Viewers, and Clients");
      error.statusCode = 403;
      throw error;
    }

    if (!project.memberRoles) {
      project.memberRoles = new Map();
    }
    project.memberRoles.set(userId, role);
    await project.save();

    // Log activity
    const targetUser = await User.findById(userId);
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "EDIT",
      details: { action: "change_role", memberName: targetUser ? targetUser.name : "Member", role },
    });

    // Notify other workspace users via socket
    const io = req.app.get("io");
    if (io) {
      io.to(`project:${id}`).emit("member-role-updated", { userId, role });
    }

    res.status(200).json({
      success: true,
      message: "Member role updated successfully",
      memberRoles: Object.fromEntries(project.memberRoles),
    });
  } catch (error) {
    next(error);
  }
};
