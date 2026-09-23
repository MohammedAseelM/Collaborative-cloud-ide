// src/controllers/auth.controller.js
// Responsibility: Business logic for authentication - registering,
// logging in, logging out, and returning the current logged-in user.
// Validation of request bodies is handled upstream by middleware, so
// controllers here can assume req.body is already well-formed.

import crypto from "crypto";
import mongoose from "mongoose";
import User from "../models/user.model.js";
import generateToken from "../utils/generateToken.js";
import { env } from "../config/env.js";

/**
 * @route   POST /api/auth/register
 * @desc    Create a new user account and log them in
 * @access  Public
 */
export const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      const error = new Error("An account with this email already exists");
      error.statusCode = 409; // Conflict
      throw error;
    }

    // Password hashing happens automatically via the pre-save hook
    // defined on the User model.
    const user = await User.create({ name, email, password });

    generateToken(res, user._id);

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate a user and issue a JWT
 * @access  Public
 */
export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Explicitly select password since the schema excludes it by default
    const user = await User.findOne({ email }).select("+password");

    // Use the same generic error message for "user not found" and
    // "wrong password" so attackers cannot enumerate valid emails.
    const invalidCredentialsError = () => {
      const error = new Error("Invalid email or password");
      error.statusCode = 401;
      return error;
    };

    if (!user) {
      throw invalidCredentialsError();
    }

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect) {
      throw invalidCredentialsError();
    }

    generateToken(res, user._id);

    res.status(200).json({
      success: true,
      message: "Logged in successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/logout
 * @desc    Clear the auth cookie, effectively logging the user out
 * @access  Private
 */
export const logoutUser = async (req, res, next) => {
  try {
    res.cookie("token", "", {
      httpOnly: true,
      expires: new Date(0), // immediately expire the cookie
      secure: env.NODE_ENV === "production",
      sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    });

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/auth/me
 * @desc    Return the currently authenticated user's profile
 * @access  Private (requires `protect` middleware)
 */
export const getMe = async (req, res, next) => {
  try {
    // req.user is attached by the `protect` middleware
    res.status(200).json({
      success: true,
      user: req.user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Generate password reset token and log/send link
 * @access  Public
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      // Return success anyway to avoid user enumeration attacks
      return res.status(200).json({
        success: true,
        message: "If that email exists in our system, we've sent a password reset link.",
      });
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(20).toString("hex");

    // Hash token and store with expiry in user document
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 30 * 60 * 1000; // 30 minutes
    await user.save();

    const resetUrlClient = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password/${resetToken}`;

    // Log the link in development console so developer can copy it
    console.log(`\n=== PASSWORD RESET LINK ===\n${resetUrlClient}\n===========================\n`);

    res.status(200).json({
      success: true,
      message: "If that email exists in our system, we've sent a password reset link.",
      token: process.env.NODE_ENV === "development" ? resetToken : undefined,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/reset-password/:token
 * @desc    Reset password using reset token
 * @access  Public
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Check if token matches and hasn't expired
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      const error = new Error("Invalid or expired password reset token");
      error.statusCode = 400;
      throw error;
    }

    // Assign new password, password pre-save hook will hash it automatically
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successful. You can now log in with your new password.",
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/auth/google
 * @desc    Authenticate with Google ID token
 * @access  Public
 */
export const googleLogin = async (req, res, next) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      const error = new Error("Google ID token is required");
      error.statusCode = 400;
      throw error;
    }

    if (mongoose.connection.readyState !== 1) {
      const error = new Error(
        "Database is not connected. Google sign-in cannot complete."
      );
      error.statusCode = 503;
      throw error;
    }

    // 1. Verify Google token using Google's public tokeninfo endpoint
    let ticket;
    if (idToken === "mock-google-token" && (process.env.NODE_ENV === "test" || env.NODE_ENV === "test" || process.env.NODE_ENV === "development" || env.NODE_ENV === "development")) {
      ticket = {
        email: "mockgoogleuser@example.com",
        name: "Mock Google User",
        sub: "mock-google-sub-12345",
        email_verified: true,
      };
    } else {
      try {
        const googleResponse = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${idToken}`);
        if (!googleResponse.ok) {
          throw new Error("Failed to verify Google ID token");
        }
        ticket = await googleResponse.json();
      } catch (fetchErr) {
        const error = new Error(`Google token validation failed: ${fetchErr.message}`);
        error.statusCode = 401;
        throw error;
      }
    }

    if (!ticket || ticket.error_description || !ticket.email) {
      const error = new Error(ticket?.error_description || "Invalid Google token payload");
      error.statusCode = 401;
      throw error;
    }

    const { email, name, sub: googleId, email_verified } = ticket;

    if (email_verified !== "true" && email_verified !== true) {
      const error = new Error("Google email is not verified");
      error.statusCode = 401;
      throw error;
    }

    // 2. Query user by email
    let user = await User.findOne({ email });

    if (!user) {
      // 3. User does not exist, auto-register them
      const randomPassword = crypto.randomBytes(16).toString("hex");
      user = await User.create({
        name: name || email.split("@")[0],
        email,
        password: randomPassword,
        googleId,
      });
    } else if (!user.googleId) {
      // User exists but has no googleId bound (created via email/password initially)
      user.googleId = googleId;
      await user.save();
    }

    // 4. Generate application JWT token
    generateToken(res, user._id);

    res.status(200).json({
      success: true,
      message: "Logged in with Google successfully",
      user,
    });
  } catch (error) {
    next(error);
  }
};
