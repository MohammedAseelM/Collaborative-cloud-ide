// tests/run.test.js
// Responsibility: Test sandbox code compilation, output returns, and execution limit constraints.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import http from "http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../src/app.js";
import { clearDatabase, getAuthCookie } from "./test_helper.js";
import User from "../src/models/user.model.js";
import Project from "../src/models/project.model.js";

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
  testUser = new User({ name: "Run Tester", email: "run@example.com", password: "password123" });
  await testUser.save();
  authCookie = getAuthCookie(testUser._id);

  project = new Project({
    name: "Run Test Project",
    language: "javascript",
    owner: testUser._id,
    members: [testUser._id],
  });
  await project.save();
});

test("Code Compilation & Sandbox Execution Tests", async (t) => {
  await t.test("executes in Docker or clearly reports that the sandbox is unavailable", async () => {

    const res = await fetch(`${baseUrl}/projects/${project._id}/run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: authCookie,
      },
      body: JSON.stringify({
        code: "console.log('Test output value');",
        input: "",
      }),
    });

    const data = await res.json();
    if (res.status === 200) {
      assert.strictEqual(data.success, true);
      assert.ok(data.stdout.includes("Test output value"));
    } else {
      assert.strictEqual(res.status, 503);
      assert.strictEqual(data.errorCode, "DOCKER_UNAVAILABLE");
      assert.strictEqual(data.stdout, "");
    }
  });
});
