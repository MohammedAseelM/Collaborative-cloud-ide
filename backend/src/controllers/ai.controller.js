// Workspace AI assistant. The browser only talks to this authenticated route;
// the OpenAI key is deliberately kept on the server.

import { env } from "../config/env.js";
import { findMemberProjectOrThrow } from "./project.controller.js";
import logger from "../utils/logger.js";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const MAX_MESSAGES = 12;
const MAX_MESSAGE_LENGTH = 6000;
const MAX_CODE_LENGTH = 16000;

const textFromResponse = (response) => {
  if (response.output_text) return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("\n");
};

export const chatWithAssistant = async (req, res, next) => {
  try {
    await findMemberProjectOrThrow(req.params.id, req.user._id);

    if (!env.OPENAI_API_KEY) {
      const error = new Error("AI assistant is not configured. Add OPENAI_API_KEY to the backend environment.");
      error.statusCode = 503;
      throw error;
    }

    const rawMessages = Array.isArray(req.body.messages) ? req.body.messages : [];
    const messages = rawMessages
      .slice(-MAX_MESSAGES)
      .filter((message) => ["user", "assistant"].includes(message?.role) && typeof message.content === "string")
      .map((message) => ({ role: message.role, content: message.content.trim().slice(0, MAX_MESSAGE_LENGTH) }))
      .filter((message) => message.content);

    if (!messages.length) {
      const error = new Error("A message is required.");
      error.statusCode = 400;
      throw error;
    }

    const context = req.body.context || {};
    const filename = typeof context.filename === "string" ? context.filename.slice(0, 255) : "untitled file";
    const language = typeof context.language === "string" ? context.language.slice(0, 80) : "plaintext";
    const code = typeof context.code === "string" ? context.code.slice(0, MAX_CODE_LENGTH) : "";
    const sourceContext = code
      ? `\n\nActive file: ${filename}\nLanguage: ${language}\n\`\`\`${language}\n${code}\n\`\`\``
      : "\n\nThere is no active file open.";

    const input = messages.map((message, index) => ({
      role: message.role,
      content: index === messages.length - 1 && message.role === "user"
        ? `${message.content}${sourceContext}`
        : message.content,
    }));

    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL,
        store: false,
        instructions: "You are a concise, careful coding assistant embedded in a collaborative IDE. Help with the active file when available. Explain decisions, flag security risks, and return complete replacement snippets only when the user asks for code. Do not claim to have run code or changed files.",
        input,
      }),
      signal: AbortSignal.timeout(60000),
    });

    const data = await response.json();
    if (!response.ok) {
      logger.warn("AI assistant request failed: %s", data?.error?.message || response.statusText);
      const error = new Error("The AI assistant could not complete that request. Please try again.");
      error.statusCode = response.status === 429 ? 429 : 502;
      throw error;
    }

    const answer = textFromResponse(data);
    if (!answer) {
      const error = new Error("The AI assistant returned an empty response. Please try again.");
      error.statusCode = 502;
      throw error;
    }

    res.status(200).json({ success: true, answer });
  } catch (error) {
    next(error);
  }
};
