// tests/project.test.js
// Responsibility: Test project CRUD, favoriting, archiving, and deletion.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import http from "http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../src/app.js";
import { clearDatabase, getAuthCookie } from "./test_helper.js";
import User from "../src/models/user.model.js";
import Project from "../src/models/project.model.js";
import FileNode from "../src/models/file.model.js";

let server;
let mongoServer;
let baseUrl;
let testUser;
let authCookie;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  baseUrl = `http://localhost:${port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await clearDatabase();
  // Bootstrap user & cookie for project tests
  testUser = new User({
    name: "Project Tester",
    email: "project@example.com",
    password: "password123",
  });
  await testUser.save();
  authCookie = getAuthCookie(testUser._id);
});

test("Project Management System Tests", async (t) => {
  await t.test("should create a new project successfully", async () => {
    const res = await fetch(`${baseUrl}/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({
        name: "My Capstone IDE",
        description: "A collaborative browser IDE",
        language: "javascript",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.project.name, "My Capstone IDE");
    assert.strictEqual(data.project.language, "javascript");

    const defaultFile = await FileNode.findOne({ project: data.project._id });
    assert.strictEqual(defaultFile.name, "index.js");
    assert.strictEqual(defaultFile.content, "");
  });

  await t.test("should create a runnable Vite React starter project", async () => {
    const res = await fetch(`${baseUrl}/projects/react-starter`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({ name: "my-react-app" }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.project.name, "my-react-app");
    assert.strictEqual(data.project.projectType, "react-vite");

    const starterFiles = await FileNode.find({ project: data.project._id }).sort({ relativePath: 1 });
    assert.deepStrictEqual(
      starterFiles.filter((file) => !file.isFolder).map((file) => file.relativePath),
      ["index.html", "package.json", "src/App.jsx", "src/index.css", "src/main.jsx", "vite.config.js"]
    );
  });

  await t.test("should run an allowed project terminal command", async () => {
    const project = new Project({
      name: "Terminal Project",
      language: "javascript",
      owner: testUser._id,
      members: [testUser._id],
    });
    await project.save();

    const res = await fetch(`${baseUrl}/projects/${project._id}/terminal/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({ command: "node --version" }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.exitCode, 0);
    assert.match(data.output, /^v\d+/);
  });

  await t.test("should reject terminal shell chaining", async () => {
    const project = new Project({
      name: "Safe Terminal Project",
      language: "javascript",
      owner: testUser._id,
      members: [testUser._id],
    });
    await project.save();

    const res = await fetch(`${baseUrl}/projects/${project._id}/terminal/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({ command: "node --version && dir" }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.message, /chaining/i);
  });

  await t.test("should reject creating project with unsupported language", async () => {
    const res = await fetch(`${baseUrl}/projects`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({
        name: "Invalid IDE",
        description: "Unsupported language project",
        language: "rust",
      }),
    });

    // Mongoose/express-validator returns 400 validation error
    assert.strictEqual(res.status, 400);
  });

  await t.test("should list projects for the authenticated user", async () => {
    const proj = new Project({
      name: "List Project",
      language: "python",
      owner: testUser._id,
      members: [testUser._id],
    });
    await proj.save();

    const res = await fetch(`${baseUrl}/projects`, {
      method: "GET",
      headers: { Cookie: authCookie },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.count, 1);
    assert.strictEqual(data.projects[0].name, "List Project");
  });

  await t.test("should favorite and archive a project", async () => {
    const proj = new Project({
      name: "Fav Project",
      language: "javascript",
      owner: testUser._id,
      members: [testUser._id],
    });
    await proj.save();

    // Favorite
    const favRes = await fetch(`${baseUrl}/projects/${proj._id}/favorite`, {
      method: "PATCH",
      headers: { Cookie: authCookie },
    });
    assert.strictEqual(favRes.status, 200);
    const favData = await favRes.json();
    assert.ok(favData.project.favorites.includes(testUser._id.toString()));

    // Archive
    const archRes = await fetch(`${baseUrl}/projects/${proj._id}/archive`, {
      method: "PATCH",
      headers: { Cookie: authCookie },
    });
    assert.strictEqual(archRes.status, 200);
    const archData = await archRes.json();
    assert.strictEqual(archData.project.isArchived, true);
  });

  await t.test("should delete a project", async () => {
    const proj = new Project({
      name: "Delete Me",
      language: "javascript",
      owner: testUser._id,
      members: [testUser._id],
    });
    await proj.save();

    const res = await fetch(`${baseUrl}/projects/${proj._id}`, {
      method: "DELETE",
      headers: { Cookie: authCookie },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    const exists = await Project.findById(proj._id);
    assert.strictEqual(exists, null);
  });
});
