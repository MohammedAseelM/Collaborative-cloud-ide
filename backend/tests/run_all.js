// tests/run_all.js
// Responsibility: Discover and execute all *.test.js files in process-isolated workers.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const files = fs.readdirSync(__dirname);
const testFiles = files
  .filter((file) => file.endsWith(".test.js") && file !== "test_runner.js" && file !== "run_all.js")
  .map((file) => path.join("tests", file));

console.log(`[Test Runner] Found ${testFiles.length} test suites. Launching process-isolated node --test runner...`);

const result = spawnSync("node", ["--test", ...testFiles], {
  stdio: "inherit",
  cwd: path.resolve(__dirname, ".."),
  shell: true,
});

process.exit(result.status ?? 0);
