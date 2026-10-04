import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const BASELINE_FILE = ".tsc-ratchet/baseline.json";

export function readBaseline(root) {
  const file = join(root, BASELINE_FILE);
  if (!existsSync(file)) return null;
  const doc = JSON.parse(readFileSync(file, "utf8"));
  if (!doc || typeof doc.errors !== "object") throw new Error(`${BASELINE_FILE} is not a tsc-ratchet baseline`);
  return doc;
}

// Keys are sorted so the file diffs cleanly in code review.
export function writeBaseline(root, counts) {
  const file = join(root, BASELINE_FILE);
  mkdirSync(dirname(file), { recursive: true });
  const errors = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
  const total = Object.values(errors).reduce((a, b) => a + b, 0);
  writeFileSync(file, `${JSON.stringify({ version: 1, total, errors }, null, 2)}\n`);
  return total;
}

/**
 * The ratchet: errors that exceed what the baseline allows, by signature.
 * For each signature the allowance is the count in the baseline (0 if it is not there), and the
 * newest lines of that signature are the ones reported.
 */
export function newErrors(baseline, current) {
  const fresh = [];
  for (const [sig, n] of Object.entries(current.counts)) {
    const extra = n - (baseline.errors[sig] ?? 0);
    if (extra > 0) fresh.push(...current.lines[sig].slice(-extra));
  }
  return fresh;
}

/** How many baseline errors are gone in the current run. */
export function fixedCount(baseline, current) {
  let fixed = 0;
  for (const [sig, n] of Object.entries(baseline.errors)) fixed += Math.max(0, n - (current.counts[sig] ?? 0));
  return fixed;
}
