// tests/auth.test.js
// Responsibility: Test authentication endpoints, registration, login, and protected guards.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import http from "http";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../src/app.js";
import { clearDatabase } from "./test_helper.js";
import User from "../src/models/user.model.js";

let server;
let mongoServer;
let baseUrl;

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
});

test("Authentication System Tests", async (t) => {
  await t.test("should register a new user successfully", async () => {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Developer",
        email: "dev@example.com",
        password: "password123",
      }),
    });

    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.name, "Test Developer");
    assert.strictEqual(data.user.email, "dev@example.com");
  });

  await t.test("should block registration with an existing email", async () => {
    const existing = new User({
      name: "Existing User",
      email: "exist@example.com",
      password: "password123",
    });
    await existing.save();

    const res = await fetch(`${baseUrl}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Cloned User",
        email: "exist@example.com",
        password: "password123",
      }),
    });

    assert.strictEqual(res.status, 409);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });

  await t.test("should login successfully and return cookie", async () => {
    const user = new User({
      name: "Login User",
      email: "login@example.com",
      password: "password123",
    });
    await user.save();

    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "login@example.com",
        password: "password123",
      }),
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(res.headers.get("set-cookie"));
  });

  await t.test("should reject login with wrong password", async () => {
    const user = new User({
      name: "Wrong Pass User",
      email: "wrong@example.com",
      password: "password123",
    });
    await user.save();

    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "wrong@example.com",
        password: "badpassword",
      }),
    });

    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.success, false);
  });
});
