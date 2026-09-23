// src/services/notification.service.js
// Responsibility: Encapsulate notification REST calls.

import api from "./api";

/**
 * Fetch notifications list for the logged-in user.
 * @returns {Promise<any>}
 */
export const fetchNotifications = async () => {
  const { data } = await api.get("/notifications");
  return data;
};

/**
 * Mark a single notification as read.
 * @param {string} notificationId
 * @returns {Promise<any>}
 */
export const markNotificationRead = async (notificationId) => {
  const { data } = await api.patch(`/notifications/${notificationId}/read`);
  return data;
};

/**
 * Mark all notifications as read.
 * @returns {Promise<any>}
 */
export const markAllNotificationsRead = async () => {
  const { data } = await api.patch("/notifications/read-all");
  return data;
};
