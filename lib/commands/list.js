import { getDiff } from "../git.js";
import { parseDiff } from "../diff-parser.js";

export function run({ json = false, staged = false, files = [] } = {}) {
  let raw = getDiff({ staged, files });
  let fileDiffs = parseDiff(raw);

  if (json) {
    let output = {
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
      let range = `${file.file}:${hunk.oldStart}-${hunk.oldStart + Math.max(hunk.oldCount, hunk.newCount) - 1}`;
      let counts = `(+${hunk.addedCount} -${hunk.removedCount})`;
      let ctx = hunk.context ? `  ${hunk.context}` : "";
      console.log(`  ${hunk.id}  ${range}  ${counts}${ctx}`);

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
