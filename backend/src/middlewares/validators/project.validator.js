// src/middlewares/validators/project.validator.js
// Responsibility: Validation rules for project create/update endpoints.
// Reuses the shared `handleValidationErrors` middleware from the auth
// validator module.

import { body, query } from "express-validator";

export const createProjectValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Project name is required")
    .isLength({ min: 2, max: 100 })
    .withMessage("Project name must be between 2 and 100 characters"),

  body("description")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must be at most 500 characters"),

  body("language")
    .optional()
    .isIn(["javascript", "python", "java", "cpp", "c", "typescript", "html", "css", "react", "text", "other"])
    .withMessage("Unsupported language"),
];

export const updateProjectValidationRules = [
  body("name")
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage("Project name must be between 2 and 100 characters"),

  body("description")
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 500 })
    .withMessage("Description must be at most 500 characters"),
];

export const searchProjectsValidationRules = [
  query("search")
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage("Search query is too long"),
];
