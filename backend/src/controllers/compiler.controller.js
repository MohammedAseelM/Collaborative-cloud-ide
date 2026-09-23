// src/controllers/compiler.controller.js
// Responsibility: Handler to run standalone playground code in isolated runtimes.

import { executeCodeInSandbox } from "./run.controller.js";

/**
 * @route   POST /api/compiler/run
 * @desc    Run code inside compile sandbox without project binding
 * @access  Private (Registered users only)
 */
export const runStandaloneCode = async (req, res, next) => {
  try {
    const { code, input, language } = req.body;

    if (!code || code.trim() === "") {
      const error = new Error("Code content is required to run.");
      error.statusCode = 400;
      throw error;
    }

    if (!language) {
      const error = new Error("Programming language parameter is required.");
      error.statusCode = 400;
      throw error;
    }

    // Delegate compilation task directly to execution engine
    const { stdout, stderr, compileError } = await executeCodeInSandbox(language, code, input);

    res.status(200).json({
      success: true,
      stdout,
      stderr,
      compileError,
    });
  } catch (error) {
    if (error.message.includes("Time Limit Exceeded") || error.statusCode) {
      res.status(error.statusCode || 200).json({
        success: false,
        stdout: "",
        stderr: error.message,
        compileError: "",
      });
    } else {
      next(error);
    }
  }
};
