import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDiff } from "../lib/diff-parser.js";
import { getRoot } from "../lib/git.js";
import { buildPatchFromHunks, buildPatchFromLines } from "../lib/patch-builder.js";
import { parseSelector } from "../lib/selector.js";

describe("coverage edges", () => {
  it("parses diffs with ignorable and malformed hunk markers", () => {
    let raw = [
      "diff --git a/src/a.js b/src/a.js",
      "index 1111111..2222222 100644",
      "--- a/src/a.js",
      "+++ b/src/a.js",
      "garbage before hunk",
      "@@ not-a-real-hunk @@",
      "interstitial non-hunk line",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "garbage after hunk",
      "",
    ].join("\n");

    let files = parseDiff(raw);
    assert.equal(files.length, 1);
    assert.equal(files[0].hunks.length, 1);
    assert.equal(files[0].hunks[0].addedCount, 1);
    assert.equal(files[0].hunks[0].removedCount, 1);
  });

  it("builds headers from fallback file paths when metadata is absent", () => {
    let patch = buildPatchFromHunks(
      [
        {
          file: "demo.txt",
          metadataLines: [],
          hunks: [
            {
              id: 7,
              header: "@@ -1 +1 @@",
              lines: [{ content: "-a" }, { content: "+b" }],
            },
          ],
        },
      ],
      [7],
    );

    assert.match(patch, /diff --git a\/demo\.txt b\/demo\.txt/);
    assert.match(patch, /--- a\/demo\.txt/);
    assert.match(patch, /\+\+\+ b\/demo\.txt/);
  });

  it("throws for invalid line-range selectors", () => {
    assert.throws(() => parseSelector("1:1-a"), /Invalid range: 1-a/);
  });

  it("throws for mixed hunk and line selectors", () => {
    assert.throws(() => parseSelector("1,2:3"), /Invalid hunk ID: 1,2/);
  });

  it("throws for partially numeric selector tokens", () => {
    assert.throws(() => parseSelector("1x"), /Invalid number: 1x/);
    assert.throws(() => parseSelector("1-2x"), /Invalid range: 1-2x/);
    assert.throws(() => parseSelector("1:2,3x"), /Invalid number: 3x/);
  });

  it("throws for empty selector segments and descending ranges", () => {
    assert.throws(() => parseSelector("1,,2"), /Invalid number: /);
    assert.throws(() => parseSelector("3-1"), /Invalid range: 3-1/);
  });

  it("finds line-level hunks across multiple files", () => {
    let patch = buildPatchFromLines(
      [
        {
          file: "first.txt",
          hunks: [
            {
              id: 1,
              oldStart: 1,
              newStart: 1,
              context: null,
              lines: [{ type: "context", content: " keep", oldLine: 1, newLine: 1 }],
            },
          ],
        },
        {
          file: "second.txt",
          hunks: [
            {
              id: 2,
              oldStart: 1,
              newStart: 1,
              context: null,
              lines: [
                { type: "removed", content: "-old", oldLine: 1, newLine: null },
                { type: "added", content: "+new", oldLine: null, newLine: 1 },
              ],
            },
          ],
        },
      ],
      2,
      [1],
    );

    assert.match(patch, /diff --git a\/second\.txt b\/second\.txt/);
  });

  it("throws when line-level hunk ID is missing", () => {
    assert.throws(
      () =>
        buildPatchFromLines(
          [
            {
              file: "only.txt",
              hunks: [
                {
                  id: 1,
                  oldStart: 1,
                  newStart: 1,
                  context: null,
                  lines: [{ type: "added", content: "+x", oldLine: null, newLine: 1 }],
                },
              ],
            },
          ],
          999,
          [1],
        ),
      /Hunk 999 not found/,
    );
  });

  it("returns the current git root", () => {
    let root = getRoot();
    assert.equal(root, process.cwd());
  });
});
