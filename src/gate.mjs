import { runTsc } from "./run-tsc.mjs";
import { count } from "./signature.mjs";
import { trackedFiles } from "./git.mjs";
import { fixedCount, newErrors, readBaseline } from "./baseline.mjs";

/** Runs tsc and counts the errors that live in tracked files. */
export function measure(root, cfg) {
  const r = runTsc({ cwd: root, project: cfg.project, heapMb: cfg.heapMb });
  if (r.broken) return r;
  return count(r.errors, trackedFiles(root));
}

/** measure + compare with the baseline. Returns { missing } | { broken, tail } | { current, baseline, fresh, fixed }. */
export function evaluate(root, cfg) {
  const baseline = readBaseline(root);
  if (!baseline) return { missing: true };
  const current = measure(root, cfg);
  if (current.broken) return current;
  return { current, baseline, fresh: newErrors(baseline, current), fixed: fixedCount(baseline, current) };
}

export const MAX_LINES = 20;

/** Keeps a failure message short: at most MAX_LINES lines, with a count of what was cut. */
export function clip(lines, max = MAX_LINES) {
  if (lines.length <= max) return lines;
  return [...lines.slice(0, max - 1), `... and ${lines.length - (max - 1)} more`];
}
