#!/usr/bin/env node

import { parseArgs } from "node:util";

let command = process.argv[2];
// Everything after the command is that command's argv
let commandArgv = process.argv.slice(3);

function usage() {
  console.log(`git-patch — Non-interactive hunk staging for LLMs

Usage:
  git-patch list [--json] [--staged] [-- files...]
  git-patch stage <selector> [--all] [--matching <regex>] [-- files...]
  git-patch unstage <selector> [--all] [--matching <regex>]
  git-patch discard <selector> [--all] [--matching <regex>] [--yes] [--dry-run] [-- files...]
  git-patch status [--json]

Selectors:
  1            Single hunk by ID
  1,3,5        Multiple hunk IDs
  1-5          Range of hunk IDs
  1:2-4        Lines 2-4 within hunk 1 (change lines only)
  1:3,5,8      Specific lines within hunk 1`);
}

// Split args on `--` to separate flags from file paths
function splitOnDash(argv) {
  let dashIdx = argv.indexOf("--");
  if (dashIdx === -1) return { args: argv, files: [] };
  return { args: argv.slice(0, dashIdx), files: argv.slice(dashIdx + 1) };
}

try {
  switch (command) {
    case "list": {
      let { args, files } = splitOnDash(commandArgv);
      let { values } = parseArgs({
        args,
        options: {
          json: { type: "boolean", default: false },
          staged: { type: "boolean", default: false },
        },
        strict: true,
      });
      let { run } = await import("../lib/commands/list.js");
      run({ json: values.json, staged: values.staged, files });
      break;
    }

    case "stage": {
      let { args, files } = splitOnDash(commandArgv);
      let { values, positionals } = parseArgs({
        args,
        options: {
          all: { type: "boolean", default: false },
          matching: { type: "string" },
        },
        allowPositionals: true,
        strict: true,
      });
      let { run } = await import("../lib/commands/stage.js");
      run({
        selector: positionals[0],
        all: values.all,
        matching: values.matching,
        files,
      });
      break;
    }

    case "unstage": {
      let { args } = splitOnDash(commandArgv);
      let { values, positionals } = parseArgs({
        args,
        options: {
          all: { type: "boolean", default: false },
          matching: { type: "string" },
        },
        allowPositionals: true,
        strict: true,
      });
      let { run } = await import("../lib/commands/unstage.js");
      run({
        selector: positionals[0],
        all: values.all,
        matching: values.matching,
      });
      break;
    }

    case "discard": {
      let { args, files } = splitOnDash(commandArgv);
      let { values, positionals } = parseArgs({
        args,
        options: {
          all: { type: "boolean", default: false },
          matching: { type: "string" },
          yes: { type: "boolean", default: false },
          "dry-run": { type: "boolean", default: false },
        },
        allowPositionals: true,
        strict: true,
      });
      let { run } = await import("../lib/commands/discard.js");
      run({
        selector: positionals[0],
        all: values.all,
        matching: values.matching,
        yes: values.yes,
        dryRun: values["dry-run"],
        files,
      });
      break;
    }

    case "status": {
      let { values } = parseArgs({
        args: commandArgv,
        options: {
          json: { type: "boolean", default: false },
        },
        strict: true,
      });
      let { run } = await import("../lib/commands/status.js");
      run({ json: values.json });
      break;
    }

    case "--help":
    case "-h":
    case undefined:
      usage();
      break;

    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
