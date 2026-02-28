/**
 * Parse hunk/line selector strings.
 *
 * Formats:
 *   "1"         -> { type: "hunks", ids: [1] }
 *   "1,3,5"     -> { type: "hunks", ids: [1,3,5] }
 *   "1-5"       -> { type: "hunks", ids: [1,2,3,4,5] }
 *   "1-3,7,9"   -> { type: "hunks", ids: [1,2,3,7,9] }
 *   "1:2-4"     -> { type: "lines", hunkId: 1, lines: [2,3,4] }
 *   "1:3,5,8"   -> { type: "lines", hunkId: 1, lines: [3,5,8] }
 */
export function parseSelector(str) {
  if (!str) throw new Error("No selector provided");

  // Line-level: "hunkId:lineSpec"
  if (str.includes(":")) {
    let [hunkPart, linePart] = str.split(":", 2);
    let trimmedHunkPart = hunkPart.trim();
    if (!/^\d+$/.test(trimmedHunkPart)) {
      throw new Error(`Invalid hunk ID: ${hunkPart}`);
    }

    let hunkId = Number(trimmedHunkPart);
    let lines = expandNumberSpec(linePart);
    return { type: "lines", hunkId, lines };
  }

  // Hunk-level: "1,3,5" or "1-5" or "1-3,7"
  let ids = expandNumberSpec(str);
  return { type: "hunks", ids };
}

function expandNumberSpec(spec) {
  let parts = spec.split(",");
  let result = [];

  for (let part of parts) {
    part = part.trim();
    if (part.length === 0) throw new Error("Invalid number: ");

    if (part.includes("-")) {
      let match = part.match(/^(\d+)\s*-\s*(\d+)$/);
      if (!match) throw new Error(`Invalid range: ${part}`);

      let start = Number(match[1]);
      let end = Number(match[2]);
      if (start > end) throw new Error(`Invalid range: ${part}`);

      for (let i = start; i <= end; i++) result.push(i);
      continue;
    }

    if (!/^\d+$/.test(part)) throw new Error(`Invalid number: ${part}`);
    result.push(Number(part));
  }

  return result;
}
