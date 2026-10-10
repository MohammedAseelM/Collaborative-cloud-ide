// tests/terminal.test.js
// Responsibility: Test Integrated Terminal WebSocket lifecycle, RBAC authorization,
// keyboard streaming, resize, session isolation, and process cleanup.

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
import { registerSocketHandlers } from "../src/sockets/projectSocket.js";
import { env } from "../src/config/env.js";

let server;
let ioServer;
let mongoServer;
let socketServerUrl;

const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, env.JWT_SECRET || "test-jwt-secret", { expiresIn: "1h" });
};

test("Integrated Project Terminal System Tests", async (t) => {
  let ownerUser;
  let viewerUser;
  let outsiderUser;
  let ownerToken;
  let viewerToken;
  let outsiderToken;
  let project;
  let ownerClient;
  let viewerClient;
  let outsiderClient;

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

    ownerUser = await User.create({ name: "Terminal Owner", email: "term_owner@test.com", password: "Password123!" });
    viewerUser = await User.create({ name: "Terminal Viewer", email: "term_viewer@test.com", password: "Password123!" });
    outsiderUser = await User.create({ name: "Terminal Outsider", email: "term_outsider@test.com", password: "Password123!" });

    ownerToken = generateToken(ownerUser._id, ownerUser.email);
    viewerToken = generateToken(viewerUser._id, viewerUser.email);
    outsiderToken = generateToken(outsiderUser._id, outsiderUser.email);

    project = await Project.create({
      name: "Terminal Test Project",
      owner: ownerUser._id,
      members: [ownerUser._id, viewerUser._id],
      memberRoles: {
        [viewerUser._id.toString()]: "Viewer",
      },
    });

    ownerClient = ioClient(socketServerUrl, {
      extraHeaders: { Cookie: `token=${ownerToken}` },
      transports: ["websocket"],
      forceNew: true,
    });

    viewerClient = ioClient(socketServerUrl, {
      extraHeaders: { Cookie: `token=${viewerToken}` },
      transports: ["websocket"],
      forceNew: true,
    });

    outsiderClient = ioClient(socketServerUrl, {
      extraHeaders: { Cookie: `token=${outsiderToken}` },
      transports: ["websocket"],
      forceNew: true,
    });

    await Promise.all([
      new Promise((res) => ownerClient.on("connect", res)),
      new Promise((res) => viewerClient.on("connect", res)),
      new Promise((res) => outsiderClient.on("connect", res)),
    ]);
  });

  after(async () => {
    if (ownerClient?.connected) ownerClient.disconnect();
    if (viewerClient?.connected) viewerClient.disconnect();
    if (outsiderClient?.connected) outsiderClient.disconnect();
    await new Promise((res) => server.close(res));
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  await t.test("1. should reject terminal start when no projectId is supplied", async () => {
    const errorPromise = new Promise((resolve) => {
      ownerClient.once("project-terminal-error", resolve);
    });

    ownerClient.emit("project-terminal:start", { projectId: "" });
    const err = await errorPromise;
    assert.match(err.message, /No project is selected/i);
  });

  await t.test("2. should reject terminal start when projectId is an invalid ObjectId", async () => {
    const errorPromise = new Promise((resolve) => {
      ownerClient.once("project-terminal-error", resolve);
    });

    ownerClient.emit("project-terminal:start", { projectId: "not-a-valid-id-123" });
    const err = await errorPromise;
    assert.match(err.message, /valid project ID is required/i);
  });

  await t.test("3. should reject terminal start when project does not exist", async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const errorPromise = new Promise((resolve) => {
      ownerClient.once("project-terminal-error", resolve);
    });

    ownerClient.emit("project-terminal:start", { projectId: nonExistentId });
    const err = await errorPromise;
    assert.match(err.message, /Project not found/i);
  });

  await t.test("4. should reject terminal start if user is not a member of the project", async () => {
    const errorPromise = new Promise((resolve) => {
      outsiderClient.once("project-terminal-error", resolve);
    });

    outsiderClient.emit("project-terminal:start", { projectId: project._id.toString() });
    const err = await errorPromise;
    assert.match(err.message, /not a member of this project/i);
  });

  await t.test("5. should reject terminal start if user role is Viewer", async () => {
    viewerClient.emit("join-project", { projectId: project._id.toString() });
    await new Promise((r) => setTimeout(r, 200));

    const errorPromise = new Promise((resolve) => {
      viewerClient.once("project-terminal-error", resolve);
    });

    viewerClient.emit("project-terminal:start", { projectId: project._id.toString() });
    const err = await errorPromise;
    assert.match(err.message, /cannot run terminal commands/i);
  });

  await t.test("6. should start terminal session for Owner and emit ready and output", async () => {
    ownerClient.emit("join-project", { projectId: project._id.toString() });
    await new Promise((r) => setTimeout(r, 200));

    const readyPromise = new Promise((resolve) => {
      ownerClient.once("project-terminal-ready", resolve);
    });

    const outputChunks = [];
    const outputListener = ({ data }) => {
      outputChunks.push(data);
    };
    ownerClient.on("project-terminal-output", outputListener);

    ownerClient.emit("project-terminal:start", {
      projectId: project._id.toString(),
      cols: 80,
      rows: 24,
    });

    const readyData = await readyPromise;
    assert.ok(readyData);
    assert.ok(readyData.projectName);
    assert.strictEqual(typeof readyData.dockerAvailable, "boolean");

    // Wait for banner / shell output
    await new Promise((r) => setTimeout(r, 1000));
    assert.ok(outputChunks.length > 0, "Terminal must emit initial banner or shell output");

    ownerClient.off("project-terminal-output", outputListener);
  });

  await t.test("7. should stream interactive keyboard input to active process", async () => {
    let captured = "";
    const inputDonePromise = new Promise((resolve) => {
      const listener = ({ data }) => {
        captured += data;
        if (captured.includes("ECHO_TEST_SUCCESS")) {
          ownerClient.off("project-terminal-output", listener);
          resolve();
        }
      };
      ownerClient.on("project-terminal-output", listener);
    });

    ownerClient.emit("project-terminal:input", { data: "echo ECHO_TEST_SUCCESS\r\n" });

    const timeout = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("Timeout waiting for echo output")), 6000)
    );
    await Promise.race([inputDonePromise, timeout]);
    assert.ok(captured.includes("ECHO_TEST_SUCCESS"));
  });

  await t.test("8. should handle project-terminal:resize without errors", async () => {
    ownerClient.emit("project-terminal:resize", { cols: 120, rows: 40 });
    await new Promise((r) => setTimeout(r, 200));
    assert.strictEqual(ownerClient.connected, true);
  });

  await t.test("9. should cleanly stop terminal session and emit exit on project-terminal:stop", async () => {
    const exitPromise = new Promise((resolve) => {
      ownerClient.once("project-terminal-exit", resolve);
    });

    ownerClient.emit("project-terminal:stop");
    const exitData = await exitPromise;
    assert.ok(exitData);
    assert.strictEqual(exitData.stoppedByUser, true);
    assert.strictEqual(ownerClient.connected, true);
  });
});
