import express from "express";
import rateLimit from "express-rate-limit";
import { chatWithAssistant } from "../controllers/ai.controller.js";

const router = express.Router();

// The parent project router already applies authentication. Keep AI requests
// bounded separately because each request has a third-party cost.
const assistantLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: "Too many AI requests. Please wait a few minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/:id/ai/chat", assistantLimiter, chatWithAssistant);

export default router;
