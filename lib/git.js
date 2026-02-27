import { execSync } from "node:child_process";

function exec(cmd, opts = {}) {
  return execSync(cmd, {
    encoding: "utf-8",
    maxBuffer: 50 * 1024 * 1024,
    ...opts,
  });
}

export function getDiff({ staged = false, files = [] } = {}) {
  let args = ["git", "diff"];
  if (staged) args.push("--cached");
  // Full diff context isn't needed — default 3-line context is fine
  if (files.length > 0) {
    args.push("--");
    args.push(...files);
  }
  return exec(args.join(" "));
}

export function applyPatch(patch, { cached = false, reverse = false } = {}) {
  let args = ["git", "apply"];
  if (cached) args.push("--cached");
  if (reverse) args.push("--reverse");
  args.push("-");

  return execSync(args.join(" "), {
    input: patch,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
  });
}

export function getStatus() {
  return exec("git status --porcelain");
}

export function getRoot() {
  return exec("git rev-parse --show-toplevel").trim();
}
