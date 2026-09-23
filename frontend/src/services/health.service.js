// src/services/health.service.js
// Responsibility: Encapsulate API calls related to server health checks.
// Pages/components should call functions from here rather than using
// axios directly, keeping API logic reusable and testable.

import api from "./api";

export const fetchHealthStatus = async () => {
  const { data } = await api.get("/health");
  return data;
};
