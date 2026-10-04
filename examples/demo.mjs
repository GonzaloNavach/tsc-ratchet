// A 60-second walkthrough on a throwaway repo: old error allowed, new error blocked, fix accepted.
//   npm run demo
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BIN = join(resolve(dirname(fileURLToPath(import.meta.url)), ".."), "bin", "tsc-ratchet.mjs");
const dir = mkdtempSync(join(tmpdir(), "tsc-ratchet-demo-"));
const remote = mkdtempSync(join(tmpdir(), "tsc-ratchet-demo-remote-"));
const env = { ...process.env, GIT_AUTHOR_NAME: "Demo", GIT_AUTHOR_EMAIL: "demo@example.com", GIT_COMMITTER_NAME: "Demo", GIT_COMMITTER_EMAIL: "demo@example.com" };

const step = (title) => console.log(`\n\x1b[1m== ${title}\x1b[0m`);
const run = (label, cmd, args, cwd = dir) => {
  console.log(`\x1b[2m$ ${label}\x1b[0m`);
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8", env });
  const text = `${r.stdout}${r.stderr}`.trim();
  if (text) console.log(text);
  return r.status;
};
const git = (...a) => run(`git ${a.join(" ")}`, "git", a);
const ratchet = (...a) => run(`npx tsc-ratchet ${a.join(" ")}`, process.execPath, [BIN, ...a]);
const write = (rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

git("init", "-q", "-b", "main");
git("config", "core.autocrlf", "false");
spawnSync("git", ["init", "-q", "--bare", "-b", "main"], { cwd: remote });
git("remote", "add", "origin", remote);
write("package.json", `{"name":"demo","private":true}\n`);
write("tsconfig.json", JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "es2020", module: "esnext", moduleResolution: "bundler", skipLibCheck: true, types: [] }, include: ["src"] }));
write("tsc-ratchet.json", JSON.stringify({ minFreeGb: 0 }));
write("src/legacy.ts", `export const price: number = "12.50"; // an old error nobody has fixed\n`);
git("add", "-A");
git("commit", "-q", "-m", "legacy project with one TypeScript error");

step("1. Adopt it: record today's errors and install the hook");
ratchet("baseline");
ratchet("install-hook");
git("add", "-A");
git("commit", "-q", "-m", "add tsc-ratchet");
git("push", "-q", "origin", "main");

step("2. A normal push still works: the old error is allowed");
write("src/ok.ts", `export const greeting: string = "hello";\n`);
git("add", "-A");
git("commit", "-q", "-m", "add a clean file");
git("push", "-q", "origin", "main");

step("3. A new error is blocked before it leaves your machine");
write("src/bug.ts", `export const count: number = "three";\n`);
git("add", "-A");
git("commit", "-q", "-m", "add a bug");
git("push", "-q", "origin", "main");

step("4. Fix it and push again");
write("src/bug.ts", `export const count: number = 3;\n`);
git("add", "-A");
git("commit", "-q", "-m", "fix the bug");
git("push", "-q", "origin", "main");

console.log(`\nDone. Temp repo: ${dir}`);
