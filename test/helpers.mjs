import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const BIN = resolve(dirname(fileURLToPath(import.meta.url)), "..", "bin", "tsc-ratchet.mjs");

export const TSCONFIG = {
  compilerOptions: { strict: true, noEmit: true, target: "es2020", module: "esnext", moduleResolution: "bundler", skipLibCheck: true, types: [] },
  include: ["src"],
};
export const OLD_ERROR = `export const a: number = "x";\nexport const ok = 1;\n`;
export const NEW_ERROR = `export const b: string = 42;\n`;

export function git(cwd, ...args) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: cleanEnv() });
  return { code: r.status, out: `${r.stdout}${r.stderr}`.trim() };
}

function cleanEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  if (!("TSC_RATCHET_SKIP" in extra)) delete env.TSC_RATCHET_SKIP;
  return env;
}

export function ratchet(cwd, args, env = {}) {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: cleanEnv(env) });
  return { code: r.status, out: `${r.stdout}${r.stderr}`.trim() };
}

export const write = (cwd, rel, text) => {
  const file = join(cwd, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

/** A throwaway git repo with one old TypeScript error, committed. No baseline yet. */
export function makeRepo() {
  const cwd = mkdtempSync(join(tmpdir(), "tsc-ratchet-"));
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "test@example.com");
  git(cwd, "config", "user.name", "Test");
  git(cwd, "config", "commit.gpgsign", "false");
  write(cwd, "package.json", `{"name":"fixture","private":true}\n`);
  write(cwd, "tsconfig.json", JSON.stringify(TSCONFIG));
  write(cwd, "src/a.ts", OLD_ERROR);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "init");
  return cwd;
}

/** makeRepo + baseline committed + hook installed + a bare remote that already has main. */
export function makePushableRepo() {
  const cwd = makeRepo();
  // Tests must not depend on how much RAM the machine running them has free.
  write(cwd, "tsc-ratchet.json", JSON.stringify({ minFreeGb: 0 }));
  ratchet(cwd, ["baseline"]);
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "add baseline");
  ratchet(cwd, ["install-hook"]);
  const remote = mkdtempSync(join(tmpdir(), "tsc-ratchet-remote-"));
  git(remote, "init", "-q", "--bare", "-b", "main");
  git(cwd, "remote", "add", "origin", remote);
  return { cwd, remote };
}

export const commitAll = (cwd, msg) => {
  git(cwd, "add", "-A");
  return git(cwd, "commit", "-q", "-m", msg);
};
