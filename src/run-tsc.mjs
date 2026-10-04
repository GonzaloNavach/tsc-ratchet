import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";
import { parseOutput } from "./signature.mjs";

// Finds the TypeScript compiler of the project; falls back to the one installed next to this tool.
function findTsc(cwd) {
  for (const base of [join(cwd, "package.json"), import.meta.url]) {
    try {
      return createRequire(base).resolve("typescript/bin/tsc");
    } catch {
      /* try the next place */
    }
  }
  return null;
}

/**
 * Runs `tsc --noEmit` in `cwd`.
 * Returns { errors } on success, or { broken } if tsc could not run or died without reporting errors
 * (a crash is never treated as "zero errors").
 */
export function runTsc({ cwd, project = "tsconfig.json", heapMb = 4096 }) {
  const bin = findTsc(cwd);
  if (!bin) return { broken: "TypeScript is not installed (npm install --save-dev typescript)" };
  const r = spawnSync(process.execPath, [`--max-old-space-size=${heapMb}`, bin, "--noEmit", "--pretty", "false", "-p", project], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: 15 * 60_000,
  });
  const output = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  const errors = parseOutput(output);
  if (r.error || r.signal || (r.status !== 0 && errors.length === 0)) {
    const why = r.error?.code ?? r.signal ?? `exit ${r.status}`;
    return { broken: `tsc did not finish (${why})`, tail: output.trim().split(/\r?\n/).slice(-5) };
  }
  return { errors };
}
