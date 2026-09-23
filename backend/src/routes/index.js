// src/routes/index.js
// Responsibility: Aggregate all feature-specific routers into a single
// router that gets mounted on the Express app. Future routers (auth,
// projects, files, etc.) should be registered here.

import express from "express";
import healthRoutes from "./health.routes.js";
import authRoutes from "./auth.routes.js";
import projectRoutes from "./project.routes.js";
import fileRoutes from "./file.routes.js";
import invitationRoutes from "./invitation.routes.js";
import notificationRoutes from "./notification.routes.js";
import userRoutes from "./user.routes.js";
import adminRoutes from "./admin.routes.js";
import compilerRoutes from "./compiler.routes.js";
import reactProjectRoutes from "./reactProjectRoutes.js";
import taskRoutes from "./task.routes.js";

const router = express.Router();

router.use("/health", healthRoutes);
router.use("/auth", authRoutes);
router.use("/projects", taskRoutes);
router.use("/projects", reactProjectRoutes);
router.use("/projects", projectRoutes);
router.use("/files", fileRoutes);
router.use("/invitations", invitationRoutes);
router.use("/notifications", notificationRoutes);
router.use("/users", userRoutes);
router.use("/admin", adminRoutes);
router.use("/compiler", compilerRoutes);

export default router;
