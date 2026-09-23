// tests/googleAuth.test.js
// Responsibility: Verify token parsing, registration, and login flows for Google OAuth.

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

test("Google Auth Integration Tests", async (t) => {
  await t.test("should reject Google login if idToken is missing", async () => {
    const res = await fetch(`${baseUrl}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 400);
    assert.strictEqual(data.success, false);
    assert.match(data.message, /Google ID token is required/);
  });

  await t.test("should reject Google login if idToken is invalid", async () => {
    const res = await fetch(`${baseUrl}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "invalid-token" }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 401);
    assert.strictEqual(data.success, false);
  });

  await t.test("should register and log in user successfully with valid mock token", async () => {
    const res = await fetch(`${baseUrl}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "mock-google-token" }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.user.email, "mockgoogleuser@example.com");
    assert.strictEqual(data.user.name, "Mock Google User");
    assert.strictEqual(data.user.googleId, "mock-google-sub-12345");

    // Verify user exists in mock memory database
    const dbUser = await User.findOne({ email: "mockgoogleuser@example.com" });
    assert.ok(dbUser);
    assert.strictEqual(dbUser.googleId, "mock-google-sub-12345");
  });

  await t.test("should log in existing user without creating a duplicate account", async () => {
    // 1. First login to register user
    await fetch(`${baseUrl}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "mock-google-token" }),
    });

    // 2. Second login to sign in existing user
    const res = await fetch(`${baseUrl}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "mock-google-token" }),
    });

    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.success, true);

    // Verify that only one user exists in the database
    const count = await User.countDocuments({ email: "mockgoogleuser@example.com" });
    assert.strictEqual(count, 1);
  });
});
