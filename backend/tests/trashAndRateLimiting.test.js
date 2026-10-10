// tests/trashAndRateLimiting.test.js
// Automated verification for:
// 1. Soft-delete and recursive ancestor folder restoration
// 2. Unrelated deleted items preservation
// 3. Filename collisions on restoration
// 4. Permanent deletion and empty trash authorizations
// 5. Activity log durable auditing
// 6. Socket.IO high-frequency event rate limiting and recovery

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Server } from "socket.io";
import { io as ioClient } from "socket.io-client";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import User from "../src/models/user.model.js";
import Project from "../src/models/project.model.js";
import FileNode from "../src/models/file.model.js";
import Activity from "../src/models/activity.model.js";
import { registerSocketHandlers } from "../src/sockets/projectSocket.js";
import { env } from "../src/config/env.js";

let server;
let ioServer;
let mongoServer;
let baseUrl;
let socketServerUrl;

const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, env.JWT_SECRET || "test-jwt-secret", { expiresIn: "1h" });
};

test("Trash Recovery, Permanent Deletion, and Socket Rate Limiting Suite", async (t) => {
  let ownerUser, editorUser, viewerUser;
  let ownerToken, editorToken, viewerToken;
  let project;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    server = http.createServer(app);
    ioServer = new Server(server, { cors: { origin: "*", credentials: true } });
    app.set("io", ioServer);
    registerSocketHandlers(ioServer);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api`;
    socketServerUrl = `http://localhost:${port}`;

    // Create test users
    ownerUser = await User.create({
      name: "Owner User",
      email: "owner@example.com",
      password: "password123",
      isVerified: true,
    });
    ownerToken = generateToken(ownerUser._id.toString(), ownerUser.email);

    editorUser = await User.create({
      name: "Editor User",
      email: "editor@example.com",
      password: "password123",
      isVerified: true,
    });
    editorToken = generateToken(editorUser._id.toString(), editorUser.email);

    viewerUser = await User.create({
      name: "Viewer User",
      email: "viewer@example.com",
      password: "password123",
      isVerified: true,
    });
    viewerToken = generateToken(viewerUser._id.toString(), viewerUser.email);

    // Create shared project with member roles
    project = await Project.create({
      name: "Trash & Limiter Test Project",
      owner: ownerUser._id,
      members: [ownerUser._id, editorUser._id, viewerUser._id],
      memberRoles: new Map([
        [ownerUser._id.toString(), "Owner"],
        [editorUser._id.toString(), "Editor"],
        [viewerUser._id.toString(), "Viewer"],
      ]),
    });
  });

  after(async () => {
    if (ioServer) ioServer.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  await t.test("1. Nested folder deletion and recursive ancestor restoration with sibling preservation", async () => {
    // Structure:
    // folderA (a)
    //   folderB (a/b)
    //     fileC (a/b/c.js)
    //     fileD (a/b/d.js)
    const resA = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${ownerToken}` },
      body: JSON.stringify({ name: "folderA", isFolder: true, parentId: null }),
    });
    const dataA = await resA.json();
    assert.strictEqual(dataA.success, true);
    const folderAId = dataA.file._id;

    const resB = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${ownerToken}` },
      body: JSON.stringify({ name: "folderB", isFolder: true, parentId: folderAId }),
    });
    const dataB = await resB.json();
    assert.strictEqual(dataB.success, true);
    const folderBId = dataB.file._id;

    const resC = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${ownerToken}` },
      body: JSON.stringify({ name: "c.js", isFolder: false, parentId: folderBId, content: "console.log('c');" }),
    });
    const dataC = await resC.json();
    assert.strictEqual(dataC.success, true);
    const fileCId = dataC.file._id;

    const resD = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${ownerToken}` },
      body: JSON.stringify({ name: "d.js", isFolder: false, parentId: folderBId, content: "console.log('d');" }),
    });
    const dataD = await resD.json();
    assert.strictEqual(dataD.success, true);
    const fileDId = dataD.file._id;

    // Delete folderA (soft delete should recursively mark folderA, folderB, fileC, fileD as deleted)
    const delRes = await fetch(`${baseUrl}/files/${folderAId}`, {
      method: "DELETE",
      headers: { Cookie: `token=${ownerToken}` },
    });
    const delData = await delRes.json();
    assert.strictEqual(delData.success, true);

    // Verify all 4 nodes are soft-deleted in DB
    const checkA = await FileNode.findById(folderAId);
    const checkB = await FileNode.findById(folderBId);
    const checkC = await FileNode.findById(fileCId);
    const checkD = await FileNode.findById(fileDId);
    assert.strictEqual(checkA.isDeleted, true);
    assert.strictEqual(checkB.isDeleted, true);
    assert.strictEqual(checkC.isDeleted, true);
    assert.strictEqual(checkD.isDeleted, true);

    // Check Trash endpoint listing
    const trashRes = await fetch(`${baseUrl}/files/projects/${project._id}/trash`, {
      headers: { Cookie: `token=${editorToken}` },
    });
    const trashData = await trashRes.json();
    assert.strictEqual(trashData.success, true);
    assert.ok(trashData.files.length >= 4);

    // Now restore ONLY fileC (c.js)
    const restoreRes = await fetch(`${baseUrl}/files/${fileCId}/restore`, {
      method: "POST",
      headers: { Cookie: `token=${editorToken}` },
    });
    const restoreData = await restoreRes.json();
    assert.strictEqual(restoreData.success, true);
    assert.strictEqual(restoreData.restoredAncestors.length, 2, "Both ancestor folders A and B must be restored");

    // Verify folderA, folderB, and fileC are active (isDeleted: false)
    const postA = await FileNode.findById(folderAId);
    const postB = await FileNode.findById(folderBId);
    const postC = await FileNode.findById(fileCId);
    assert.strictEqual(postA.isDeleted, false, "folderA should be restored");
    assert.strictEqual(postB.isDeleted, false, "folderB should be restored");
    assert.strictEqual(postC.isDeleted, false, "fileC should be restored");

    // Verify unrelated fileD REMAINS deleted!
    const postD = await FileNode.findById(fileDId);
    assert.strictEqual(postD.isDeleted, true, "fileD must remain deleted");

    // Verify physical workspace recreation on disk
    const workspaceDir = path.resolve(env.WORKSPACE_ROOT, project.owner.toString(), project._id.toString());
    const diskPathC = path.join(workspaceDir, "folderA", "folderB", "c.js");
    assert.ok(fs.existsSync(diskPathC), "Restored c.js must exist on disk");
  });

  await t.test("2. Filename collision handling on restoration", async () => {
    // 1. Create a root file "sample.js"
    const res1 = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${ownerToken}` },
      body: JSON.stringify({ name: "sample.js", isFolder: false, content: "console.log(1);" }),
    });
    const data1 = await res1.json();
    const file1Id = data1.file._id;

    // 2. Soft-delete "sample.js"
    await fetch(`${baseUrl}/files/${file1Id}`, {
      method: "DELETE",
      headers: { Cookie: `token=${ownerToken}` },
    });

    // 3. Create another active "sample.js" at root
    const res2 = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${ownerToken}` },
      body: JSON.stringify({ name: "sample.js", isFolder: false, content: "console.log(2);" }),
    });
    const data2 = await res2.json();
    assert.strictEqual(data2.success, true);

    // 4. Restore the soft-deleted file1. It must be safely renamed to avoid collision!
    const restoreRes = await fetch(`${baseUrl}/files/${file1Id}/restore`, {
      method: "POST",
      headers: { Cookie: `token=${ownerToken}` },
    });
    const restoreData = await restoreRes.json();
    assert.strictEqual(restoreData.success, true);
    assert.strictEqual(restoreData.file.name, "sample (restored).js");

    const reloadedFile1 = await FileNode.findById(file1Id);
    assert.strictEqual(reloadedFile1.name, "sample (restored).js");
    assert.strictEqual(reloadedFile1.isDeleted, false);
  });

  await t.test("3. Permanent deletion authorization, validation, and audit logging", async () => {
    // 1. Create a file "temp.txt"
    const createRes = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${ownerToken}` },
      body: JSON.stringify({ name: "temp.txt", isFolder: false, content: "temp" }),
    });
    const createData = await createRes.json();
    const tempFileId = createData.file._id;

    // 2. Cannot permanently delete an active file (must be soft-deleted first)
    const activeDelRes = await fetch(`${baseUrl}/files/${tempFileId}/permanent`, {
      method: "DELETE",
      headers: { Cookie: `token=${ownerToken}` },
    });
    assert.strictEqual(activeDelRes.status, 400);

    // 3. Soft-delete "temp.txt"
    await fetch(`${baseUrl}/files/${tempFileId}`, {
      method: "DELETE",
      headers: { Cookie: `token=${ownerToken}` },
    });

    // 4. Viewer / non-admin cannot permanently delete
    const viewerDelRes = await fetch(`${baseUrl}/files/${tempFileId}/permanent`, {
      method: "DELETE",
      headers: { Cookie: `token=${viewerToken}` },
    });
    assert.strictEqual(viewerDelRes.status, 403);

    // 5. Owner/Admin permanently deletes the file
    const permRes = await fetch(`${baseUrl}/files/${tempFileId}/permanent`, {
      method: "DELETE",
      headers: { Cookie: `token=${ownerToken}` },
    });
    const permData = await permRes.json();
    assert.strictEqual(permRes.status, 200);
    assert.strictEqual(permData.success, true);

    // Record must be completely removed from MongoDB
    const postCheck = await FileNode.findById(tempFileId);
    assert.strictEqual(postCheck, null);

    // Check durable audit log entry
    const log = await Activity.findOne({
      project: project._id,
      "details.action": "permanent_delete",
      "details.name": "temp.txt",
    });
    assert.ok(log, "Permanent deletion must produce durable Activity log");
  });

  await t.test("4. Empty trash authorization and operation", async () => {
    // 1. Create two files and soft delete both
    const f1 = await FileNode.create({
      project: project._id,
      name: "trash1.js",
      isFolder: false,
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: ownerUser._id,
    });
    const f2 = await FileNode.create({
      project: project._id,
      name: "trash2.js",
      isFolder: false,
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: ownerUser._id,
    });

    // 2. Viewer cannot empty trash
    const viewerEmptyRes = await fetch(`${baseUrl}/files/projects/${project._id}/trash`, {
      method: "DELETE",
      headers: { Cookie: `token=${viewerToken}` },
    });
    assert.strictEqual(viewerEmptyRes.status, 403);

    // 3. Owner empties trash
    const ownerEmptyRes = await fetch(`${baseUrl}/files/projects/${project._id}/trash`, {
      method: "DELETE",
      headers: { Cookie: `token=${ownerToken}` },
    });
    const ownerEmptyData = await ownerEmptyRes.json();
    assert.strictEqual(ownerEmptyRes.status, 200);
    assert.strictEqual(ownerEmptyData.success, true);
    assert.ok(ownerEmptyData.count >= 2);

    // Verify soft-deleted items are gone from DB
    const checkF1 = await FileNode.findById(f1._id);
    const checkF2 = await FileNode.findById(f2._id);
    assert.strictEqual(checkF1, null);
    assert.strictEqual(checkF2, null);

    // Verify activity log
    const emptyLog = await Activity.findOne({
      project: project._id,
      "details.action": "empty_trash",
    });
    assert.ok(emptyLog, "Empty trash must produce durable Activity log");
  });

  await t.test("5. Socket.IO rate limiting on code edits and cursor movements", async () => {
    const editFile = await FileNode.create({
      project: project._id,
      name: "rateLimitTest.js",
      isFolder: false,
      content: "// initial content",
    });

    // Connect socket client for editor
    const socketClient = ioClient(socketServerUrl, {
      extraHeaders: { cookie: `token=${editorToken}` },
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise((resolve) => socketClient.once("connect", resolve));
    socketClient.emit("join-project", { projectId: project._id.toString() });
    socketClient.emit("join-file", { fileId: editFile._id.toString() });
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Normal typing (10 edits with slight pacing) should succeed without error
    let rateLimitExceeded = false;
    socketClient.on("rate-limit-exceeded", () => {
      rateLimitExceeded = true;
    });

    for (let i = 0; i < 5; i++) {
      socketClient.emit("code-change", {
        fileId: editFile._id.toString(),
        rangeOffset: 0,
        rangeLength: 0,
        text: `// line ${i}\n`,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.strictEqual(rateLimitExceeded, false, "Normal typing should not trigger rate limit");

    // Sudden burst (100 rapid code edits in tight loop exceeding edit burst limit of 60)
    const rateLimitPromise = new Promise((resolve) => {
      socketClient.once("rate-limit-exceeded", (payload) => {
        resolve(payload);
      });
    });

    for (let i = 0; i < 100; i++) {
      socketClient.emit("code-change", {
        fileId: editFile._id.toString(),
        rangeOffset: 0,
        rangeLength: 0,
        text: `a`,
      });
    }

    const editLimitPayload = await Promise.race([
      rateLimitPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for edit rate-limit-exceeded")), 2000)),
    ]);
    assert.strictEqual(editLimitPayload.category, "edit");
    assert.ok(editLimitPayload.retryAfter >= 0);

    // Test cursor movement burst (exceeding 100 cursor burst limit)
    const cursorLimitPromise = new Promise((resolve) => {
      socketClient.on("rate-limit-exceeded", (payload) => {
        if (payload.category === "cursor") resolve(payload);
      });
    });

    for (let i = 0; i < 150; i++) {
      socketClient.emit("cursor-move", {
        fileId: editFile._id.toString(),
        cursorLine: i + 1,
        cursorColumn: 1,
      });
    }

    const cursorLimitPayload = await Promise.race([
      cursorLimitPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for cursor rate-limit-exceeded")), 2000)),
    ]);
    assert.strictEqual(cursorLimitPayload.category, "cursor");

    // Test Viewer cannot edit via socket
    const viewerSocket = ioClient(socketServerUrl, {
      extraHeaders: { cookie: `token=${viewerToken}` },
      transports: ["websocket"],
      forceNew: true,
    });
    await new Promise((resolve) => viewerSocket.once("connect", resolve));
    viewerSocket.emit("join-project", { projectId: project._id.toString() });
    viewerSocket.emit("join-file", { fileId: editFile._id.toString() });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const viewerErrorPromise = new Promise((resolve) => {
      viewerSocket.once("error", (err) => resolve(err));
    });

    viewerSocket.emit("code-change", {
      fileId: editFile._id.toString(),
      rangeOffset: 0,
      rangeLength: 0,
      text: "viewer edit",
    });

    const viewerError = await Promise.race([
      viewerErrorPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout waiting for viewer error")), 2000)),
    ]);
    assert.ok(viewerError.message.includes("read-only"));

    socketClient.disconnect();
    viewerSocket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
});
