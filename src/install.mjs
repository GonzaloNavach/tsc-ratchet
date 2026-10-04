import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hooksDir, repoRoot } from "./git.mjs";
import { CONFIG_FILE, DEFAULTS, loadConfig } from "./config.mjs";

export const MARKER = "# tsc-ratchet (managed)";
const BIN = resolve(dirname(fileURLToPath(import.meta.url)), "..", "bin", "tsc-ratchet.mjs").replaceAll("\\", "/");

/**
 * Writes .git/hooks/pre-push (or wherever core.hooksPath points). Safe to run twice: our own hook is
 * replaced in place; a hook someone else wrote is moved to pre-push.backup and never lost.
 * With `branches`, the list is saved to tsc-ratchet.json so the team shares it.
 */
export function installHook({ cwd, branches }) {
  const root = repoRoot(cwd);
  const messages = [];

  if (branches?.length) {
    const cfg = { ...loadConfig(root), branches };
    writeFileSync(join(root, CONFIG_FILE), `${JSON.stringify(Object.fromEntries(Object.keys(DEFAULTS).map((k) => [k, cfg[k]])), null, 2)}\n`);
    messages.push(`Branches checked: ${branches.join(", ")} (saved in ${CONFIG_FILE})`);
  }

  const dir = hooksDir(root);
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "pre-push");
  if (existsSync(file) && !readFileSync(file, "utf8").includes(MARKER)) {
    let backup = `${file}.backup`;
    if (existsSync(backup)) backup = `${file}.backup-${Date.now()}`;
    renameSync(file, backup);
    messages.push(`Your existing pre-push hook was kept as ${backup}`);
  }
  writeFileSync(file, `#!/bin/sh\n${MARKER} - delete this file to uninstall\nexec node "${BIN}" hook "$@"\n`);
  chmodSync(file, 0o755);
  messages.push(`Hook installed: ${file}`);
  return messages;
}
