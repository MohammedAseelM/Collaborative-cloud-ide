// tests/twoClientRealtime.test.js
// Multi-client real-time synchronization test suite:
// Verifies simultaneous two-user Socket.IO communication end-to-end.

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
import { registerSocketHandlers } from "../src/sockets/projectSocket.js";
import { env } from "../src/config/env.js";

let server;
let ioServer;
let mongoServer;
let socketServerUrl;

const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, env.JWT_SECRET || "test-jwt-secret", { expiresIn: "1h" });
};

test("Two-Client Real-Time Collaboration Full Flow", async (t) => {
  let userA, userB;
  let tokenA, tokenB;
  let project, testFile;
  let clientA, clientB;

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

    await User.deleteMany({});
    await Project.deleteMany({});
    await FileNode.deleteMany({});

    userA = await User.create({ name: "User A", email: "userA@test.com", password: "Password123!" });
    userB = await User.create({ name: "User B", email: "userB@test.com", password: "Password123!" });

    tokenA = generateToken(userA._id, userA.email);
    tokenB = generateToken(userB._id, userB.email);

    project = await Project.create({
      name: "Realtime Collab Project",
      owner: userA._id,
      members: [userA._id, userB._id],
      memberRoles: new Map([[userB._id.toString(), "Editor"]]),
    });

    testFile = await FileNode.create({
      project: project._id,
      name: "index.html",
      path: "/index.html",
      isFolder: false,
      content: "<h1>Initial</h1>",
    });
  });

  after(async () => {
    if (clientA?.connected) clientA.disconnect();
    if (clientB?.connected) clientB.disconnect();
    ioServer.close();
    server.close();
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  await t.test("Step 1: Connect Client A & Client B and join project & file rooms", async () => {
    clientA = ioClient(socketServerUrl, {
      extraHeaders: { cookie: `token=${tokenA}` },
      transports: ["websocket"],
    });

    clientB = ioClient(socketServerUrl, {
      extraHeaders: { cookie: `token=${tokenB}` },
      transports: ["websocket"],
    });

    await Promise.all([
      new Promise((resolve) => clientA.on("connect", resolve)),
      new Promise((resolve) => clientB.on("connect", resolve)),
    ]);

    assert.ok(clientA.connected, "Client A connected");
    assert.ok(clientB.connected, "Client B connected");

    // Both join project
    clientA.emit("join-project", { projectId: project._id.toString() });
    clientB.emit("join-project", { projectId: project._id.toString() });

    // Both join file
    const fileSyncAPromise = new Promise((resolve) => clientA.once("file-sync", resolve));
    const fileSyncBPromise = new Promise((resolve) => clientB.once("file-sync", resolve));

    clientA.emit("join-file", { fileId: testFile._id.toString() });
    clientB.emit("join-file", { fileId: testFile._id.toString() });

    const [syncA, syncB] = await Promise.all([fileSyncAPromise, fileSyncBPromise]);

    assert.equal(syncA.fileId, testFile._id.toString());
    assert.equal(syncA.code, "<h1>Initial</h1>");
    assert.equal(syncB.fileId, testFile._id.toString());
    assert.equal(syncB.code, "<h1>Initial</h1>");
  });

  await t.test("Step 2: Live Code Sync (Client A edits -> Client B receives)", async () => {
    const codeChangePromise = new Promise((resolve) => clientB.once("code-change", resolve));

    clientA.emit("code-change", {
      fileId: testFile._id.toString(),
      rangeOffset: 4,
      rangeLength: 7, // replace "Initial"
      text: "Hello User A",
    });

    const received = await codeChangePromise;
    assert.equal(received.fileId, testFile._id.toString());
    assert.equal(received.rangeOffset, 4);
    assert.equal(received.rangeLength, 7);
    assert.equal(received.text, "Hello User A");
  });

  await t.test("Step 3: Live Code Sync (Client B edits -> Client A receives)", async () => {
    const codeChangePromise = new Promise((resolve) => clientA.once("code-change", resolve));

    clientB.emit("code-change", {
      fileId: testFile._id.toString(),
      rangeOffset: 10,
      rangeLength: 6, // replace "User A" with "User B"
      text: "User B",
    });

    const received = await codeChangePromise;
    assert.equal(received.fileId, testFile._id.toString());
    assert.equal(received.text, "User B");
  });

  await t.test("Step 4: Remote Monaco Cursor (Client A moves cursor -> Client B receives)", async () => {
    const cursorPromise = new Promise((resolve) => clientB.once("cursor-move", resolve));

    clientA.emit("cursor-move", {
      projectId: project._id.toString(),
      fileId: testFile._id.toString(),
      cursorLine: 5,
      cursorColumn: 10,
      cursorPosition: { lineNumber: 5, column: 10 },
    });

    const cursor = await cursorPromise;
    assert.equal(cursor.fileId, testFile._id.toString());
    assert.equal(cursor.userId, userA._id.toString());
    assert.equal(cursor.username, "User A");
    assert.equal(cursor.cursorLine, 5);
    assert.equal(cursor.cursorColumn, 10);
    assert.ok(cursor.userColor, "User A color assigned");
  });

  await t.test("Step 5: Remote Monaco Cursor (Client B moves cursor -> Client A receives)", async () => {
    const cursorPromise = new Promise((resolve) => clientA.once("cursor-move", resolve));

    clientB.emit("cursor-move", {
      projectId: project._id.toString(),
      fileId: testFile._id.toString(),
      cursorLine: 8,
      cursorColumn: 15,
      cursorPosition: { lineNumber: 8, column: 15 },
    });

    const cursor = await cursorPromise;
    assert.equal(cursor.fileId, testFile._id.toString());
    assert.equal(cursor.userId, userB._id.toString());
    assert.equal(cursor.username, "User B");
    assert.equal(cursor.cursorLine, 8);
    assert.equal(cursor.cursorColumn, 15);
    assert.ok(cursor.userColor, "User B color assigned");
  });

  await t.test("Step 6: Remote Monaco Selection (Client A selects text -> Client B receives)", async () => {
    const selectionPromise = new Promise((resolve) => clientB.once("selection-change", resolve));

    clientA.emit("selection-change", {
      projectId: project._id.toString(),
      fileId: testFile._id.toString(),
      selectionStart: { lineNumber: 1, column: 1 },
      selectionEnd: { lineNumber: 1, column: 12 },
    });

    const sel = await selectionPromise;
    assert.equal(sel.fileId, testFile._id.toString());
    assert.equal(sel.userId, userA._id.toString());
    assert.equal(sel.selectionStart.lineNumber, 1);
    assert.equal(sel.selectionStart.column, 1);
    assert.equal(sel.selectionEnd.lineNumber, 1);
    assert.equal(sel.selectionEnd.column, 12);
  });

  await t.test("Step 7: Remote Mouse Movement (Client A moves mouse -> Client B receives)", async () => {
    const mousePromise = new Promise((resolve) => clientB.once("mouse-move", resolve));

    clientA.emit("mouse-move", {
      projectId: project._id.toString(),
      fileId: testFile._id.toString(),
      mouseX: 45.5,
      mouseY: 60.2,
    });

    const mouse = await mousePromise;
    assert.equal(mouse.fileId, testFile._id.toString());
    assert.equal(mouse.userId, userA._id.toString());
    assert.equal(mouse.username, "User A");
    assert.equal(mouse.mouseX, 45.5);
    assert.equal(mouse.mouseY, 60.2);
    assert.ok(mouse.userColor, "User A mouse color assigned");
  });

  await t.test("Step 8: Remote Typing Indicator (Client A types -> Client B receives)", async () => {
    const typingPromise = new Promise((resolve) => clientB.once("typing-update", resolve));

    clientA.emit("typing-status", {
      fileId: testFile._id.toString(),
      isTyping: true,
    });

    const typing = await typingPromise;
    assert.equal(typing.fileId, testFile._id.toString());
    assert.equal(typing.userId.toString(), userA._id.toString());
    assert.equal(typing.username, "User A");
    assert.equal(typing.isTyping, true);
  });

  await t.test("Step 9: Client A disconnects -> Client B receives cleanup -> Reconnects and resumes sync", async () => {
    const cursorRemovePromise = new Promise((resolve) => clientB.once("cursor-remove", resolve));
    const mouseRemovePromise = new Promise((resolve) => clientB.once("mouse-remove", resolve));

    clientA.disconnect();

    const [cRem, mRem] = await Promise.all([cursorRemovePromise, mouseRemovePromise]);
    assert.equal(cRem.userId.toString(), userA._id.toString());
    assert.equal(mRem.userId.toString(), userA._id.toString());

    // Client A reconnects
    clientA = ioClient(socketServerUrl, {
      extraHeaders: { cookie: `token=${tokenA}` },
      transports: ["websocket"],
    });

    await new Promise((resolve) => clientA.on("connect", resolve));
    clientA.emit("join-project", { projectId: project._id.toString() });
    
    const fileSyncPromise = new Promise((resolve) => clientA.once("file-sync", resolve));
    clientA.emit("join-file", { fileId: testFile._id.toString() });
    await fileSyncPromise;

    // Client A edits again
    const codeChangePromise2 = new Promise((resolve) => clientB.once("code-change", resolve));
    clientA.emit("code-change", {
      fileId: testFile._id.toString(),
      rangeOffset: 0,
      rangeLength: 0,
      text: "<!-- recovered -->",
    });

    const sync2 = await codeChangePromise2;
    assert.equal(sync2.text, "<!-- recovered -->");
  });

  await t.test("Step 10: Real-time Invitation Flow (User A invites User C -> User C receives instant invitation-created and invitation-popup)", async () => {
    const userC = await User.create({ name: "User C", email: "userC@test.com", password: "Password123!" });
    const tokenC = generateToken(userC._id, userC.email);

    const clientC = ioClient(socketServerUrl, {
      extraHeaders: { cookie: `token=${tokenC}` },
      transports: ["websocket"],
    });

    await new Promise((resolve) => clientC.on("connect", resolve));

    const inviteCreatedPromise = new Promise((resolve) => clientC.once("invitation-created", resolve));
    const invitePopupPromise = new Promise((resolve) => clientC.once("invitation-popup", resolve));
    const notifReceivedPromise = new Promise((resolve) => clientC.once("notification-received", resolve));

    // User A invites User C to the project via HTTP API
    const res = await fetch(`${socketServerUrl}/api/projects/${project._id}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `token=${tokenA}`,
      },
      body: JSON.stringify({ email: "userC@test.com", role: "Editor" }),
    });

    assert.equal(res.status, 201, "Invitation API created successfully");

    const [inviteCreated, invitePopup, notifReceived] = await Promise.all([
      inviteCreatedPromise,
      invitePopupPromise,
      notifReceivedPromise,
    ]);

    assert.equal(inviteCreated.projectName, "Realtime Collab Project");
    assert.equal(inviteCreated.role, "Editor");
    assert.equal(invitePopup.role, "Editor");
    assert.equal(notifReceived.type, "INVITE");

    clientC.disconnect();
  });

  await t.test("Step 11: Real-time Task Assignment Flow (Owner A assigns task to Member B -> Member B receives instant task-assigned, task-popup, and notification)", async () => {
    const taskAssignedPromise = new Promise((resolve) => clientB.once("task-assigned", resolve));
    const taskPopupPromise = new Promise((resolve) => clientB.once("task-popup", resolve));
    const notifReceivedPromise = new Promise((resolve) => clientB.once("notification-received", resolve));

    // User A assigns task to User B via HTTP API
    const res = await fetch(`${socketServerUrl}/api/projects/${project._id}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `token=${tokenA}`,
      },
      body: JSON.stringify({
        title: "Implement Auth Flow",
        description: "Set up JWT cookies and refresh logic",
        assignedTo: userB._id.toString(),
        priority: "high",
      }),
    });

    assert.equal(res.status, 201, "Task API created successfully");

    const [taskAssigned, taskPopup, notifReceived] = await Promise.all([
      taskAssignedPromise,
      taskPopupPromise,
      notifReceivedPromise,
    ]);

    assert.equal(taskAssigned.title, "Implement Auth Flow");
    assert.equal(taskAssigned.priority, "high");
    assert.equal(taskPopup.title, "Implement Auth Flow");
    assert.equal(notifReceived.type, "TASK");
  });
});
