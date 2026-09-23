// tests/reactProject.test.js
// Responsibility: Unit & integration tests for the React Project Command System.

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
let testOwner;
let testViewer;
let ownerCookie;
let viewerCookie;

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
  testOwner = new User({ name: "React Dev", email: "react@example.com", password: "password123" });
  await testOwner.save();
  ownerCookie = getAuthCookie(testOwner._id);

  testViewer = new User({ name: "Viewer User", email: "viewer@example.com", password: "password123" });
  await testViewer.save();
  viewerCookie = getAuthCookie(testViewer._id);
});

test("React Project Command System Tests", async (t) => {
  await t.test("POST /api/projects/react/create should scaffold a complete Vite + React project", async () => {
    const res = await fetch(`${baseUrl}/projects/react/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ name: "my-react-app" }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.project.name, "my-react-app");
    assert.strictEqual(data.project.projectType, "react-vite");
    assert.strictEqual(data.project.startCommand, "npm run dev");
    assert.strictEqual(data.project.installCommand, "npm install");
    assert.strictEqual(data.project.serverStatus, "ready");

    // Verify FileNodes in database
    const files = await FileNode.find({ project: data.project._id });
    const fileNames = files.map((f) => f.name);
    assert.ok(fileNames.includes("package.json"));
    assert.ok(fileNames.includes("vite.config.js"));
    assert.ok(fileNames.includes("index.html"));
    assert.ok(fileNames.includes("App.jsx"));
    assert.ok(fileNames.includes("main.jsx"));
    assert.ok(fileNames.includes("index.css"));
    assert.ok(fileNames.includes("src"));
    assert.ok(fileNames.includes("public"));
  });

  await t.test("should reject duplicate project name for the same owner", async () => {
    await fetch(`${baseUrl}/projects/react/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ name: "duplicate-app" }),
    });

    const res = await fetch(`${baseUrl}/projects/react/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ name: "duplicate-app" }),
    });

    assert.strictEqual(res.status, 409);
  });

  await t.test("should reject invalid project name", async () => {
    const res = await fetch(`${baseUrl}/projects/react/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ name: "Invalid Project Name!" }),
    });

    assert.strictEqual(res.status, 400);
  });

  await t.test("POST /api/projects/:projectId/reset should restore project to original template", async () => {
    const createRes = await fetch(`${baseUrl}/projects/react/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ name: "reset-test-app" }),
    });
    const { project } = await createRes.json();

    // Create an extra custom file
    await FileNode.create({
      project: project._id,
      name: "temp-custom.txt",
      isFolder: false,
      content: "custom test data",
      relativePath: "temp-custom.txt",
    });

    // Reset project
    const resetRes = await fetch(`${baseUrl}/projects/${project._id}/reset`, {
      method: "POST",
      headers: {
        Cookie: ownerCookie,
      },
    });

    assert.strictEqual(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.strictEqual(resetData.success, true);

    const filesAfterReset = await FileNode.find({ project: project._id });
    const names = filesAfterReset.map((f) => f.name);
    assert.ok(!names.includes("temp-custom.txt"), "Temporary file should be removed on reset");
    assert.ok(names.includes("App.jsx"));
    assert.ok(names.includes("package.json"));
  });

  await t.test("Viewer role should be forbidden from resetting or managing packages", async () => {
    const createRes = await fetch(`${baseUrl}/projects/react/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ name: "rbac-test-app" }),
    });
    const { project } = await createRes.json();

    // Add viewer as member with Viewer role
    await Project.findByIdAndUpdate(project._id, {
      $push: { members: testViewer._id },
      $set: { [`memberRoles.${testViewer._id.toString()}`]: "Viewer" },
    });

    const resetRes = await fetch(`${baseUrl}/projects/${project._id}/reset`, {
      method: "POST",
      headers: {
        Cookie: viewerCookie,
      },
    });
    assert.strictEqual(resetRes.status, 403);

    const pkgRes = await fetch(`${baseUrl}/projects/${project._id}/packages/install`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: viewerCookie,
      },
      body: JSON.stringify({ packageName: "axios" }),
    });
    assert.strictEqual(pkgRes.status, 403);
  });

  await t.test("GET /api/projects/:projectId/scripts should return available npm scripts", async () => {
    const createRes = await fetch(`${baseUrl}/projects/react/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ name: "scripts-test-app" }),
    });
    const { project } = await createRes.json();

    const res = await fetch(`${baseUrl}/projects/${project._id}/scripts`, {
      method: "GET",
      headers: { Cookie: ownerCookie },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    const scriptNames = data.scripts.map((s) => s.name);
    assert.ok(scriptNames.includes("dev"));
    assert.ok(scriptNames.includes("build"));
    assert.ok(scriptNames.includes("preview"));
  });

  await t.test("GET /api/projects/:projectId/node-version and npm-version should return versions", async () => {
    const createRes = await fetch(`${baseUrl}/projects/react/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ name: "version-test-app" }),
    });
    const { project } = await createRes.json();

    const nodeRes = await fetch(`${baseUrl}/projects/${project._id}/node-version`, {
      headers: { Cookie: ownerCookie },
    });
    assert.strictEqual(nodeRes.status, 200);
    const nodeData = await nodeRes.json();
    assert.strictEqual(nodeData.success, true);
    assert.match(nodeData.version, /^v\d+/);

    const npmRes = await fetch(`${baseUrl}/projects/${project._id}/npm-version`, {
      headers: { Cookie: ownerCookie },
    });
    assert.strictEqual(npmRes.status, 200);
    const npmData = await npmRes.json();
    assert.strictEqual(npmData.success, true);
    assert.match(npmData.version, /^\d+/);
  });
});

