// src/controllers/user.controller.js
// Responsibility: Implement profile updating, password changes, and account deletion with db cleanup.

import User from "../models/user.model.js";
import Project from "../models/project.model.js";
import FileNode from "../models/file.model.js";
import Version from "../models/version.model.js";
import Activity from "../models/activity.model.js";
import Message from "../models/message.model.js";
import Invitation from "../models/invitation.model.js";

/**
 * @route   PUT /api/users/profile
 * @desc    Update user name and email
 * @access  Private
 */
export const updateProfile = async (req, res, next) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.user._id);

    if (name) user.name = name;
    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const emailExists = await User.findOne({ email: email.toLowerCase() });
      if (emailExists) {
        const error = new Error("An account with this email already exists");
        error.statusCode = 400;
        throw error;
      }
      user.email = email.toLowerCase();
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/users/password
 * @desc    Update user password
 * @access  Private
 */
export const updatePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      const error = new Error("Current and new passwords are required");
      error.statusCode = 400;
      throw error;
    }

    // Retrieve user with password selected
    const user = await User.findById(req.user._id).select("+password");

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      const error = new Error("Incorrect current password");
      error.statusCode = 401;
      throw error;
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/users
 * @desc    Delete user account and clean up their projects/activities
 * @access  Private
 */
export const deleteAccount = async (req, res, next) => {
  const userId = req.user._id;
  try {
    // 1. Delete all projects owned by the user, along with files and versions
    const ownedProjects = await Project.find({ owner: userId });
    for (const project of ownedProjects) {
      // Delete files
      await FileNode.deleteMany({ project: project._id });
      // Delete versions
      await Version.deleteMany({ project: project._id });
      // Delete messages
      await Message.deleteMany({ project: project._id });
      // Delete project invitations
      await Invitation.deleteMany({ project: project._id });
      // Delete activities
      await Activity.deleteMany({ project: project._id });
      // Delete project itself
      await project.deleteOne();
    }

    // 2. Remove the user from collaborator lists of other projects
    await Project.updateMany(
      { members: userId },
      { $pull: { members: userId } }
    );

    // Remove user roles Map entries in other projects
    const collaborativeProjects = await Project.find({ members: userId });
    for (const project of collaborativeProjects) {
      if (project.memberRoles) {
        project.memberRoles.delete(userId.toString());
        await project.save();
      }
    }

    // 3. Delete messages sent by user (or set sender to null/deleted)
    await Message.deleteMany({ sender: userId });

    // 4. Delete user invitations
    await Invitation.deleteMany({ email: req.user.email });

    // 5. Delete the User document
    await User.findByIdAndDelete(userId);

    // 6. Clear cookie
    res.cookie("token", "", {
      httpOnly: true,
      expires: new Date(0),
    });

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};
