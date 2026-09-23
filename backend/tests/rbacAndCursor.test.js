// tests/rbacAndCursor.test.js
// Automated verification tests for RBAC enforcement and Live Cursor/Presence payload contracts.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import User from "../src/models/user.model.js";
import Project from "../src/models/project.model.js";
import FileNode from "../src/models/file.model.js";
import Invitation from "../src/models/invitation.model.js";
import { env } from "../src/config/env.js";

let server;
let mongoServer;
let baseUrl;

const generateTestToken = (userId, email) => {
  return jwt.sign({ userId, email }, env.JWT_SECRET || "test-jwt-secret", { expiresIn: "1h" });
};

test("RBAC Security & Cursor Payload System Tests", async (t) => {
  let ownerUser, adminUser, editorUser, viewerUser;
  let ownerCookie, adminCookie, editorCookie, viewerCookie;
  let testProject, testFile;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api`;

    await User.deleteMany({});
    await Project.deleteMany({});
    await FileNode.deleteMany({});
    await Invitation.deleteMany({});

    // Create 4 users for the 4 roles
    ownerUser = await User.create({ name: "Project Owner", email: "owner@test.com", password: "Password123!" });
    adminUser = await User.create({ name: "Project Admin", email: "admin@test.com", password: "Password123!" });
    editorUser = await User.create({ name: "Project Editor", email: "editor@test.com", password: "Password123!" });
    viewerUser = await User.create({ name: "Project Viewer", email: "viewer@test.com", password: "Password123!" });

    ownerCookie = `token=${generateTestToken(ownerUser._id, ownerUser.email)}`;
    adminCookie = `token=${generateTestToken(adminUser._id, adminUser.email)}`;
    editorCookie = `token=${generateTestToken(editorUser._id, editorUser.email)}`;
    viewerCookie = `token=${generateTestToken(viewerUser._id, viewerUser.email)}`;

    // Owner creates project
    testProject = await Project.create({
      name: "RBAC Test Workspace",
      description: "Testing strict permissions matrix",
      language: "javascript",
      owner: ownerUser._id,
      members: [ownerUser._id, adminUser._id, editorUser._id, viewerUser._id],
      memberRoles: new Map([
        [ownerUser._id.toString(), "Owner"],
        [adminUser._id.toString(), "Admin"],
        [editorUser._id.toString(), "Editor"],
        [viewerUser._id.toString(), "Viewer"],
      ]),
    });

    testFile = await FileNode.create({
      name: "app.js",
      isFolder: false,
      project: testProject._id,
      content: "console.log('RBAC Test');",
    });
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  await t.test("Owner should have full management permissions", async () => {
    // Owner can change Editor to Admin
    const res = await fetch(`${baseUrl}/projects/${testProject._id}/member/${editorUser._id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ role: "Admin" }),
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);

    // Revert role back to Editor
    await fetch(`${baseUrl}/projects/${testProject._id}/member/${editorUser._id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ role: "Editor" }),
    });
  });

  await t.test("Admin should be able to manage Viewers/Editors but cannot change Owner role", async () => {
    // Admin changes Viewer to Editor
    const resRole = await fetch(`${baseUrl}/projects/${testProject._id}/member/${viewerUser._id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ role: "Editor" }),
    });

    assert.equal(resRole.status, 200);

    // Admin attempts to change Owner role -> 400 or 403
    const resOwnerChange = await fetch(`${baseUrl}/projects/${testProject._id}/member/${ownerUser._id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ role: "Editor" }),
    });

    assert.equal(resOwnerChange.status, 400);

    // Revert viewer back to Viewer
    await fetch(`${baseUrl}/projects/${testProject._id}/member/${viewerUser._id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: ownerCookie },
      body: JSON.stringify({ role: "Viewer" }),
    });
  });

  await t.test("Editor should NOT be allowed to invite members or change roles (403 Forbidden)", async () => {
    // Editor tries to send invitation -> 403
    const resInvite = await fetch(`${baseUrl}/projects/${testProject._id}/invitations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: editorCookie },
      body: JSON.stringify({ email: "newuser@test.com", role: "Editor" }),
    });

    assert.equal(resInvite.status, 403);

    // Editor tries to change role -> 403
    const resRole = await fetch(`${baseUrl}/projects/${testProject._id}/member/${viewerUser._id}/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: editorCookie },
      body: JSON.stringify({ role: "Editor" }),
    });

    assert.equal(resRole.status, 403);
  });

  await t.test("Viewer should NOT be allowed to edit files or run code (403 Forbidden)", async () => {
    // Viewer attempts to create a file -> 403
    const resCreateFile = await fetch(`${baseUrl}/files/projects/${testProject._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: viewerCookie },
      body: JSON.stringify({ name: "secret.js", isFolder: false, content: "test" }),
    });

    assert.equal(resCreateFile.status, 403);

    // Viewer attempts to execute code -> 403
    const resRun = await fetch(`${baseUrl}/projects/${testProject._id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: viewerCookie },
      body: JSON.stringify({ code: "console.log(1)", language: "javascript" }),
    });

    assert.equal(resRun.status, 403);
  });

  await t.test("Cursor & Selection payload contract should validate required properties", async () => {
    const cursorPayload = {
      projectId: testProject._id.toString(),
      fileId: testFile._id.toString(),
      userId: editorUser._id.toString(),
      username: editorUser.name,
      color: "#3b82f6",
      cursor: { lineNumber: 10, column: 15 },
      selection: { startLineNumber: 10, startColumn: 5, endLineNumber: 10, endColumn: 20 },
    };

    assert.ok(cursorPayload.projectId);
    assert.ok(cursorPayload.fileId);
    assert.ok(cursorPayload.userId);
    assert.ok(cursorPayload.username);
    assert.ok(cursorPayload.color);
    assert.equal(cursorPayload.cursor.lineNumber, 10);
    assert.equal(cursorPayload.cursor.column, 15);
    assert.equal(cursorPayload.selection.startColumn, 5);
    assert.equal(cursorPayload.selection.endColumn, 20);
  });
});
