import api from "./api";

export const askAssistant = async (projectId, payload) => {
  const { data } = await api.post(`/projects/${projectId}/ai/chat`, payload);
  return data;
};
