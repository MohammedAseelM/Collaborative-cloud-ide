// src/controllers/invitation.controller.js
// Responsibility: Manage project collaboration invitations.
// Handles invitation creations, pending list retrievals, cancellations, and acceptances.

import crypto from "crypto";
import Invitation from "../models/invitation.model.js";
import Project from "../models/project.model.js";
import User from "../models/user.model.js";
import Notification from "../models/notification.model.js";
import Activity from "../models/activity.model.js";
import { findMemberProjectOrThrow } from "./project.controller.js";

/**
 * Helper: check if a user is Owner or Admin of a project.
 */
export const checkProjectAdminOrOwner = async (projectId, userId) => {
  const project = await Project.findById(projectId);
  if (!project) {
    const error = new Error("Project not found");
    error.statusCode = 404;
    throw error;
  }

  const isOwner = project.owner.toString() === userId.toString();
  const isAdmin = project.memberRoles?.get(userId.toString()) === "Admin";

  if (!isOwner && !isAdmin) {
    const error = new Error("Not authorized. Owner or Admin permissions required.");
    error.statusCode = 403;
    throw error;
  }

  return project;
};

/**
 * @route   POST /api/projects/:id/invitations
 * @desc    Invite a user to a project via email
 * @access  Private (Owner or Admin only)
 */
export const createInvitation = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    const { email, role } = req.body;

    if (!email) {
      const error = new Error("Email is required");
      error.statusCode = 400;
      throw error;
    }

    const assignedRole = role || "Editor";
    if (!["Admin", "Editor", "Viewer", "Client"].includes(assignedRole)) {
      const error = new Error("Invalid role specified");
      error.statusCode = 400;
      throw error;
    }

    const project = await checkProjectAdminOrOwner(projectId, req.user._id);

    // If invitee is already a member, throw error
    const invitee = await User.findOne({ email: email.toLowerCase() });
    if (invitee && project.members.some((m) => m.toString() === invitee._id.toString())) {
      const error = new Error("User is already a member of this project");
      error.statusCode = 400;
      throw error;
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days expiry

    // Delete existing pending invitation for this project + email to prevent duplication
    await Invitation.findOneAndDelete({ project: projectId, email: email.toLowerCase() });

    // Save invitation
    const invitation = await Invitation.create({
      project: projectId,
      email: email.toLowerCase(),
      role: assignedRole,
      token,
      expiresAt,
      invitedBy: req.user._id,
    });

    // If invitee is registered, send them an in-app notification
    if (invitee) {
      const notification = await Notification.create({
        recipient: invitee._id,
        type: "INVITE",
        title: "Project Invitation",
        message: `${req.user.name} invited you to collaborate on the project "${project.name}" as an ${assignedRole}.`,
        relatedProject: project._id,
      });

      const io = req.app.get("io");
      if (io) {
        io.to(`user:${invitee._id.toString()}`).emit("notification-received", notification);
      }
    }

    res.status(201).json({
      success: true,
      message: `Invitation sent to ${email} successfully`,
      invitation: {
        _id: invitation._id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/projects/:id/invitations
 * @desc    Get all pending invitations for a project
 * @access  Private (Owner or Admin only)
 */
export const getProjectInvitations = async (req, res, next) => {
  try {
    const projectId = req.params.id;
    await checkProjectAdminOrOwner(projectId, req.user._id);

    const invitations = await Invitation.find({ project: projectId }).select("-token");

    res.status(200).json({
      success: true,
      count: invitations.length,
      invitations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/invitations/:id
 * @desc    Cancel/delete a pending invitation
 * @access  Private (Owner or Admin of project)
 */
export const cancelInvitation = async (req, res, next) => {
  try {
    const invitationId = req.params.id;
    const invitation = await Invitation.findById(invitationId);
    if (!invitation) {
      const error = new Error("Invitation not found");
      error.statusCode = 404;
      throw error;
    }

    await checkProjectAdminOrOwner(invitation.project, req.user._id);

    await invitation.deleteOne();

    res.status(200).json({
      success: true,
      message: "Invitation cancelled successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/invitations/:id/resend
 * @desc    Resend a pending invitation and renew expiry date
 * @access  Private (Owner or Admin of project)
 */
export const resendInvitation = async (req, res, next) => {
  try {
    const invitationId = req.params.id;
    const invitation = await Invitation.findById(invitationId);
    if (!invitation) {
      const error = new Error("Invitation not found");
      error.statusCode = 404;
      throw error;
    }

    const project = await checkProjectAdminOrOwner(invitation.project, req.user._id);

    // Renew token and expiry date (7 days)
    invitation.token = crypto.randomBytes(32).toString("hex");
    invitation.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await invitation.save();

    // Check if invitee exists
    const invitee = await User.findOne({ email: invitation.email.toLowerCase() });
    if (invitee) {
      const notification = await Notification.create({
        recipient: invitee._id,
        type: "INVITE",
        title: "Project Invitation Resent",
        message: `${req.user.name} resent your invitation to join "${project.name}" as an ${invitation.role}.`,
        relatedProject: project._id,
      });

      const io = req.app.get("io");
      if (io) {
        io.to(`user:${invitee._id.toString()}`).emit("notification-received", notification);
      }
    }

    res.status(200).json({
      success: true,
      message: `Invitation resent to ${invitation.email} successfully`,
      invitation,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/users/invitations
 * @desc    Get all pending invitations for the logged-in user
 * @access  Private
 */
export const getUserInvitations = async (req, res, next) => {
  try {
    const invitations = await Invitation.find({ email: req.user.email.toLowerCase() })
      .populate("project", "name description language")
      .populate("invitedBy", "name email");

    res.status(200).json({
      success: true,
      count: invitations.length,
      invitations,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/invitations/:token/accept
 * @desc    Accept a project invitation
 * @access  Private
 */
export const acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.params;

    const invitation = await Invitation.findOne({ token });
    if (!invitation) {
      const error = new Error("Invalid or expired invitation token");
      error.statusCode = 400;
      throw error;
    }

    if (invitation.email.toLowerCase() !== req.user.email.toLowerCase()) {
      const error = new Error("Not authorized. This invitation was sent to a different email address.");
      error.statusCode = 403;
      throw error;
    }

    const project = await Project.findById(invitation.project);
    if (!project) {
      await invitation.deleteOne();
      const error = new Error("The project associated with this invitation has been deleted");
      error.statusCode = 404;
      throw error;
    }

    // Add user as member if not already added
    if (!project.members.some((m) => m.toString() === req.user._id.toString())) {
      project.members.push(req.user._id);
    }

    // Initialize roles Map if needed
    if (!project.memberRoles) {
      project.memberRoles = new Map();
    }
    project.memberRoles.set(req.user._id.toString(), invitation.role);
    await project.save();

    // Create activity record
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "JOIN",
      details: { role: invitation.role },
    });

    // Notify project creator/owner
    const notification = await Notification.create({
      recipient: project.owner,
      type: "ACTIVITY",
      title: "Invitation Accepted",
      message: `${req.user.name} accepted your invitation to join "${project.name}" as an ${invitation.role}.`,
      relatedProject: project._id,
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${project.owner.toString()}`).emit("notification-received", notification);
    }

    // Clean up invitation
    await invitation.deleteOne();

    res.status(200).json({
      success: true,
      message: `Joined project "${project.name}" successfully as ${invitation.role}`,
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/invitations/:id/accept
 * @desc    Accept a project invitation by ID
 * @access  Private
 */
export const acceptInvitationById = async (req, res, next) => {
  try {
    const invitationId = req.params.id;
    const invitation = await Invitation.findById(invitationId);
    if (!invitation) {
      const error = new Error("Invitation not found");
      error.statusCode = 404;
      throw error;
    }

    if (invitation.email.toLowerCase() !== req.user.email.toLowerCase()) {
      const error = new Error("Not authorized. This invitation was sent to a different email address.");
      error.statusCode = 403;
      throw error;
    }

    const project = await Project.findById(invitation.project);
    if (!project) {
      await invitation.deleteOne();
      const error = new Error("The project associated with this invitation has been deleted");
      error.statusCode = 404;
      throw error;
    }

    // Add user as member if not already added
    if (!project.members.some((m) => m.toString() === req.user._id.toString())) {
      project.members.push(req.user._id);
    }

    if (!project.memberRoles) {
      project.memberRoles = new Map();
    }
    project.memberRoles.set(req.user._id.toString(), invitation.role);
    await project.save();

    // Create activity record
    await Activity.create({
      project: project._id,
      user: req.user._id,
      type: "JOIN",
      details: { role: invitation.role },
    });

    // Notify project creator/owner
    const notification = await Notification.create({
      recipient: project.owner,
      type: "ACTIVITY",
      title: "Invitation Accepted",
      message: `${req.user.name} accepted your invitation to join "${project.name}" as an ${invitation.role}.`,
      relatedProject: project._id,
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`user:${project.owner.toString()}`).emit("notification-received", notification);
      io.to(`project:${project._id.toString()}`).emit("member-joined", {
        userId: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: invitation.role,
      });
    }

    await invitation.deleteOne();

    res.status(200).json({
      success: true,
      message: `Joined project "${project.name}" successfully as ${invitation.role}`,
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/invitations/:id/reject
 * @desc    Reject a project invitation by ID
 * @access  Private
 */
export const rejectInvitationById = async (req, res, next) => {
  try {
    const invitationId = req.params.id;
    const invitation = await Invitation.findById(invitationId);
    if (!invitation) {
      const error = new Error("Invitation not found");
      error.statusCode = 404;
      throw error;
    }

    if (invitation.email.toLowerCase() !== req.user.email.toLowerCase()) {
      const error = new Error("Not authorized. This invitation was sent to a different email address.");
      error.statusCode = 403;
      throw error;
    }

    await invitation.deleteOne();

    res.status(200).json({
      success: true,
      message: "Invitation declined successfully",
    });
  } catch (error) {
    next(error);
  }
};
