import { getDiff, applyPatch } from "../git.js";
import { parseDiff } from "../diff-parser.js";
import { buildPatchFromHunks, buildPatchFromLines } from "../patch-builder.js";
import { parseSelector } from "../selector.js";

export function run({ selector, all = false, matching = null } = {}) {
  let raw = getDiff({ staged: true });
  let fileDiffs = parseDiff(raw);

  if (fileDiffs.length === 0) {
    console.log("No staged changes to unstage.");
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
      console.log(`No staged hunks matching /${matching}/.`);
      return;
    }
    patch = buildPatchFromHunks(fileDiffs, matchedIds);
    console.log(`Unstaging ${matchedIds.length} hunk(s) matching /${matching}/`);
  } else {
    let sel = parseSelector(selector);
    if (sel.type === "lines") {
      patch = buildPatchFromLines(fileDiffs, sel.hunkId, sel.lines, "stage");
    } else {
      patch = buildPatchFromHunks(fileDiffs, sel.ids);
    }
  }

  applyPatch(patch, { cached: true, reverse: true });

  if (!matching) {
    console.log("Unstaged successfully.");
  }
}
