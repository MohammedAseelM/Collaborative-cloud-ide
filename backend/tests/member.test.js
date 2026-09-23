// tests/member.test.js
// Responsibility: Test team invitations, role modifications, and membership removal (kicks).

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import http from "http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../src/app.js";
import { clearDatabase, getAuthCookie } from "./test_helper.js";
import User from "../src/models/user.model.js";
import Project from "../src/models/project.model.js";
import Invitation from "../src/models/invitation.model.js";

let server;
let mongoServer;
let baseUrl;
let ownerUser;
let inviteeUser;
let ownerCookie;
let inviteeCookie;
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

  // Create Owner & Invitee
  ownerUser = new User({ name: "Owner Dev", email: "owner@example.com", password: "password123" });
  await ownerUser.save();
  ownerCookie = getAuthCookie(ownerUser._id);

  inviteeUser = new User({ name: "Invitee Dev", email: "invitee@example.com", password: "password123" });
  await inviteeUser.save();
  inviteeCookie = getAuthCookie(inviteeUser._id);

  // Create project owned by Owner
  project = new Project({
    name: "Team Project",
    language: "javascript",
    owner: ownerUser._id,
    members: [ownerUser._id],
  });
  await project.save();
});

test("Team Management System Tests", async (t) => {
  await t.test("should send a workspace invitation successfully", async () => {
    const res = await fetch(`${baseUrl}/projects/${project._id}/invitations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie,
      },
      body: JSON.stringify({
        email: "invitee@example.com",
        role: "Editor",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.invitation.email, "invitee@example.com");
    assert.strictEqual(data.invitation.role, "Editor");
  });

  await t.test("should accept a workspace invitation by ID", async () => {
    // Bootstrap invitation
    const invite = new Invitation({
      project: project._id,
      invitedBy: ownerUser._id,
      email: "invitee@example.com",
      role: "Editor",
      token: "sometesttokenvalue",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    await invite.save();

    const res = await fetch(`${baseUrl}/invitations/${invite._id}/accept`, {
      method: "POST",
      headers: { Cookie: inviteeCookie },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    // Verify database record updates
    const updatedProj = await Project.findById(project._id);
    assert.ok(updatedProj.members.includes(inviteeUser._id.toString()));
    assert.strictEqual(updatedProj.memberRoles.get(inviteeUser._id.toString()), "Editor");
  });

  await t.test("should change a member role", async () => {
    // Bootstrap member in project
    project.members.push(inviteeUser._id);
    project.memberRoles = new Map();
    project.memberRoles.set(inviteeUser._id.toString(), "Editor");
    await project.save();

    const res = await fetch(`${baseUrl}/projects/${project._id}/member/${inviteeUser._id}/role`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Cookie: ownerCookie,
      },
      body: JSON.stringify({ role: "Viewer" }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.memberRoles[inviteeUser._id.toString()], "Viewer");
  });

  await t.test("should remove a member (kick) from project", async () => {
    // Bootstrap member in project
    project.members.push(inviteeUser._id);
    project.memberRoles = new Map();
    project.memberRoles.set(inviteeUser._id.toString(), "Editor");
    await project.save();

    const res = await fetch(`${baseUrl}/projects/${project._id}/member/${inviteeUser._id}`, {
      method: "DELETE",
      headers: { Cookie: ownerCookie },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    const updatedProj = await Project.findById(project._id);
    assert.ok(!updatedProj.members.includes(inviteeUser._id.toString()));
  });
});
