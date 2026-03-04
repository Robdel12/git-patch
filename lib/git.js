import { execFileSync } from "node:child_process";

function execGit(args, opts = {}) {
  return execFileSync("git", args, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    ...opts,
  });
}

function execGitAllowStatus(args, allowedStatuses = [0], opts = {}) {
  try {
    return execGit(args, opts);
  } catch (error) {
    if (allowedStatuses.includes(error.status)) {
      return String(error.stdout || "");
    }
    throw error;
  }
}

function getUntrackedFiles(files) {
  let args = ["ls-files", "--others", "--exclude-standard"];
  if (files.length > 0) {
    args.push("--");
    args.push(...files);
  }

  return execGit(args)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function getUntrackedDiff(files) {
  let patches = [];

  for (let file of getUntrackedFiles(files)) {
    let patch = execGitAllowStatus(["diff", "--no-index", "--", "/dev/null", file], [0, 1]).trim();
    if (patch) patches.push(patch);
  }

  if (patches.length === 0) return "";
  return `${patches.join("\n")}\n`;
}

export function getDiff({ staged = false, files = [], includeUntracked = false } = {}) {
  let args = ["diff"];
  if (staged) args.push("--cached");
  if (files.length > 0) {
    args.push("--");
    args.push(...files);
  }
  let trackedDiff = execGit(args);

  if (!includeUntracked || staged) {
    return trackedDiff;
  }

  let untrackedDiff = getUntrackedDiff(files);
  if (!untrackedDiff) return trackedDiff;
  if (!trackedDiff.trim()) return untrackedDiff;

  return `${trackedDiff.trim()}\n${untrackedDiff}`;
}

export function applyPatch(patch, { cached = false, reverse = false } = {}) {
  let args = ["apply"];
  if (cached) args.push("--cached");
  if (reverse) args.push("--reverse");
  args.push("-");

  return execGit(args, {
    input: patch,
  });
}

export function getStatus() {
  return execGit(["status", "--porcelain"]);
}

export function getRoot() {
  return execGit(["rev-parse", "--show-toplevel"]).trim();
}
