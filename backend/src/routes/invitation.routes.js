// src/routes/invitation.routes.js
// Responsibility: Register endpoints for managing and accepting invitations.

import express from "express";
import {
  getUserInvitations,
  acceptInvitation,
  cancelInvitation,
  resendInvitation,
  acceptInvitationById,
  rejectInvitationById,
} from "../controllers/invitation.controller.js";
import { protect } from "../middlewares/auth.middleware.js";

const router = express.Router();

// Require authentication for all invitation endpoints
router.use(protect);

// @route  GET /api/invitations/me
// @desc   List pending invitations for the logged-in user
router.get("/me", getUserInvitations);

// @route  POST /api/invitations/:id/resend
// @desc   Resend a project invitation
router.post("/:id/resend", resendInvitation);

// @route  POST /api/invitations/:id/accept
// @desc   Accept a project invitation (handles both 24-char ObjectId and token fallbacks)
router.post("/:id/accept", (req, res, next) => {
  if (req.params.id && req.params.id.length === 24) {
    return acceptInvitationById(req, res, next);
  } else {
    req.params.token = req.params.id;
    return acceptInvitation(req, res, next);
  }
});

// @route  POST /api/invitations/:id/reject
// @desc   Reject a project invitation by ID (Mongoose ObjectId)
router.post("/:id/reject", rejectInvitationById);

// @route  DELETE /api/invitations/:id
// @desc   Cancel a project invitation
router.delete("/:id", cancelInvitation);

export default router;
