/**
 * Parse unified diff output into structured hunk objects.
 *
 * Input:  raw string from `git diff` or `git diff --cached`
 * Output: array of FileDiff objects with globally-numbered hunks
 */

let hunkIdCounter = 0;

function resetHunkIds() {
  hunkIdCounter = 0;
}

function nextHunkId() {
  return ++hunkIdCounter;
}

function parseHunkHeader(line) {
  // @@ -old,count +new,count @@ optional context
  let match = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/);
  if (!match) return null;

  return {
    oldStart: parseInt(match[1], 10),
    oldCount: match[2] != null ? parseInt(match[2], 10) : 1,
    newStart: parseInt(match[3], 10),
    newCount: match[4] != null ? parseInt(match[4], 10) : 1,
    context: match[5].trim() || null,
    raw: line,
  };
}

function classifyLine(raw) {
  if (raw.startsWith("+")) return "added";
  if (raw.startsWith("-")) return "removed";
  if (raw.startsWith("\\")) return "no-newline";
  return "context";
}

function parseFileDiff(chunk) {
  let lines = chunk.split("\n");
  let file = null;
  let diffOldFile = null;
  let diffNewFile = null;
  let oldFile = null;
  let newFile = null;
  let metadataLines = [];
  let hunks = [];
  let i = 0;

  // Parse file header lines
  while (i < lines.length) {
    let line = lines[i];
    if (line.startsWith("diff --git")) {
      let match = line.match(/^diff --git a\/(.+) b\/(.+)$/);
      if (match) {
        diffOldFile = `a/${match[1]}`;
        diffNewFile = `b/${match[2]}`;
        oldFile = diffOldFile;
        newFile = diffNewFile;
        file = match[2];
      }
      i++;
      continue;
    }
    if (
      line.startsWith("index ") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("copy from") ||
      line.startsWith("copy to") ||
      line.startsWith("Binary files")
    ) {
      metadataLines.push(line);
      i++;
      continue;
    }
    if (line.startsWith("--- ")) {
      oldFile = line.slice(4);
      i++;
      continue;
    }
    if (line.startsWith("+++ ")) {
      newFile = line.slice(4);
      if (newFile.startsWith("b/")) {
        file = newFile.slice(2);
      }
      i++;
      continue;
    }
    if (line.startsWith("@@")) {
      break;
    }
    i++;
  }

  // Parse hunks
  while (i < lines.length) {
    let line = lines[i];
    if (!line.startsWith("@@")) {
      i++;
      continue;
    }

    let header = parseHunkHeader(line);
    if (!header) {
      i++;
      continue;
    }

    let hunkLines = [];
    let oldLine = header.oldStart;
    let newLine = header.newStart;
    let addedCount = 0;
    let removedCount = 0;
    i++;

    while (i < lines.length && !lines[i].startsWith("@@")) {
      let raw = lines[i];
      // Skip empty lines at the very end
      if (raw === "" && i === lines.length - 1) {
        i++;
        continue;
      }
      let type = classifyLine(raw);

      if (type === "no-newline") {
        hunkLines.push({ type, content: raw, oldLine: null, newLine: null });
        i++;
        continue;
      }

      let entry = {
        type,
        content: raw,
        oldLine: null,
        newLine: null,
      };

      if (type === "context") {
        entry.oldLine = oldLine++;
        entry.newLine = newLine++;
      } else if (type === "removed") {
        entry.oldLine = oldLine++;
        removedCount++;
      } else if (type === "added") {
        entry.newLine = newLine++;
        addedCount++;
      }

      hunkLines.push(entry);
      i++;
    }

    hunks.push({
      id: nextHunkId(),
      header: header.raw,
      oldStart: header.oldStart,
      oldCount: header.oldCount,
      newStart: header.newStart,
      newCount: header.newCount,
      context: header.context,
      lines: hunkLines,
      addedCount,
      removedCount,
    });
  }

  return { file, diffOldFile, diffNewFile, oldFile, newFile, metadataLines, hunks };
}

export function parseDiff(raw) {
  if (!raw || !raw.trim()) return [];

  resetHunkIds();

  // Split on `diff --git` boundaries, keeping the delimiter
  let chunks = raw.split(/^(?=diff --git )/m).filter((c) => c.trim());

  return chunks.map(parseFileDiff).filter((f) => f.file && f.hunks.length > 0);
}
