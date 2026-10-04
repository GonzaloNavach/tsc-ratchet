// Parsing of `tsc --pretty false` output and the "signature" that identifies an error.
//
// The signature deliberately leaves out the line and the column: moving code around must not turn an
// old error into a "new" one. Two errors with the same file, code and message are the same error;
// the baseline counts how many of each exist.

const WITH_FILE = /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/;
const GLOBAL = /^error (TS\d+): (.*)$/;

export const normalizePath = (p) => p.replaceAll("\\", "/");

export function signature(file, code, message) {
  return `${normalizePath(file)} | ${code} | ${message.trim().replace(/\s+/g, " ")}`;
}

/** One tsc output line -> { file, line, col, code, message, sig, raw } or null. */
export function parseLine(line) {
  const m = WITH_FILE.exec(line);
  if (m) {
    const [, file, ln, col, code, message] = m;
    return { file: normalizePath(file), line: +ln, col: +col, code, message, sig: signature(file, code, message), raw: line.trim() };
  }
  const g = GLOBAL.exec(line);
  if (g) return { file: "", line: 0, col: 0, code: g[1], message: g[2], sig: signature("", g[1], g[2]), raw: line.trim() };
  return null;
}

export const parseOutput = (text) => text.split(/\r?\n/).map(parseLine).filter(Boolean);

/**
 * Group errors by signature. Only errors in tracked files count (`tracked` is a Set of repo-relative
 * paths): untracked or ignored files are not pushed and differ from one checkout to another.
 * Errors that belong to no file (config errors) always count.
 */
export function count(errors, tracked) {
  const counts = {};
  const lines = {};
  let ignored = 0; // errors in files git does not track
  for (const e of errors) {
    if (e.file && tracked && !tracked.has(e.file)) {
      ignored++;
      continue;
    }
    counts[e.sig] = (counts[e.sig] ?? 0) + 1;
    (lines[e.sig] ??= []).push(e.raw);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, lines, total, ignored };
}
