/**
 * Reconstruct valid unified diff patches from hunk/line selections.
 */

/**
 * Build a patch containing only the specified hunks.
 */
export function buildPatchFromHunks(fileDiffs, hunkIds) {
  let idSet = new Set(hunkIds);
  let patches = [];

  for (let file of fileDiffs) {
    let selectedHunks = file.hunks.filter((h) => idSet.has(h.id));
    if (selectedHunks.length === 0) continue;

    let header = buildFileHeader(file);
    let body = selectedHunks.map((h) => formatHunk(h)).join("\n");
    patches.push(`${header}\n${body}`);
  }

  return `${patches.join("\n")}\n`;
}

/**
 * Build a patch for a single hunk with only selected change lines.
 *
 * changeLineIndices: 1-based indices into the hunk's change lines
 * (only +/- lines, context excluded from numbering).
 *
 * mode: "stage" | "discard" — controls how unselected lines are treated:
 *   stage:   unselected `-` → context, unselected `+` → dropped
 *   discard: same behavior (patch is applied with --reverse externally)
 */
export function buildPatchFromLines(fileDiffs, hunkId, changeLineIndices, _mode = "stage") {
  let selectedSet = new Set(changeLineIndices);
  let hunk = null;
  let parentFile = null;

  for (let file of fileDiffs) {
    for (let h of file.hunks) {
      if (h.id === hunkId) {
        hunk = h;
        parentFile = file;
        break;
      }
    }
    if (hunk) break;
  }

  if (!hunk) throw new Error(`Hunk ${hunkId} not found`);

  // Number only the change lines (added/removed)
  let changeIndex = 0;
  let newLines = [];

  for (let line of hunk.lines) {
    if (line.type === "context" || line.type === "no-newline") {
      newLines.push(line);
      continue;
    }

    changeIndex++;
    let isSelected = selectedSet.has(changeIndex);

    if (isSelected) {
      newLines.push(line);
    } else {
      // Unselected `-` lines become context
      if (line.type === "removed") {
        newLines.push({
          ...line,
          type: "context",
          content: ` ${line.content.slice(1)}`,
        });
      }
      // Unselected `+` lines are dropped entirely
    }
  }

  // Recalculate counts
  let oldCount = 0;
  let newCount = 0;
  for (let line of newLines) {
    if (line.type === "context") {
      oldCount++;
      newCount++;
    } else if (line.type === "removed") {
      oldCount++;
    } else if (line.type === "added") {
      newCount++;
    }
  }

  let newHeader = `@@ -${hunk.oldStart},${oldCount} +${hunk.newStart},${newCount} @@`;
  if (hunk.context) newHeader += ` ${hunk.context}`;

  let header = buildFileHeader(parentFile);
  let body = `${newHeader}\n${newLines.map((l) => l.content).join("\n")}`;
  return `${header}\n${body}\n`;
}

function buildFileHeader(file) {
  let diffOldFile = file.diffOldFile || `a/${file.file}`;
  let diffNewFile = file.diffNewFile || `b/${file.file}`;
  let oldFile = file.oldFile || diffOldFile;
  let newFile = file.newFile || diffNewFile;
  let headerLines = [`diff --git ${diffOldFile} ${diffNewFile}`];
  if (Array.isArray(file.metadataLines) && file.metadataLines.length > 0) {
    headerLines.push(...file.metadataLines);
  }
  headerLines.push(`--- ${oldFile}`, `+++ ${newFile}`);
  return headerLines.join("\n");
}

function formatHunk(hunk) {
  let lines = hunk.lines.map((l) => l.content).join("\n");
  return `${hunk.header}\n${lines}`;
}
