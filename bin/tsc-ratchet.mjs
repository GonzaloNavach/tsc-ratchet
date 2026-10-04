#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { loadConfig } from "../src/config.mjs";
import { clip, evaluate, measure } from "../src/gate.mjs";
import { repoRoot } from "../src/git.mjs";
import { BASELINE_FILE, newErrors, readBaseline, writeBaseline } from "../src/baseline.mjs";
import { runHook } from "../src/hook.mjs";
import { installHook } from "../src/install.mjs";

const HELP = `tsc-ratchet - block NEW TypeScript errors, allow the old ones.

  tsc-ratchet baseline              record today's errors as the baseline (first time only)
  tsc-ratchet baseline --update     lower the baseline after fixing errors (refuses if any error is new)
  tsc-ratchet check                 compare the working tree with the baseline (exit 1 on new errors)
  tsc-ratchet install-hook          install the git pre-push hook [--branches main,release]
  tsc-ratchet hook                  what git runs on push (reads refs on stdin)

Skip once, on purpose:  TSC_RATCHET_SKIP=1 git push   (noted in .git/tsc-ratchet.log)
Settings: tsc-ratchet.json (branches, project, tests, minFreeGb, heapMb)`;

const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => rest.includes(name);
const out = (lines) => lines.forEach((l) => console.log(l));

function main() {
  if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") return out([HELP]), 0;
  const root = repoRoot(process.cwd());
  const cfg = loadConfig(root);

  if (cmd === "hook") {
    const { code, lines } = runHook({ cwd: process.cwd(), stdin: readFileSync(0, "utf8") });
    (code === 0 ? console.log : console.error)(lines.join("\n"));
    return code;
  }

  if (cmd === "install-hook") {
    const i = rest.indexOf("--branches");
    const branches = i >= 0 ? rest[i + 1]?.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
    out(installHook({ cwd: process.cwd(), branches }));
    return 0;
  }

  if (cmd === "baseline") {
    const existing = readBaseline(root);
    if (existing && !flag("--update")) return out([`A baseline already exists (${existing.total} errors). Use "baseline --update" to lower it.`]), 1;
    const current = measure(root, cfg);
    if (current.broken) return out([`tsc-ratchet: ${current.broken}`, ...(current.tail ?? [])]), 1;
    if (existing) {
      const fresh = newErrors(existing, current);
      if (fresh.length) return out(clip(["Refusing to update: the baseline can only go down. New errors:", ...fresh])), 1;
    }
    const total = writeBaseline(root, current.counts);
    if (current.ignored) out([`Note: ${current.ignored} error${current.ignored > 1 ? "s" : ""} in files git does not track were not counted. Run "git add" on them and record the baseline again if they belong in it.`]);
    out([existing ? `Baseline lowered: ${existing.total} -> ${total} errors (${BASELINE_FILE})` : `Baseline saved: ${total} errors (${BASELINE_FILE}). Commit it.`]);
    return 0;
  }

  if (cmd === "check") {
    const r = evaluate(root, cfg);
    if (r.missing) return out([`No baseline. Run "tsc-ratchet baseline" first.`]), 1;
    if (r.broken) return out([`tsc-ratchet: ${r.broken}`, ...(r.tail ?? [])]), 1;
    if (r.fresh.length) return out(clip([`${r.fresh.length} new TypeScript error${r.fresh.length > 1 ? "s" : ""}:`, ...r.fresh])), 1;
    out([`ok - ${r.current.total} errors, baseline ${r.baseline.total}${r.fixed ? `, ${r.fixed} fixed (run "baseline --update")` : ""}`]);
    return 0;
  }

  out([`Unknown command "${cmd}".`, HELP]);
  return 1;
}

try {
  process.exitCode = main();
} catch (e) {
  console.error(`tsc-ratchet: ${e.message}`);
  process.exitCode = 1;
}
