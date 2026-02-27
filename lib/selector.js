/**
 * Parse hunk/line selector strings.
 *
 * Formats:
 *   "1"         → { type: "hunks", ids: [1] }
 *   "1,3,5"     → { type: "hunks", ids: [1,3,5] }
 *   "1-5"       → { type: "hunks", ids: [1,2,3,4,5] }
 *   "1-3,7,9"   → { type: "hunks", ids: [1,2,3,7,9] }
 *   "1:2-4"     → { type: "lines", hunkId: 1, lines: [2,3,4] }
 *   "1:3,5,8"   → { type: "lines", hunkId: 1, lines: [3,5,8] }
 */
export function parseSelector(str) {
  if (!str) throw new Error("No selector provided");

  // Line-level: "hunkId:lineSpec"
  if (str.includes(":")) {
    let [hunkPart, linePart] = str.split(":", 2);
    let hunkId = parseInt(hunkPart, 10);
    if (Number.isNaN(hunkId)) throw new Error(`Invalid hunk ID: ${hunkPart}`);
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
    if (part.includes("-")) {
      let [start, end] = part.split("-", 2).map((s) => parseInt(s.trim(), 10));
      if (Number.isNaN(start) || Number.isNaN(end)) throw new Error(`Invalid range: ${part}`);
      for (let i = start; i <= end; i++) result.push(i);
    } else {
      let n = parseInt(part, 10);
      if (Number.isNaN(n)) throw new Error(`Invalid number: ${part}`);
      result.push(n);
    }
  }
  return result;
}
