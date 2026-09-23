// src/controllers/task.controller.js
// Responsibility: Controllers for managing project tasks assigned by Owners and Admins.

import Task from "../models/task.model.js";
import User from "../models/user.model.js";
import Activity from "../models/activity.model.js";
import { findMemberProjectOrThrow, verifyProjectPermission } from "./project.controller.js";

/**
 * @route   GET /api/projects/:projectId/tasks
 * @desc    Get all tasks assigned in a project
 * @access  Private (Project members)
 */
export const getProjectTasks = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    await findMemberProjectOrThrow(projectId, req.user._id);

    const tasks = await Task.find({ project: projectId })
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: tasks.length,
      tasks,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/projects/:projectId/tasks
 * @desc    Assign a task to a project collaborator
 * @access  Private (Owner, Admin only)
 */
export const createProjectTask = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);

    // Only Owner and Admin can assign tasks
    verifyProjectPermission(project, req.user._id, "Admin");

    const { title, description, assignedTo, priority = "medium", dueDate } = req.body;

    if (!title || !title.trim()) {
      const error = new Error("Task title is required");
      error.statusCode = 400;
      throw error;
    }

    if (!assignedTo) {
      const error = new Error("Please select a team member to assign the task to");
      error.statusCode = 400;
      throw error;
    }

    // Verify assigned user is a member of the project
    const isMember = project.members.some((m) => m.toString() === assignedTo.toString());
    if (!isMember) {
      const error = new Error("Assigned user must be a member of this project");
      error.statusCode = 400;
      throw error;
    }

    const assignedUser = await User.findById(assignedTo).select("name email");
    if (!assignedUser) {
      const error = new Error("Assigned user not found");
      error.statusCode = 404;
      throw error;
    }

    const task = await Task.create({
      project: projectId,
      title: title.trim(),
      description: (description || "").trim(),
      assignedTo,
      assignedBy: req.user._id,
      priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
      dueDate: dueDate ? new Date(dueDate) : null,
      status: "pending",
    });

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email");

    // Log Activity
    await Activity.create({
      project: projectId,
      user: req.user._id,
      type: "EDIT",
      details: {
        action: "assign_task",
        title: title.trim(),
        assignedToName: assignedUser.name,
      },
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${projectId}`).emit("task-created", populatedTask);
    }

    res.status(201).json({
      success: true,
      message: `Task assigned to ${assignedUser.name} successfully`,
      task: populatedTask,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/projects/:projectId/tasks/:taskId/status
 * @desc    Update task status (pending | in_progress | completed)
 * @access  Private (Assignee, Admin, Owner)
 */
export const updateTaskStatus = async (req, res, next) => {
  try {
    const { projectId, taskId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);

    const task = await Task.findOne({ _id: taskId, project: projectId });
    if (!task) {
      const error = new Error("Task not found");
      error.statusCode = 404;
      throw error;
    }

    const { status } = req.body;
    if (!["pending", "in_progress", "completed"].includes(status)) {
      const error = new Error("Invalid status. Must be pending, in_progress, or completed.");
      error.statusCode = 400;
      throw error;
    }

    // Assignee, Owner, or Admin can update task status
    const isAssignee = task.assignedTo.toString() === req.user._id.toString();
    const isOwner = project.owner.toString() === req.user._id.toString();
    const isAdmin = project.memberRoles?.get(req.user._id.toString()) === "Admin";

    if (!isAssignee && !isOwner && !isAdmin) {
      const error = new Error("You are not authorized to update this task");
      error.statusCode = 403;
      throw error;
    }

    task.status = status;
    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate("assignedTo", "name email")
      .populate("assignedBy", "name email");

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${projectId}`).emit("task-updated", populatedTask);
    }

    res.status(200).json({
      success: true,
      message: "Task status updated successfully",
      task: populatedTask,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/projects/:projectId/tasks/:taskId
 * @desc    Delete a project task
 * @access  Private (Owner, Admin only)
 */
export const deleteTask = async (req, res, next) => {
  try {
    const { projectId, taskId } = req.params;
    const project = await findMemberProjectOrThrow(projectId, req.user._id);

    verifyProjectPermission(project, req.user._id, "Admin");

    const task = await Task.findOneAndDelete({ _id: taskId, project: projectId });
    if (!task) {
      const error = new Error("Task not found");
      error.statusCode = 404;
      throw error;
    }

    const io = req.app.get("io");
    if (io) {
      io.to(`project:${projectId}`).emit("task-deleted", { taskId });
    }

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
