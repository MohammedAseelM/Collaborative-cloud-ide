import test from "node:test";
import assert from "node:assert";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { Server } from "socket.io";
import { io as ClientIO } from "socket.io-client";
import jwt from "jsonwebtoken";

import app from "../src/app.js";
import User from "../src/models/user.model.js";
import Project from "../src/models/project.model.js";
import FileNode from "../src/models/file.model.js";
import Version from "../src/models/version.model.js";
import { registerSocketHandlers } from "../src/sockets/projectSocket.js";
import { env } from "../src/config/env.js";

const generateToken = (userId, email) => {
  return jwt.sign({ userId, email }, env.JWT_SECRET, { expiresIn: "1h" });
};

test("Version Snapshot Restoration and Project Isolation Suite", async (t) => {
  let mongoServer, server, ioServer;
  let baseUrl, socketServerUrl;
  let user, userToken;
  let project1, project2;

  t.before(async () => {
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

    user = await User.create({
      name: "Isolation Tester",
      email: "tester@example.com",
      password: "password123",
      isVerified: true,
    });
    userToken = generateToken(user._id.toString(), user.email);

    project1 = await Project.create({
      name: "Project One",
      owner: user._id,
      members: [user._id],
      memberRoles: new Map([[user._id.toString(), "Owner"]]),
    });

    project2 = await Project.create({
      name: "Project Two",
      owner: user._id,
      members: [user._id],
      memberRoles: new Map([[user._id.toString(), "Owner"]]),
    });
  });

  t.after(async () => {
    if (ioServer) ioServer.close();
    if (server) await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    if (mongoServer) await mongoServer.stop();
  });

  await t.test("Snapshots restore strictly to target project without leaking to other projects", async () => {
    // 1. Populate Project 1 with distinct files
    const p1FileRes = await fetch(`${baseUrl}/files/projects/${project1._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${userToken}` },
      body: JSON.stringify({ name: "proj1-main.js", isFolder: false, content: "console.log('Project 1 Initial');" }),
    });
    const p1FileData = await p1FileRes.json();
    assert.strictEqual(p1FileData.success, true);

    // 2. Populate Project 2 with completely different files
    const p2FileRes = await fetch(`${baseUrl}/files/projects/${project2._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${userToken}` },
      body: JSON.stringify({ name: "proj2-secret.js", isFolder: false, content: "console.log('Project 2 Secret File');" }),
    });
    const p2FileData = await p2FileRes.json();
    assert.strictEqual(p2FileData.success, true);

    // 3. Save snapshot for Project 1
    const snapRes = await fetch(`${baseUrl}/projects/${project1._id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${userToken}` },
      body: JSON.stringify({ name: "P1 Snapshot v1", description: "First snapshot of Project 1" }),
    });
    const snapData = await snapRes.json();
    assert.strictEqual(snapData.success, true);
    assert.strictEqual(snapData.version.name, "P1 Snapshot v1");
    assert.ok(snapData.version.files.length >= 1);
    const snapVersionId = snapData.version._id;

    // 4. Modify Project 1 by adding an extra temporary file
    await fetch(`${baseUrl}/files/projects/${project1._id}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: `token=${userToken}` },
      body: JSON.stringify({ name: "proj1-temp.txt", isFolder: false, content: "Temporary scratch file" }),
    });

    const p1PreRestore = await FileNode.find({ project: project1._id, isDeleted: { $ne: true } });
    assert.ok(p1PreRestore.some((f) => f.name === "proj1-temp.txt"));

    // 5. Connect Socket for Client on Project 2 and listen for events
    let p2ReceivedFilesUpdated = false;
    let p2ReceivedVersionRestored = false;

    const p2Socket = ClientIO(socketServerUrl, {
      extraHeaders: { cookie: `token=${userToken}` },
      transports: ["websocket"],
    });

    await new Promise((resolve) => {
      p2Socket.on("connect", () => {
        p2Socket.emit("join-project", { projectId: project2._id.toString() });
        resolve();
      });
    });

    p2Socket.on("files-updated", (data) => {
      if (data.projectId && data.projectId !== project2._id.toString()) return;
      p2ReceivedFilesUpdated = true;
    });

    p2Socket.on("project-version-restored", (data) => {
      if (data.projectId && data.projectId !== project2._id.toString()) return;
      p2ReceivedVersionRestored = true;
    });

    // 6. Restore Project 1 to Snapshot v1
    const restoreRes = await fetch(`${baseUrl}/projects/${project1._id}/versions/${snapVersionId}/restore`, {
      method: "POST",
      headers: { Cookie: `token=${userToken}` },
    });
    const restoreData = await restoreRes.json();
    assert.strictEqual(restoreData.success, true);

    // Wait 300ms for any potential asynchronous socket leaks
    await new Promise((resolve) => setTimeout(resolve, 300));

    // 7. Verify Project 1 was restored properly
    const p1PostRestore = await FileNode.find({ project: project1._id, isDeleted: { $ne: true } });
    assert.ok(p1PostRestore.some((f) => f.name === "proj1-main.js"), "Project 1 should retain snapshot file");
    assert.ok(!p1PostRestore.some((f) => f.name === "proj1-temp.txt"), "Project 1 temporary file should be gone after restore");

    // 8. Verify Project 2 was NOT contaminated in MongoDB
    const p2PostRestore = await FileNode.find({ project: project2._id, isDeleted: { $ne: true } });
    assert.strictEqual(p2PostRestore.length, 1, "Project 2 should only have its own files");
    assert.strictEqual(p2PostRestore[0].name, "proj2-secret.js");
    assert.ok(!p2PostRestore.some((f) => f.name.includes("proj1")), "Project 2 must not receive Project 1 files");

    // 9. Verify Project 2 was NOT triggered via Socket
    assert.strictEqual(p2ReceivedFilesUpdated, false, "Project 2 socket must not receive Project 1 files-updated event");
    assert.strictEqual(p2ReceivedVersionRestored, false, "Project 2 socket must not receive Project 1 version-restored event");

    // 10. Verify disk files for Project 1 and Project 2 are isolated
    const p1Dir = path.resolve(env.WORKSPACE_ROOT, user._id.toString(), project1._id.toString());
    const p2Dir = path.resolve(env.WORKSPACE_ROOT, user._id.toString(), project2._id.toString());

    if (fs.existsSync(p1Dir)) {
      const p1DiskFiles = fs.readdirSync(p1Dir);
      assert.ok(p1DiskFiles.includes("proj1-main.js"));
      assert.ok(!p1DiskFiles.includes("proj1-temp.txt"), "proj1-temp.txt must be removed from disk");
      assert.ok(!p1DiskFiles.includes("proj2-secret.js"));
    }

    if (fs.existsSync(p2Dir)) {
      const p2DiskFiles = fs.readdirSync(p2Dir);
      assert.ok(p2DiskFiles.includes("proj2-secret.js"));
      assert.ok(!p2DiskFiles.includes("proj1-main.js"), "Project 2 disk must not have Project 1 files");
    }

    p2Socket.disconnect();
  });
});
