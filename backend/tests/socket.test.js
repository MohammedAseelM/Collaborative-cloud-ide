// tests/socket.test.js
// Responsibility: Test Socket.IO handlers, room allocations, cursor changes, and chat history broadcasters.

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Project from "../src/models/project.model.js";
import { registerSocketHandlers } from "../src/sockets/projectSocket.js";
import { clearDatabase } from "./test_helper.js";

let mongoServer;

before(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

after(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await clearDatabase();
});

test("Socket.IO Real-time Gateway System Tests", async (t) => {
  await t.test("should export a registerSocketHandlers setup function", () => {
    assert.strictEqual(typeof registerSocketHandlers, "function");
  });

  await t.test("should register room listeners and join project rooms upon connection", async () => {
    const mockUserId = new mongoose.Types.ObjectId();

    // 1. Bootstrap a dummy project owned by the mock user
    const dummyProject = new Project({
      name: "Socket Dummy Project",
      language: "javascript",
      owner: mockUserId,
      members: [mockUserId],
    });
    await dummyProject.save();
    const testProjectId = dummyProject._id.toString();

    const joinedRooms = [];
    const eventListeners = {};

    // Mock socket instance representing a client connection
    const mockSocket = {
      id: "socket-12345",
      user: {
        _id: mockUserId.toString(),
        name: "Socket Tester",
        email: "socket@example.com",
      },
      userColor: "#4f46e5",
      on: (event, callback) => {
        eventListeners[event] = callback;
      },
      join: (roomName) => {
        joinedRooms.push(roomName);
      },
      to: (roomName) => ({
        emit: (event, payload) => {},
      }),
      emit: (event, payload) => {},
    };

    // Mock socket.io server instance (implements use middleware and on connection listener)
    const mockIo = {
      use: (middleware) => {},
      on: (event, callback) => {
        if (event === "connection") {
          callback(mockSocket);
        }
      },
      to: (roomName) => ({
        emit: (event, payload) => {},
      }),
      in: (roomName) => ({
        emit: (event, payload) => {},
        fetchSockets: async () => [],
      }),
    };

    // Bootstrap room handlers
    registerSocketHandlers(mockIo);

    // Simulate "join-project" action (awaiting promise resolution)
    if (eventListeners["join-project"]) {
      await eventListeners["join-project"]({ projectId: testProjectId });
    }

    // Verify room joins immediately
    assert.ok(joinedRooms.includes(`project:${testProjectId}`));
  });
});
