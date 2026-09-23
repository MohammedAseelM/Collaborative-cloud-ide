// tests/fullAppRunner.test.js
// Automated test suite for full-app project execution, framework detection, port allocation, and runner endpoints.

import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";

import User from "../src/models/user.model.js";
import Project from "../src/models/project.model.js";
import FileNode from "../src/models/file.model.js";
import projectRoutes from "../src/routes/project.routes.js";
import errorHandler from "../src/middlewares/errorHandler.js";
import { detectAndSaveProjectType } from "../src/services/projectDetector.service.js";
import { findAvailablePort } from "../src/services/projectRunner.service.js";

let mongoServer;
let app;
let testUser;
let authCookie;

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  await mongoose.connect(mongoUri);

  app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api/projects", projectRoutes);
  app.use(errorHandler);

  testUser = await User.create({
    name: "Runner Tester",
    email: `runner_test_${Date.now()}@example.com`,
    password: "Password123!",
  });

  const secret = process.env.JWT_SECRET || "change_this_to_a_long_random_secret";
  const token = jwt.sign({ id: testUser._id }, secret, { expiresIn: "1h" });
  authCookie = `token=${token}`;
});

test.after(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

test("Full-App Project Detector Tests", async (t) => {
  await t.test("should detect React Vite project from package.json and vite.config.js", async () => {
    const project = await Project.create({
      name: "React Vite Test",
      owner: testUser._id,
      members: [testUser._id],
    });

    await FileNode.create({
      name: "package.json",
      isFolder: false,
      project: project._id,
      content: JSON.stringify({
        scripts: { dev: "vite" },
        dependencies: { react: "^18.2.0" },
        devDependencies: { vite: "^4.3.0" },
      }),
    });

    await FileNode.create({
      name: "vite.config.js",
      isFolder: false,
      project: project._id,
      content: "export default {}",
    });

    const info = await detectAndSaveProjectType(project._id);

    assert.equal(info.projectType, "react-vite");
    assert.equal(info.startCommand, "npm run dev");
    assert.equal(info.defaultPort, 5173);

    const updatedProj = await Project.findById(project._id);
    assert.equal(updatedProj.projectType, "react-vite");
  });

  await t.test("should detect Python Flask project from requirements.txt", async () => {
    const project = await Project.create({
      name: "Flask Test",
      owner: testUser._id,
      members: [testUser._id],
    });

    await FileNode.create({
      name: "requirements.txt",
      isFolder: false,
      project: project._id,
      content: "flask==2.3.0\ngunicorn",
    });

    const info = await detectAndSaveProjectType(project._id);

    assert.equal(info.projectType, "python-flask");
    assert.equal(info.defaultPort, 5000);
  });
});

test("Port Allocator Service Tests", async (t) => {
  await t.test("should allocate an open TCP port", async () => {
    const port = await findAvailablePort(5173);
    assert.ok(typeof port === "number");
    assert.ok(port >= 5173);
  });
});
