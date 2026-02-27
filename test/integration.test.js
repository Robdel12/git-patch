import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";

let tmp;
let bin = join(import.meta.dirname, "..", "bin", "git-patch.js");

function gp(args, opts = {}) {
  return execSync(`node ${bin} ${args}`, {
    cwd: tmp,
    encoding: "utf-8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@test.com",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@test.com",
    },
    ...opts,
  }).trim();
}

function git(args) {
  return execSync(`git ${args}`, { cwd: tmp, encoding: "utf-8" }).trim();
}

function writeFile(name, content) {
  let full = join(tmp, name);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}

function readFile(name) {
  return readFileSync(join(tmp, name), "utf-8");
}

describe("git-patch integration", () => {
  before(() => {
    tmp = mkdtempSync(join(tmpdir(), "git-patch-test-"));
    git("init");
    git("config commit.gpgsign false");

    // Create initial files
    writeFile(
      "src/app.js",
      [
        "function greet(name) {",
        '  return "Hello, " + name;',
        "}",
        "",
        "function farewell(name) {",
        '  return "Goodbye, " + name;',
        "}",
        "",
        "module.exports = { greet, farewell };",
        "",
      ].join("\n"),
    );

    writeFile(
      "src/utils.js",
      [
        "function add(a, b) {",
        "  return a + b;",
        "}",
        "",
        "function subtract(a, b) {",
        "  return a - b;",
        "}",
        "",
        "module.exports = { add, subtract };",
        "",
      ].join("\n"),
    );

    git("add -A");
    git('commit -m "initial"');
  });

  after(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // Reset to clean state before each test
  beforeEach(() => {
    git("checkout -- .");
    git("reset HEAD -- .");
  });

  describe("list", () => {
    it("reports no changes when clean", () => {
      let out = gp("list");
      assert.equal(out, "No unstaged changes.");
    });

    it("lists hunks in human-readable format", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      let out = gp("list");
      assert.match(out, /src\/app\.js/);
      assert.match(out, /\+.*Hi/);
      assert.match(out, /-.*Hello/);
    });

    it("outputs valid JSON with --json", () => {
      writeFile(
        "src/utils.js",
        [
          "function add(a, b) {",
          "  return a + b;",
          "}",
          "",
          "function multiply(a, b) {",
          "  return a * b;",
          "}",
          "",
          "module.exports = { add, multiply };",
          "",
        ].join("\n"),
      );

      let out = JSON.parse(gp("list --json"));
      assert.equal(out.type, "unstaged");
      assert.equal(out.files.length, 1);
      assert.equal(out.files[0].file, "src/utils.js");
      assert.ok(out.files[0].hunks.length > 0);
      assert.equal(out.files[0].hunks[0].id, 1);
    });

    it("lists staged hunks with --staged", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      gp("stage 1");
      let out = gp("list --staged");
      assert.match(out, /Staged changes/);
      assert.match(out, /src\/app\.js/);
    });

    it("filters by file path", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      writeFile(
        "src/utils.js",
        [
          "function add(a, b) {",
          "  return a + b + 0;",
          "}",
          "",
          "function subtract(a, b) {",
          "  return a - b;",
          "}",
          "",
          "module.exports = { add, subtract };",
          "",
        ].join("\n"),
      );

      let out = JSON.parse(gp("list --json -- src/utils.js"));
      assert.equal(out.files.length, 1);
      assert.equal(out.files[0].file, "src/utils.js");
    });
  });

  describe("stage", () => {
    it("stages a single hunk by ID", () => {
      // Use two separate files so each gets its own hunk
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      writeFile(
        "src/utils.js",
        [
          "function add(a, b) {",
          "  return a + b + 0;",
          "}",
          "",
          "function subtract(a, b) {",
          "  return a - b;",
          "}",
          "",
          "module.exports = { add, subtract };",
          "",
        ].join("\n"),
      );

      gp("stage 1");

      // Hunk 1 (app.js) staged, hunk 2 (utils.js) still unstaged
      let staged = JSON.parse(gp("list --staged --json"));
      let unstaged = JSON.parse(gp("list --json"));
      assert.equal(staged.files.length, 1);
      assert.equal(staged.files[0].hunks.length, 1);
      assert.equal(unstaged.files.length, 1);
      assert.equal(unstaged.files[0].hunks.length, 1);
    });

    it("stages multiple hunks across files", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      writeFile(
        "src/utils.js",
        [
          "function add(a, b) {",
          "  return a + b + 0;",
          "}",
          "",
          "function subtract(a, b) {",
          "  return a - b;",
          "}",
          "",
          "module.exports = { add, subtract };",
          "",
        ].join("\n"),
      );

      gp("stage 1,2");

      let staged = JSON.parse(gp("list --staged --json"));
      assert.equal(staged.files.length, 2);

      let unstaged = gp("list");
      assert.equal(unstaged, "No unstaged changes.");
    });

    it("stages a range of hunks", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "See ya, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      gp("stage 1-2");
      let unstaged = gp("list");
      assert.equal(unstaged, "No unstaged changes.");
    });

    it("stages --all", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "See ya, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      writeFile(
        "src/utils.js",
        [
          "function add(a, b) {",
          "  return a + b + 0;",
          "}",
          "",
          "function subtract(a, b) {",
          "  return a - b;",
          "}",
          "",
          "module.exports = { add, subtract };",
          "",
        ].join("\n"),
      );

      gp("stage --all");
      let unstaged = gp("list");
      assert.equal(unstaged, "No unstaged changes.");
    });

    it("stages hunks matching a regex", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "See ya, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      gp('stage --matching "See ya"');

      let staged = JSON.parse(gp("list --staged --json"));
      // Only the "See ya" hunk should be staged
      assert.equal(staged.files[0].hunks.length, 1);
      let content = staged.files[0].hunks[0].lines.map((l) => l.content).join("\n");
      assert.match(content, /See ya/);
    });
  });

  describe("unstage", () => {
    it("unstages a single hunk", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      gp("stage --all");
      gp("unstage 1");

      let staged = gp("list --staged");
      assert.equal(staged, "No staged changes.");

      let unstaged = JSON.parse(gp("list --json"));
      assert.equal(unstaged.files[0].hunks.length, 1);
    });

    it("unstages everything with --all", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      gp("stage --all");
      gp("unstage --all");

      let staged = gp("list --staged");
      assert.equal(staged, "No staged changes.");
    });
  });

  describe("line-level selection", () => {
    it("stages specific lines within a hunk", () => {
      // Create a hunk with multiple change lines
      writeFile(
        "src/utils.js",
        [
          "function add(a, b) {",
          "  return a + b;",
          "}",
          "",
          "function multiply(a, b) {",
          "  return a * b;",
          "}",
          "",
          "function divide(a, b) {",
          "  return a / b;",
          "}",
          "",
          "module.exports = { add, multiply, divide };",
          "",
        ].join("\n"),
      );

      // List to see what we have
      let pre = JSON.parse(gp("list --json"));
      let hunk = pre.files[0].hunks.find((h) =>
        h.lines.some((l) => l.content.includes("multiply")),
      );
      assert.ok(hunk, "should find the hunk with multiply");

      // Stage only the first change line of that hunk
      gp(`stage ${hunk.id}:1`);

      let staged = JSON.parse(gp("list --staged --json"));
      assert.ok(staged.files.length > 0);
    });

    it("round-trips: stage lines then unstage them", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      // Stage just the added line (line 2 of hunk — the +Hi line)
      gp("stage 1:2");
      let staged = JSON.parse(gp("list --staged --json"));
      assert.ok(staged.files.length > 0);

      // Unstage it
      gp("unstage --all");
      let after = gp("list --staged");
      assert.equal(after, "No staged changes.");
    });
  });

  describe("discard", () => {
    it("refuses without --yes", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      assert.throws(() => gp("discard 1"), /destructive/i);
    });

    it("shows patch with --dry-run", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      let out = gp("discard 1 --dry-run");
      assert.match(out, /Dry run/);
      assert.match(out, /diff --git/);
    });

    it("discards a hunk from the working tree", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      gp("discard 1 --yes");

      // The greet change should be gone
      let content = readFile("src/app.js");
      assert.match(content, /Hello/);
      assert.doesNotMatch(content, /Hi/);
    });
  });

  describe("status", () => {
    it("shows summary of staged and unstaged", () => {
      // Change one file (staged) and another (unstaged)
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      writeFile(
        "src/utils.js",
        [
          "function add(a, b) {",
          "  return a + b + 0;",
          "}",
          "",
          "function subtract(a, b) {",
          "  return a - b;",
          "}",
          "",
          "module.exports = { add, subtract };",
          "",
        ].join("\n"),
      );

      // Stage only app.js hunk
      gp("stage 1");

      let out = gp("status");
      assert.match(out, /Staged:.*1 hunk/);
      assert.match(out, /Unstaged:.*1 hunk/);
    });

    it("outputs JSON with --json", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "Goodbye, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      let out = JSON.parse(gp("status --json"));
      assert.equal(out.unstaged.hunks, 1);
      assert.equal(out.unstaged.files, 1);
      assert.equal(out.staged.hunks, 0);
    });
  });

  describe("full workflow", () => {
    it("stage subset → commit → stage rest → commit", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hi, " + name;',
          "}",
          "",
          "function farewell(name) {",
          '  return "See ya, " + name;',
          "}",
          "",
          "module.exports = { greet, farewell };",
          "",
        ].join("\n"),
      );

      writeFile(
        "src/utils.js",
        [
          "function add(a, b) {",
          "  return a + b + 0;",
          "}",
          "",
          "function subtract(a, b) {",
          "  return a - b;",
          "}",
          "",
          "module.exports = { add, subtract };",
          "",
        ].join("\n"),
      );

      // Stage only the greeting changes
      gp('stage --matching "Hi"');
      git('commit -m "update greet"');

      // Stage the rest
      gp("stage --all");
      git('commit -m "update farewell and utils"');

      // Everything should be clean
      let out = gp("list");
      assert.equal(out, "No unstaged changes.");

      let staged = gp("list --staged");
      assert.equal(staged, "No staged changes.");
    });
  });
});
