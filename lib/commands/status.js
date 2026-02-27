import { getDiff, getStatus } from "../git.js";
import { parseDiff } from "../diff-parser.js";

export function run({ json = false } = {}) {
  let stagedDiff = getDiff({ staged: true });
  let unstagedDiff = getDiff({ staged: false });
  let porcelain = getStatus();

  let stagedFiles = parseDiff(stagedDiff);
  let unstagedFiles = parseDiff(unstagedDiff);

  // Count untracked files from porcelain
  let untrackedFiles = porcelain
    .split("\n")
    .filter((l) => l.startsWith("??"))
    .map((l) => l.slice(3));

  let stagedHunkCount = stagedFiles.reduce((n, f) => n + f.hunks.length, 0);
  let unstagedHunkCount = unstagedFiles.reduce((n, f) => n + f.hunks.length, 0);

  if (json) {
    console.log(
      JSON.stringify(
        {
          staged: { files: stagedFiles.length, hunks: stagedHunkCount },
          unstaged: { files: unstagedFiles.length, hunks: unstagedHunkCount },
          untracked: untrackedFiles,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(
    `Staged:     ${stagedHunkCount} hunk(s) across ${stagedFiles.length} file(s)`,
  );
  console.log(
    `Unstaged:   ${unstagedHunkCount} hunk(s) across ${unstagedFiles.length} file(s)`,
  );
  console.log(`Untracked:  ${untrackedFiles.length} file(s)`);

  // Per-file breakdown
  let allPaths = new Set([
    ...stagedFiles.map((f) => f.file),
    ...unstagedFiles.map((f) => f.file),
    ...untrackedFiles,
  ]);

  if (allPaths.size > 0) console.log();

  let stagedByFile = new Map(stagedFiles.map((f) => [f.file, f.hunks.length]));
  let unstagedByFile = new Map(
    unstagedFiles.map((f) => [f.file, f.hunks.length]),
  );

  for (let path of [...allPaths].sort()) {
    let s = stagedByFile.get(path) || 0;
    let u = unstagedByFile.get(path) || 0;
    let isUntracked = untrackedFiles.includes(path);

    if (isUntracked) {
      console.log(`  ${path}    untracked`);
    } else {
      let parts = [];
      if (s > 0) parts.push(`${s} staged`);
      if (u > 0) parts.push(`${u} unstaged`);
      console.log(`  ${path}    ${parts.join(", ")}`);
    }
  }
}
