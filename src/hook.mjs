import { appendFileSync } from "node:fs";
import { freemem } from "node:os";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { loadConfig } from "./config.mjs";
import { clip, evaluate } from "./gate.mjs";
import { gitDir, headSha, isClean, repoRoot } from "./git.mjs";
import { BASELINE_FILE } from "./baseline.mjs";

const ZEROS = /^0+$/;

/** Lines git feeds a pre-push hook: "<local ref> <local sha> <remote ref> <remote sha>". */
export function parseRefs(text) {
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => {
      const [localRef, localSha, remoteRef, remoteSha] = l.split(" ");
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

const branchOf = (ref) => (ref?.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : null);

/**
 * The pre-push gate. Returns { code, lines }: code 0 lets the push go, 1 blocks it.
 * It only acts when a ref goes to one of the configured branches.
 */
export function runHook({ cwd, stdin, env = process.env }) {
  const root = repoRoot(cwd);
  const cfg = loadConfig(root);
  const pushed = parseRefs(stdin).filter((r) => !ZEROS.test(r.localSha ?? "") && cfg.branches.includes(branchOf(r.remoteRef)));
  if (pushed.length === 0) return { code: 0, lines: [] };

  const t0 = Date.now();
  const block = (title, details = []) => ({ code: 1, lines: clip([`tsc-ratchet: BLOCKED - ${title}`, ...details]) });

  if (env.TSC_RATCHET_SKIP === "1") {
    appendFileSync(join(gitDir(root), "tsc-ratchet.log"), `${new Date().toISOString()} skipped for ${pushed.map((r) => r.remoteRef).join(", ")}\n`);
    return { code: 0, lines: ["tsc-ratchet: SKIPPED (TSC_RATCHET_SKIP=1), noted in .git/tsc-ratchet.log"] };
  }

  // The check runs on the working tree, so the tree must be exactly what is being pushed.
  if (!isClean(root) || pushed.some((r) => r.localSha !== headSha(root)))
    return block("the pushed commit is not HEAD, or there are uncommitted changes", ["The check reads your working tree: commit or stash, and push the commit you are standing on."]);

  const freeGb = freemem() / 1024 ** 3;
  if (cfg.minFreeGb > 0 && freeGb < cfg.minFreeGb)
    return block(`only ${freeGb.toFixed(1)} GB of free RAM (minimum ${cfg.minFreeGb} GB)`, ["Close something and push again, or lower minFreeGb in tsc-ratchet.json."]);

  const result = evaluate(root, cfg);
  if (result.missing) return block("no baseline yet", [`Run "npx tsc-ratchet baseline" once and commit ${BASELINE_FILE}.`]);
  if (result.broken) return block(result.broken, result.tail ?? []);
  if (result.fresh.length > 0)
    return block(`${result.fresh.length} new TypeScript error${result.fresh.length > 1 ? "s" : ""} (baseline allows ${result.baseline.total})`, [
      ...result.fresh,
      "Fix them and push again. Old errors are allowed; new ones are not.",
    ]);

  for (const cmd of cfg.tests) {
    const r = spawnSync(cmd, { cwd: root, shell: true, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    if (r.status !== 0) return block(`tests failed: ${cmd}`, `${r.stdout ?? ""}\n${r.stderr ?? ""}`.trim().split(/\r?\n/).slice(-10));
  }

  const note = result.fixed > 0 ? ` - ${result.fixed} baseline error${result.fixed > 1 ? "s" : ""} fixed, run "tsc-ratchet baseline --update" to lock it in` : "";
  const secs = Math.round((Date.now() - t0) / 1000);
  return { code: 0, lines: [`tsc-ratchet: ok - ${result.current.total} errors (baseline ${result.baseline.total}), ${cfg.tests.length} test command${cfg.tests.length === 1 ? "" : "s"}, ${secs}s${note}`] };
}
