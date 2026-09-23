// tests/test_runner.js
// Responsibility: Programmatically launch all test suites.
// Run using: node --test tests/test_runner.js

import logger from "../src/utils/logger.js";

// Disable logging transport output to console during tests to keep logs clean
logger.transports.forEach((t) => {
  t.silent = true;
});

// Import all isolated test suites
import "./auth.test.js";
import "./project.test.js";
import "./member.test.js";
import "./file.test.js";
import "./run.test.js";
import "./socket.test.js";
