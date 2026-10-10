// tests/fiveUserRealtimeCollaboration.test.js
// Production-grade 5-User Real-Time Collaboration & Security Test Suite:
// Tests Owner, Admin, Editor 1, Editor 2, and Viewer simultaneously.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
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
import Version from "../src/models/version.model.js";
import Notification from "../src/models/notification.model.js";
import { registerSocketHandlers } from "../src/sockets/projectSocket.js";
import { env } from "../src/config/env.js";

let server;
let ioServer;
let mongoServer;
let socketServerUrl;
let baseUrl;

const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, env.JWT_SECRET || "test-jwt-secret", { expiresIn: "1h" });
};

test("Five-User Real-Time Collaboration and Security Lifecycle", async (t) => {
  let userOwner, userAdmin, userEditor1, userEditor2, userViewer;
  let tokenOwner, tokenAdmin, tokenEditor1, tokenEditor2, tokenViewer;
  let clientOwner, clientAdmin, clientEditor1, clientEditor2, clientViewer;
  let clientEditor1_Tab2;
  let project, testFile;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());

    server = http.createServer(app);
    ioServer = new Server(server, {
      cors: { origin: "*", credentials: true },
    });
    registerSocketHandlers(ioServer);
    app.set("io", ioServer);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    socketServerUrl = `http://localhost:${port}`;
    baseUrl = `http://localhost:${port}/api`;

    await User.deleteMany({});
    await Project.deleteMany({});
    await FileNode.deleteMany({});
    await Activity.deleteMany({});
    await Version.deleteMany({});
    await Notification.deleteMany({});

    // 1. Create 5 distinct users
    userOwner = await User.create({ name: "User 1 (Owner)", email: "owner@test.com", password: "Password123!" });
    userAdmin = await User.create({ name: "User 2 (Admin)", email: "admin@test.com", password: "Password123!" });
    userEditor1 = await User.create({ name: "User 3 (Editor1)", email: "editor1@test.com", password: "Password123!" });
    userEditor2 = await User.create({ name: "User 4 (Editor2)", email: "editor2@test.com", password: "Password123!" });
    userViewer = await User.create({ name: "User 5 (Viewer)", email: "viewer@test.com", password: "Password123!" });

    tokenOwner = generateToken(userOwner._id, userOwner.email);
    tokenAdmin = generateToken(userAdmin._id, userAdmin.email);
    tokenEditor1 = generateToken(userEditor1._id, userEditor1.email);
    tokenEditor2 = generateToken(userEditor2._id, userEditor2.email);
    tokenViewer = generateToken(userViewer._id, userViewer.email);

    // 2. Create collaborative project with 5 members
    project = await Project.create({
      name: "Enterprise Realtime System",
      owner: userOwner._id,
      members: [userOwner._id, userAdmin._id, userEditor1._id, userEditor2._id, userViewer._id],
      memberRoles: new Map([
        [userAdmin._id.toString(), "Admin"],
        [userEditor1._id.toString(), "Editor"],
        [userEditor2._id.toString(), "Editor"],
        [userViewer._id.toString(), "Viewer"],
      ]),
    });

    // 3. Create test file
    testFile = await FileNode.create({
      project: project._id,
      name: "App.js",
      path: "/App.js",
      isFolder: false,
      content: "console.log('Initial code');",
    });
  });

  after(async () => {
    if (clientOwner?.connected) clientOwner.disconnect();
    if (clientAdmin?.connected) clientAdmin.disconnect();
    if (clientEditor1?.connected) clientEditor1.disconnect();
    if (clientEditor1_Tab2?.connected) clientEditor1_Tab2.disconnect();
    if (clientEditor2?.connected) clientEditor2.disconnect();
    if (clientViewer?.connected) clientViewer.disconnect();

    ioServer.close();
    server.close();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  const connectClient = (token) => {
    return ioClient(socketServerUrl, {
      extraHeaders: { cookie: `token=${token}` },
      transports: ["websocket"],
    });
  };

  await t.test("Phase 1: All 5 users connect and join project workspace", async () => {
    clientOwner = connectClient(tokenOwner);
    clientAdmin = connectClient(tokenAdmin);
    clientEditor1 = connectClient(tokenEditor1);
    clientEditor2 = connectClient(tokenEditor2);
    clientViewer = connectClient(tokenViewer);

    await Promise.all([
      new Promise((res) => clientOwner.on("connect", res)),
      new Promise((res) => clientAdmin.on("connect", res)),
      new Promise((res) => clientEditor1.on("connect", res)),
      new Promise((res) => clientEditor2.on("connect", res)),
      new Promise((res) => clientViewer.on("connect", res)),
    ]);

    // Join project for all 5 clients
    const joinPromises = [clientOwner, clientAdmin, clientEditor1, clientEditor2, clientViewer].map(
      (c) =>
        new Promise((res) => {
          c.emit("join-project", { projectId: project._id.toString() });
          c.once("users-update", res);
        })
    );

    const results = await Promise.all(joinPromises);
    const lastPresenceList = results[results.length - 1];

    assert.ok(Array.isArray(lastPresenceList), "Presence list must be an array");
    const onlineUserIds = new Set(lastPresenceList.map((u) => u.userId.toString()));
    assert.ok(onlineUserIds.has(userOwner._id.toString()), "Owner should be online");
    assert.ok(onlineUserIds.has(userAdmin._id.toString()), "Admin should be online");
    assert.ok(onlineUserIds.has(userEditor1._id.toString()), "Editor 1 should be online");
    assert.ok(onlineUserIds.has(userEditor2._id.toString()), "Editor 2 should be online");
    assert.ok(onlineUserIds.has(userViewer._id.toString()), "Viewer should be online");
  });

  await t.test("Phase 2: Multi-tab presence tracking prevents premature offline status", async () => {
    // Editor 1 opens a second tab
    clientEditor1_Tab2 = connectClient(tokenEditor1);
    await new Promise((res) => clientEditor1_Tab2.on("connect", res));
    clientEditor1_Tab2.emit("join-project", { projectId: project._id.toString() });
    await new Promise((res) => clientEditor1_Tab2.once("users-update", res));

    const initialLeaveCount = await Activity.countDocuments({
      project: project._id,
      user: userEditor1._id,
      type: "LEAVE",
    });

    // Close Tab 1 of Editor 1
    clientEditor1.disconnect();
    await new Promise((res) => setTimeout(res, 300));

    // Editor 1 should STILL be online because Tab 2 is active!
    const presenceAfterTab1Closed = await new Promise((res) => {
      clientOwner.once("users-update", res);
      clientOwner.emit("join-file", { fileId: testFile._id.toString() });
    });

    const onlineIds = new Set(presenceAfterTab1Closed.map((u) => u.userId.toString()));
    assert.ok(
      onlineIds.has(userEditor1._id.toString()),
      "Editor 1 must remain online while second tab is connected"
    );

    // Verify no premature LEAVE activity was logged
    const leaveCountAfterTab1 = await Activity.countDocuments({
      project: project._id,
      user: userEditor1._id,
      type: "LEAVE",
    });
    assert.strictEqual(leaveCountAfterTab1, initialLeaveCount, "LEAVE activity should not be logged while tab 2 is open");

    // Reconnect Tab 1 for future tests
    clientEditor1 = connectClient(tokenEditor1);
    await new Promise((res) => clientEditor1.on("connect", res));
    clientEditor1.emit("join-project", { projectId: project._id.toString() });
    await new Promise((res) => clientEditor1.once("users-update", res));

    // Close Tab 2
    clientEditor1_Tab2.disconnect();
  });

  await t.test("Phase 3: Live Monaco cursor, selection, and typing indicators", async () => {
    // All clients join file room
    const pId = project._id.toString();
    const fId = testFile._id.toString();

    clientOwner.emit("join-file", { fileId: fId, projectId: pId });
    clientAdmin.emit("join-file", { fileId: fId, projectId: pId });
    clientEditor1.emit("join-file", { fileId: fId, projectId: pId });
    clientEditor2.emit("join-file", { fileId: fId, projectId: pId });
    clientViewer.emit("join-file", { fileId: fId, projectId: pId });

    await new Promise((res) => setTimeout(res, 200));

    // Editor 1 moves cursor
    const cursorPromise = Promise.all([
      new Promise((res) => clientOwner.once("cursor-move", res)),
      new Promise((res) => clientAdmin.once("cursor-move", res)),
      new Promise((res) => clientEditor2.once("cursor-move", res)),
      new Promise((res) => clientViewer.once("cursor-move", res)),
    ]);

    clientEditor1.emit("cursor-move", {
      fileId: fId,
      cursorLine: 5,
      cursorColumn: 12,
    });

    const cursorEvents = await cursorPromise;
    for (const event of cursorEvents) {
      assert.strictEqual(event.userId, userEditor1._id.toString());
      assert.strictEqual(event.cursorLine, 5);
      assert.strictEqual(event.cursorColumn, 12);
    }

    // Editor 1 typing status
    const typingPromise = Promise.all([
      new Promise((res) => clientOwner.once("typing-update", res)),
      new Promise((res) => clientViewer.once("typing-update", res)),
    ]);

    clientEditor1.emit("typing-status", {
      fileId: fId,
      isTyping: true,
    });

    const typingEvents = await typingPromise;
    for (const evt of typingEvents) {
      assert.strictEqual(evt.userId, userEditor1._id.toString());
      assert.strictEqual(evt.isTyping, true);
    }
  });

  await t.test("Phase 4: File Soft Deletion and Restoration with Version History", async () => {
    // 1. Create a file to delete
    const fileRes = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `token=${tokenOwner}`,
      },
      body: JSON.stringify({
        projectId: project._id,
        name: "temporary.txt",
        isFolder: false,
        content: "Draft notes before deletion",
      }),
    });
    assert.strictEqual(fileRes.status, 201);
    const fileData = await fileRes.json();
    const tempFileId = fileData.file._id;

    // 2. Soft-delete the file
    const deleteRes = await fetch(`${baseUrl}/files/${tempFileId}`, {
      method: "DELETE",
      headers: {
        Cookie: `token=${tokenAdmin}`,
      },
    });
    assert.strictEqual(deleteRes.status, 200);

    // Verify soft-deletion in DB
    const deletedFileDb = await FileNode.findById(tempFileId);
    assert.strictEqual(deletedFileDb.isDeleted, true);
    assert.ok(deletedFileDb.deletedAt);
    assert.strictEqual(deletedFileDb.deletedBy.toString(), userAdmin._id.toString());

    // Verify DELETE activity logged
    const deleteActivity = await Activity.findOne({
      project: project._id,
      type: "DELETE",
    }).sort({ createdAt: -1 });
    assert.ok(deleteActivity, "DELETE activity must be logged");
    assert.strictEqual(deleteActivity.user.toString(), userAdmin._id.toString());

    // Verify pre-deletion Version snapshot was stored
    const preDeleteVersion = await Version.findOne({
      project: project._id,
    }).sort({ versionNumber: -1 });
    assert.ok(preDeleteVersion, "Recoverable Version snapshot must be recorded prior to deletion");
    assert.ok(preDeleteVersion.description.includes("deleting"));

    // Verify GET /files/projects/:projectId/files excludes soft-deleted file
    const activeFilesRes = await fetch(`${baseUrl}/files/projects/${project._id}/files`, {
      headers: { Cookie: `token=${tokenEditor1}` },
    });
    assert.strictEqual(activeFilesRes.status, 200);
    const activeData = await activeFilesRes.json();
    const activeIds = activeData.files.map((f) => f._id.toString());
    assert.ok(!activeIds.includes(tempFileId.toString()), "Soft-deleted file must not appear in active files list");

    // Verify GET /files/projects/:projectId/trash returns soft-deleted file
    const trashRes = await fetch(`${baseUrl}/files/projects/${project._id}/trash`, {
      headers: { Cookie: `token=${tokenEditor1}` },
    });
    assert.strictEqual(trashRes.status, 200);
    const trashData = await trashRes.json();
    const trashIds = trashData.files.map((f) => f._id.toString());
    assert.ok(trashIds.includes(tempFileId.toString()), "File must appear in trash endpoint");

    // 3. Restore file via POST /api/files/:fileId/restore
    const restoreRes = await fetch(`${baseUrl}/files/${tempFileId}/restore`, {
      method: "POST",
      headers: { Cookie: `token=${tokenEditor2}` },
    });
    assert.strictEqual(restoreRes.status, 200);
    const restoreData = await restoreRes.json();
    assert.strictEqual(restoreData.file.isDeleted, false);

    // Verify RESTORE_VERSION activity logged
    const restoreActivity = await Activity.findOne({
      project: project._id,
      type: "RESTORE_VERSION",
    }).sort({ createdAt: -1 });
    assert.ok(restoreActivity, "RESTORE_VERSION activity must be logged");
    assert.strictEqual(restoreActivity.user.toString(), userEditor2._id.toString());
  });

  await t.test("Phase 5: Dynamic Role Update & Real-Time Security Enforcement", async () => {
    // Demote Editor 2 to Viewer
    const roleNotificationPromise = new Promise((res) => {
      clientEditor2.once("role-notification", res);
    });
    const roleUpdatedBroadcast = new Promise((res) => {
      clientOwner.once("member-role-updated", res);
    });

    const updateRoleRes = await fetch(`${baseUrl}/projects/${project._id}/member/${userEditor2._id}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: `token=${tokenAdmin}`,
      },
      body: JSON.stringify({ role: "Viewer" }),
    });
    assert.strictEqual(updateRoleRes.status, 200);

    const [notif, broadcast] = await Promise.all([roleNotificationPromise, roleUpdatedBroadcast]);
    assert.strictEqual(notif.role, "Viewer");
    assert.strictEqual(broadcast.userId.toString(), userEditor2._id.toString());
    assert.strictEqual(broadcast.role, "Viewer");

    // Verify CHANGE_ROLE activity
    const changeRoleActivity = await Activity.findOne({
      project: project._id,
      type: "CHANGE_ROLE",
    }).sort({ createdAt: -1 });
    assert.ok(changeRoleActivity, "CHANGE_ROLE activity must be recorded");

    // Verify durable Notification in DB for demoted user
    const dbNotif = await Notification.findOne({
      recipient: userEditor2._id,
      title: "Workspace Role Updated",
    });
    assert.ok(dbNotif, "Durable notification record must exist for user");

    // Verify demoted Editor 2 is immediately blocked from editing code without reconnecting
    const editErrorPromise = new Promise((res) => {
      clientEditor2.once("error", res);
    });
    clientEditor2.emit("code-change", {
      fileId: testFile._id.toString(),
      rangeOffset: 0,
      rangeLength: 0,
      text: "// unauthorized attempt by viewer",
    });
    const editError = await editErrorPromise;
    assert.ok(
      editError.message.includes("read-only"),
      "Demoted user must be rejected with read-only error on code-change"
    );

    // Verify demoted Editor 2 is blocked from terminal
    const terminalErrorPromise = new Promise((res) => {
      clientEditor2.once("project-terminal-error", res);
    });
    clientEditor2.emit("project-terminal:start", {
      projectId: project._id.toString(),
    });
    const terminalError = await terminalErrorPromise;
    assert.ok(
      terminalError.message.includes("cannot run terminal commands"),
      "Demoted user must be rejected from running terminal"
    );
  });

  await t.test("Phase 6: Project Chat Notification excludes sender and reaches other 4 members", async () => {
    // Editor 1 sends chat message
    const pId = project._id.toString();

    const notifPromises = [
      new Promise((res) => clientOwner.once("chat-message-notification", res)),
      new Promise((res) => clientAdmin.once("chat-message-notification", res)),
      new Promise((res) => clientEditor2.once("chat-message-notification", res)),
      new Promise((res) => clientViewer.once("chat-message-notification", res)),
    ];

    let senderReceivedSelfNotif = false;
    clientEditor1.once("chat-message-notification", () => {
      senderReceivedSelfNotif = true;
    });

    clientEditor1.emit("send-message", { text: "Hello team, real-time collaboration is ready!" });

    const notifications = await Promise.all(notifPromises);
    assert.strictEqual(notifications.length, 4, "All other 4 collaborators must receive chat notification");
    for (const n of notifications) {
      assert.strictEqual(n.projectId, pId);
      assert.strictEqual(n.message.text, "Hello team, real-time collaboration is ready!");
    }
    assert.strictEqual(senderReceivedSelfNotif, false, "Sender must not receive chat-message-notification for self");
  });

  await t.test("Phase 7: Member Removal, Targeted Invalidation, and Stale Socket Rejection", async () => {
    // Owner removes Viewer (userViewer)
    const targetUserIdStr = userViewer._id.toString();

    const removedEventPromise = new Promise((res) => {
      clientViewer.once("member-removed", res);
    });
    const broadcastRemovedPromise = new Promise((res) => {
      clientOwner.once("member-removed", res);
    });

    const removeRes = await fetch(`${baseUrl}/projects/${project._id}/members/${targetUserIdStr}`, {
      method: "DELETE",
      headers: { Cookie: `token=${tokenOwner}` },
    });
    assert.strictEqual(removeRes.status, 200);

    const [removedEvent, broadcastEvent] = await Promise.all([
      removedEventPromise,
      broadcastRemovedPromise,
    ]);

    assert.strictEqual(removedEvent.userId.toString(), targetUserIdStr);
    assert.strictEqual(broadcastEvent.userId.toString(), targetUserIdStr);

    // Verify REMOVE_MEMBER Activity logged
    const removeActivity = await Activity.findOne({
      project: project._id,
      type: "REMOVE_MEMBER",
    }).sort({ createdAt: -1 });
    assert.ok(removeActivity, "REMOVE_MEMBER activity must be recorded");

    // Verify durable Notification in DB for removed user
    const removeNotif = await Notification.findOne({
      recipient: userViewer._id,
      title: "Workspace Access Revoked",
    });
    assert.ok(removeNotif, "Durable notification must be created for removed member");

    // Verify removed user's stale socket is kicked and rejected from all operations
    const staleAttemptPromise = new Promise((res) => {
      clientViewer.once("error", res);
    });
    // Attempt operation with stale socket
    clientViewer.emit("code-change", {
      fileId: testFile._id.toString(),
      rangeOffset: 0,
      rangeLength: 0,
      text: "// malicious injection after being removed",
    });

    const kickEvent = await staleAttemptPromise;
    assert.ok(kickEvent.message, "Stale socket must receive rejection error on code-change");
  });
});
