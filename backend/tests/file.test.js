// tests/file.test.js
// Responsibility: Test workspace file/folder explorer operations, renaming, and validation rules.

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
let project;

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
  testUser = new User({ name: "File Tester", email: "file@example.com", password: "password123" });
  await testUser.save();
  authCookie = getAuthCookie(testUser._id);

  project = new Project({
    name: "File Test Project",
    language: "javascript",
    owner: testUser._id,
    members: [testUser._id],
  });
  await project.save();
});

test("Workspace Files & Folders System Tests", async (t) => {
  await t.test("should create a new file in the project", async () => {
    const res = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({
        name: "index.js",
        type: "file",
        isFolder: false,
        content: "console.log('hello');",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.file.name, "index.js");
    assert.strictEqual(data.file.relativePath, "index.js");
  });

  await t.test("should reject duplicate filename creations in the same folder", async () => {
    // Bootstrap first file
    const file1 = new FileNode({
      name: "duplicate.js",
      type: "file",
      isFolder: false,
      project: project._id,
      content: "",
    });
    await file1.save();

    const res = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({
        name: "duplicate.js",
        type: "file",
        isFolder: false,
        content: "",
      }),
    });

    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  await t.test("should rename a file successfully", async () => {
    const file = new FileNode({
      name: "old_name.js",
      type: "file",
      isFolder: false,
      project: project._id,
      content: "",
    });
    await file.save();

    const res = await fetch(`${baseUrl}/files/${file._id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({ name: "new_name.js" }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.file.name, "new_name.js");
  });

  await t.test("should delete a file", async () => {
    const file = new FileNode({
      name: "kill_me.js",
      type: "file",
      isFolder: false,
      project: project._id,
      content: "",
    });
    await file.save();

    const res = await fetch(`${baseUrl}/files/${file._id}`, {
      method: "DELETE",
      headers: { Cookie: authCookie },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    const exists = await FileNode.findById(file._id);
    assert.strictEqual(exists, null);
  });
});
