import { parseDiff } from "../diff-parser.js";
import { applyPatch, getDiff } from "../git.js";
import { buildPatchFromHunks, buildPatchFromLines } from "../patch-builder.js";
import { parseSelector } from "../selector.js";

export function run({
  selector,
  all = false,
  matching = null,
  yes = false,
  dryRun = false,
  files = [],
} = {}) {
  if (!yes && !dryRun) {
    console.error("Discard is destructive. Use --yes to confirm or --dry-run to preview.");
    process.exit(1);
  }

  let raw = getDiff({ staged: false, files });
  let fileDiffs = parseDiff(raw);

  if (fileDiffs.length === 0) {
    console.log("No unstaged changes to discard.");
    return;
  }

  let patch;

  if (all) {
    let allIds = fileDiffs.flatMap((f) => f.hunks.map((h) => h.id));
    patch = buildPatchFromHunks(fileDiffs, allIds);
  } else if (matching) {
    let regex = new RegExp(matching);
    let matchedIds = [];
    for (let file of fileDiffs) {
      for (let hunk of file.hunks) {
        let hasMatch = hunk.lines.some(
          (l) => (l.type === "added" || l.type === "removed") && regex.test(l.content),
        );
        if (hasMatch) matchedIds.push(hunk.id);
      }
    }
    if (matchedIds.length === 0) {
      console.log(`No hunks matching /${matching}/.`);
      return;
    }
    patch = buildPatchFromHunks(fileDiffs, matchedIds);
  } else {
    let sel = parseSelector(selector);
    if (sel.type === "lines") {
      patch = buildPatchFromLines(fileDiffs, sel.hunkId, sel.lines, "discard");
    } else {
      patch = buildPatchFromHunks(fileDiffs, sel.ids);
    }
  }

  if (dryRun) {
    console.log("Dry run — patch that would be applied (reversed):\n");
    console.log(patch);
    return;
  }

  applyPatch(patch, { reverse: true });
  console.log("Discarded successfully.");
}
