import { parseDiff } from "../diff-parser.js";
import { getDiff } from "../git.js";

function formatDisplayRange(file, hunk) {
  let span = Math.max(hunk.oldCount, hunk.newCount, 1);
  let start = hunk.oldStart > 0 ? hunk.oldStart : hunk.newStart;
  let end = start + span - 1;
  return `${file.file}:${start}-${end}`;
}

function summarizeHunks(fileDiffs) {
  let hunks = [];

  for (let file of fileDiffs) {
    for (let hunk of file.hunks) {
      let oldEnd = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart + hunk.oldCount - 1;
      let newEnd = hunk.newCount === 0 ? hunk.newStart : hunk.newStart + hunk.newCount - 1;

      hunks.push({
        id: hunk.id,
        file: file.file,
        range: formatDisplayRange(file, hunk),
        oldRange: {
          start: hunk.oldStart,
          end: oldEnd,
          count: hunk.oldCount,
        },
        newRange: {
          start: hunk.newStart,
          end: newEnd,
          count: hunk.newCount,
        },
        addedCount: hunk.addedCount,
        removedCount: hunk.removedCount,
        context: hunk.context,
      });
    }
  }

  return hunks;
}

export function run({ json = false, staged = false, files = [], summary = false } = {}) {
  let raw = getDiff({ staged, files });
  let fileDiffs = parseDiff(raw);

  if (json) {
    let output = summary
      ? {
          type: staged ? "staged" : "unstaged",
          hunks: summarizeHunks(fileDiffs),
        }
      : {
          type: staged ? "staged" : "unstaged",
          files: fileDiffs,
        };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  if (fileDiffs.length === 0) {
    console.log(staged ? "No staged changes." : "No unstaged changes.");
    return;
  }

  console.log(staged ? "Staged changes:\n" : "Unstaged changes:\n");

  for (let file of fileDiffs) {
    for (let hunk of file.hunks) {
      let range = formatDisplayRange(file, hunk);
      let counts = `(+${hunk.addedCount} -${hunk.removedCount})`;
      let ctx = hunk.context ? `  ${hunk.context}` : "";
      console.log(`  ${hunk.id}  ${range}  ${counts}${ctx}`);

      if (summary) {
        continue;
      }

      // Show only change lines with their line indices
      let changeIndex = 0;
      for (let line of hunk.lines) {
        if (line.type === "added" || line.type === "removed") {
          changeIndex++;
          console.log(`     ${String(changeIndex).padStart(3)}  ${line.content}`);
        }
      }
      console.log();
    }
  }
}
