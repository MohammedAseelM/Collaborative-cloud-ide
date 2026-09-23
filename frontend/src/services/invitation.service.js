// src/services/invitation.service.js
// Responsibility: Encapsulate all API operations related to project collaboration invitations.

import api from "./api";

/**
 * Send an invitation to collaborate on a project.
 * @param {string} projectId
 * @param {{ email: string, role: string }} payload
 * @returns {Promise<any>}
 */
export const createInvitationRequest = async (projectId, payload) => {
  const { data } = await api.post(`/projects/${projectId}/invitations`, payload);
  return data;
};

/**
 * Fetch pending invitations for a specific project.
 * @param {string} projectId
 * @returns {Promise<any>}
 */
export const fetchProjectInvitations = async (projectId) => {
  const { data } = await api.get(`/projects/${projectId}/invitations`);
  return data;
};

/**
 * Cancel a pending invitation by ID.
 * @param {string} invitationId
 * @returns {Promise<any>}
 */
export const cancelInvitationRequest = async (invitationId) => {
  const { data } = await api.delete(`/invitations/${invitationId}`);
  return data;
};

/**
 * Fetch pending invitations sent to the logged-in user.
 * @returns {Promise<any>}
 */
export const fetchUserInvitations = async () => {
  const { data } = await api.get("/invitations/me");
  return data;
};

/**
 * Accept a project invitation via token.
 * @param {string} token
 * @returns {Promise<any>}
 */
export const acceptInvitationRequest = async (token) => {
  const { data } = await api.post(`/invitations/${token}/accept`);
  return data;
};

/**
 * Reject a project invitation by ID.
 * @param {string} inviteId
 * @returns {Promise<any>}
 */
export const rejectInvitationRequest = async (inviteId) => {
  const { data } = await api.post(`/invitations/${inviteId}/reject`);
  return data;
};

/**
 * Accept a project invitation by ID.
 * @param {string} inviteId
 * @returns {Promise<any>}
 */
export const acceptInvitationByIdRequest = async (inviteId) => {
  const { data } = await api.post(`/invitations/${inviteId}/accept`);
  return data;
};

/**
 * Resend a pending invitation by ID.
 * @param {string} invitationId
 * @returns {Promise<any>}
 */
export const resendInvitationRequest = async (invitationId) => {
  const { data } = await api.post(`/invitations/${invitationId}/resend`);
  return data;
};
