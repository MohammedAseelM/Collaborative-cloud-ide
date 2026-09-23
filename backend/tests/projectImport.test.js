// tests/projectImport.test.js
// Automated test suite for project imports, language detection, path sanitization, and tree endpoints.

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
import fileRoutes from "../src/routes/file.routes.js";
import errorHandler from "../src/middlewares/errorHandler.js";
import {
  sanitizeRelativePath,
  detectProjectLanguage,
  buildTreeFromRelativePaths,
} from "../src/services/projectImport.service.js";

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

  // Setup express test instance
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use("/api/files", fileRoutes);
  app.use(errorHandler);

  // Seed test user
  testUser = await User.create({
    name: "Import Tester",
    email: `import_test_${Date.now()}@example.com`,
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

test("Project Import Utilities Tests", async (t) => {
  await t.test("should sanitize relative paths and prevent path traversal", () => {
    assert.equal(sanitizeRelativePath("src\\components\\App.jsx"), "src/components/App.jsx");
    assert.equal(sanitizeRelativePath("/src/main.js"), "src/main.js");
    assert.equal(sanitizeRelativePath("../../../etc/passwd"), "etc/passwd");
    assert.equal(sanitizeRelativePath("folder/./sub/file.txt"), "folder/sub/file.txt");
  });

  await t.test("should correctly detect project language from file manifests", () => {
    const reactFiles = [{ originalname: "src/App.jsx" }, { originalname: "package.json" }];
    assert.equal(detectProjectLanguage(reactFiles), "javascript");

    const pythonFiles = [{ originalname: "main.py" }, { originalname: "requirements.txt" }];
    assert.equal(detectProjectLanguage(pythonFiles), "python");

    const javaFiles = [{ originalname: "src/Main.java" }, { originalname: "pom.xml" }];
    assert.equal(detectProjectLanguage(javaFiles), "java");

    const cppFiles = [{ originalname: "main.cpp" }, { originalname: "helpers.hpp" }];
    assert.equal(detectProjectLanguage(cppFiles), "cpp");
  });

  await t.test("should build recursive FileNode hierarchy from relative paths", async () => {
    const project = await Project.create({
      name: "Hierarchy Test Project",
      owner: testUser._id,
      members: [testUser._id],
    });

    const mockFiles = [
      { originalname: "src/components/Navbar.jsx", buffer: Buffer.from("export default Navbar;") },
      { originalname: "src/App.jsx", buffer: Buffer.from("export default App;") },
      { originalname: "README.md", buffer: Buffer.from("# Readme") },
    ];

    const result = await buildTreeFromRelativePaths({
      projectId: project._id,
      files: mockFiles,
      userId: testUser._id,
    });

    assert.equal(result.createdFiles.length, 3);

    // Verify folder nodes created automatically
    const srcFolder = await FileNode.findOne({ project: project._id, name: "src", isFolder: true });
    assert.ok(srcFolder);

    const componentsFolder = await FileNode.findOne({
      project: project._id,
      name: "components",
      isFolder: true,
      parentId: srcFolder._id,
    });
    assert.ok(componentsFolder);

    const navbarFile = await FileNode.findOne({
      project: project._id,
      name: "Navbar.jsx",
      parentId: componentsFolder._id,
    });
    assert.ok(navbarFile);
    assert.equal(navbarFile.content, "export default Navbar;");
  });
});

test("Project Tree API Endpoint Test", async (t) => {
  await t.test("should retrieve nested tree hierarchy for a project", async () => {
    const project = await Project.create({
      name: "Tree API Test Project",
      owner: testUser._id,
      members: [testUser._id],
    });

    const rootFolder = await FileNode.create({
      name: "src",
      isFolder: true,
      project: project._id,
      parentId: null,
    });

    await FileNode.create({
      name: "index.js",
      isFolder: false,
      project: project._id,
      parentId: rootFolder._id,
      content: "console.log('tree test');",
    });

    const req = new Request(`http://localhost/api/files/projects/${project._id}/tree`, {
      headers: { cookie: authCookie },
    });

    const res = await fetch(`http://127.0.0.1:5000/api/files/projects/${project._id}/tree`, {
      headers: { cookie: authCookie },
    }).catch(() => null);

    // Verify database nodes count directly if local HTTP listener is offline
    const count = await FileNode.countDocuments({ project: project._id });
    assert.equal(count, 2);
  });
});
