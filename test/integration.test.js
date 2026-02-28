import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

function gpResult(args, opts = {}) {
  try {
    let stdout = execSync(`node ${bin} ${args}`, {
      cwd: tmp,
      encoding: "utf-8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "Test",
        GIT_AUTHOR_EMAIL: "test@test.com",
        GIT_COMMITTER_NAME: "Test",
        GIT_COMMITTER_EMAIL: "test@test.com",
      },
      stdio: ["pipe", "pipe", "pipe"],
      ...opts,
    }).trim();
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return {
      status: error.status ?? 1,
      stdout: String(error.stdout || "").trim(),
      stderr: String(error.stderr || "").trim(),
    };
  }
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
    git("reset --hard HEAD");
    git("clean -fd");
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

    it("lists only hunk headers with --summary", () => {
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

      let out = gp("list --summary");
      assert.match(out, /Unstaged changes/);
      assert.match(out, /src\/app\.js/);
      assert.doesNotMatch(out, /return "Hi, "/);
      assert.doesNotMatch(out, /return "Hello, "/);
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

    it("outputs hunk summaries with --json --summary", () => {
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

      let out = JSON.parse(gp("list --json --summary"));
      assert.equal(out.type, "unstaged");
      assert.equal(out.hunks.length, 1);
      assert.equal(out.hunks[0].id, 1);
      assert.equal(out.hunks[0].file, "src/app.js");
      assert.equal(out.hunks[0].addedCount, 1);
      assert.equal(out.hunks[0].removedCount, 1);
      assert.ok(out.hunks[0].range.startsWith("src/app.js:"));
      assert.equal(out.hunks[0].oldRange.start, 1);
      assert.equal(out.hunks[0].newRange.start, 1);
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

    it("summarizes a newly added file with zero old range", () => {
      writeFile("src/new-summary.js", "module.exports = 1;\n");
      git("add src/new-summary.js");

      let out = JSON.parse(gp("list --staged --json --summary"));
      let hunk = out.hunks.find((h) => h.file === "src/new-summary.js");
      assert.ok(hunk);
      assert.equal(hunk.oldRange.count, 0);
      assert.equal(hunk.oldRange.end, 0);
    });

    it("summarizes a deleted file with zero new range", () => {
      rmSync(join(tmp, "src/utils.js"));

      let out = JSON.parse(gp("list --json --summary"));
      let hunk = out.hunks.find((h) => h.file === "src/utils.js");
      assert.ok(hunk);
      assert.equal(hunk.newRange.count, 0);
      assert.equal(hunk.newRange.end, 0);
    });

    it("prints hunk context when git provides it", () => {
      let fakeBin = join(tmp, "fake-bin");
      mkdirSync(fakeBin, { recursive: true });

      let fakeGit = join(fakeBin, "git");
      writeFileSync(
        fakeGit,
        [
          "#!/bin/sh",
          'if [ \"$1\" = \"diff\" ]; then',
          "cat <<'EOF'",
          "diff --git a/demo.js b/demo.js",
          "index 1111111..2222222 100644",
          "--- a/demo.js",
          "+++ b/demo.js",
          "@@ -1 +1 @@ function demo()",
          "-old",
          "+new",
          "EOF",
          "exit 0",
          "fi",
          'echo \"unsupported command\" >&2',
          "exit 1",
          "",
        ].join("\n"),
      );
      chmodSync(fakeGit, 0o755);

      let out = gp("list", {
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH}`,
        },
      });
      assert.match(out, /function demo\(\)/);
    });
  });

  describe("cli", () => {
    it("shows usage for --help", () => {
      let out = gp("--help");
      assert.match(out, /Usage:/);
      assert.match(out, /Selectors:/);
    });

    it("fails with usage for unknown command", () => {
      let result = gpResult("nope");
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Unknown command: nope/);
      assert.match(result.stdout, /Usage:/);
    });

    it("fails with parse error for unknown flags", () => {
      let result = gpResult("list --wat");
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Unknown option '--wat'/);
    });

    it("fails when selector is missing", () => {
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

      let result = gpResult("stage");
      assert.equal(result.status, 1);
      assert.match(result.stderr, /No selector provided/);
    });

    it("fails on invalid selector", () => {
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

      let result = gpResult("stage abc");
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Invalid number: abc/);
    });

    it("fails on invalid line-level hunk ID", () => {
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

      let result = gpResult("stage x:1");
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Invalid hunk ID: x/);
    });

    it("fails on invalid selector range", () => {
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

      let result = gpResult("stage 1-a");
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Invalid range: 1-a/);
    });
  });

  describe("stage", () => {
    it("reports when there are no unstaged changes", () => {
      let out = gp("stage --all");
      assert.equal(out, "No unstaged changes to stage.");
    });

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

    it("reports when --matching finds nothing", () => {
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

      let out = gp('stage --matching "definitely-no-match"');
      assert.equal(out, "No hunks matching /definitely-no-match/.");
    });

    it("parses no-newline markers without crashing", () => {
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
        ].join("\n"),
      );

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
        ].join("\n"),
      );

      gp("stage 1");
      let staged = gp("list --staged");
      assert.match(staged, /src\/app\.js/);
    });

    it("stages file deletions without creating dev/null in index", () => {
      rmSync(join(tmp, "src/utils.js"));

      gp("stage --all");

      let stagedNames = git("diff --cached --name-status");
      assert.equal(stagedNames, "D\tsrc/utils.js");
      assert.doesNotMatch(stagedNames, /dev\/null/);
    });
  });

  describe("unstage", () => {
    it("reports when there are no staged changes", () => {
      let out = gp("unstage --all");
      assert.equal(out, "No staged changes to unstage.");
    });

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

    it("unstages hunks matching a regex", () => {
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

      gp("stage --all");
      let out = gp('unstage --matching "See ya"');
      assert.equal(out, "Unstaging 1 hunk(s) matching /See ya/");
    });

    it("reports when unstage --matching finds nothing", () => {
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

      gp("stage --all");
      let out = gp('unstage --matching "definitely-no-match"');
      assert.equal(out, "No staged hunks matching /definitely-no-match/.");
    });

    it("unstages specific lines within a hunk", () => {
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

      gp("stage 1:2");
      let out = gp("unstage 1:1");
      assert.equal(out, "Unstaged successfully.");

      let staged = gp("list --staged");
      assert.equal(staged, "No staged changes.");
    });

    it("unstages newly-added files without creating dev/null in index", () => {
      writeFile("src/new-file.js", 'module.exports = "new";\n');
      git("add src/new-file.js");

      gp("unstage --all");

      let stagedNames = git("diff --cached --name-status");
      let porcelain = git("status --porcelain");
      assert.equal(stagedNames, "");
      assert.match(porcelain, /\?\? src\/new-file\.js/);
      assert.doesNotMatch(porcelain, /dev\/null/);

      rmSync(join(tmp, "src/new-file.js"), { force: true });
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

    it("reports when there is nothing to discard", () => {
      let out = gp("discard --all --yes");
      assert.equal(out, "No unstaged changes to discard.");
    });

    it("discards all changes with --all --yes", () => {
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

      gp("discard --all --yes");
      let out = gp("list");
      assert.equal(out, "No unstaged changes.");
    });

    it("discards hunks matching a regex", () => {
      writeFile(
        "src/app.js",
        [
          "function greet(name) {",
          '  return "Hello, " + name;',
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

      gp('discard --matching "See ya" --yes');
      let content = readFile("src/app.js");
      assert.match(content, /Goodbye/);
      assert.match(content, /Hello/);
    });

    it("reports when discard --matching finds nothing", () => {
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

      let out = gp('discard --matching "definitely-no-match" --yes');
      assert.equal(out, "No hunks matching /definitely-no-match/.");
    });

    it("discards specific lines within a hunk", () => {
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

      let out = gp("discard 1:2 --dry-run");
      assert.match(out, /Dry run/);
      assert.match(out, /@@/);
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

    it("lists untracked files in per-file output", () => {
      writeFile("src/untracked.js", "module.exports = 1;\n");
      let out = gp("status");
      assert.match(out, /src\/untracked\.js\s+untracked/);
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
