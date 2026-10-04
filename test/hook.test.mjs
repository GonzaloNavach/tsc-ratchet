import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MARKER } from "../src/install.mjs";
import { NEW_ERROR, commitAll, git, makePushableRepo, makeRepo, ratchet, write } from "./helpers.mjs";

const hookFile = (cwd) => join(cwd, ".git", "hooks", "pre-push");

test("install-hook twice leaves a single hook; a foreign hook is backed up, not lost", () => {
  const cwd = makeRepo();
  writeFileSync(hookFile(cwd), "#!/bin/sh\necho mine\n");
  ratchet(cwd, ["install-hook"]);
  ratchet(cwd, ["install-hook"]);
  const text = readFileSync(hookFile(cwd), "utf8");
  assert.equal(text.split(MARKER).length - 1, 1, "the marker appears once");
  assert.equal(readFileSync(`${hookFile(cwd)}.backup`, "utf8"), "#!/bin/sh\necho mine\n");
});

test("install-hook --branches saves the list for the team", () => {
  const cwd = makeRepo();
  ratchet(cwd, ["install-hook", "--branches", "main,release"]);
  assert.deepEqual(JSON.parse(readFileSync(join(cwd, "tsc-ratchet.json"), "utf8")).branches, ["main", "release"]);
});

test("a clean push to main goes through", () => {
  const { cwd } = makePushableRepo();
  const r = git(cwd, "push", "origin", "main");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /tsc-ratchet: ok - 1 errors \(baseline 1\)/);
});

test("a push to main with a NEW error is blocked and the remote does not move", () => {
  const { cwd, remote } = makePushableRepo();
  assert.equal(git(cwd, "push", "origin", "main").code, 0);
  const before = git(remote, "rev-parse", "main").out;
  write(cwd, "src/b.ts", NEW_ERROR);
  commitAll(cwd, "introduce an error");
  const r = git(cwd, "push", "origin", "main");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /tsc-ratchet: BLOCKED - 1 new TypeScript error/);
  assert.match(r.out, /src\/b\.ts/);
  assert.equal(git(remote, "rev-parse", "main").out, before);
});

test("after fixing the new error the same push goes through", () => {
  const { cwd, remote } = makePushableRepo();
  assert.equal(git(cwd, "push", "origin", "main").code, 0);
  write(cwd, "src/b.ts", NEW_ERROR);
  commitAll(cwd, "introduce an error");
  assert.notEqual(git(cwd, "push", "origin", "main").code, 0);
  write(cwd, "src/b.ts", `export const b: string = "ok";\n`);
  commitAll(cwd, "fix it");
  const r = git(cwd, "push", "origin", "main");
  assert.equal(r.code, 0, r.out);
  assert.equal(git(remote, "rev-parse", "main").out, git(cwd, "rev-parse", "HEAD").out);
});

test("branches that are not configured are not checked", () => {
  const { cwd } = makePushableRepo();
  git(cwd, "checkout", "-q", "-b", "feature");
  write(cwd, "src/b.ts", NEW_ERROR);
  commitAll(cwd, "wip with an error");
  const r = git(cwd, "push", "origin", "feature");
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /tsc-ratchet:/);
});

test("uncommitted changes block the push: the check reads the working tree", () => {
  const { cwd } = makePushableRepo();
  write(cwd, "src/a.ts", `export const a: number = "x";\nexport const ok = 2;\n`);
  const r = git(cwd, "push", "origin", "main");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /uncommitted changes/);
});

test("TSC_RATCHET_SKIP=1 lets a push through and leaves a note in the git dir", () => {
  const { cwd } = makePushableRepo();
  assert.equal(git(cwd, "push", "origin", "main").code, 0);
  write(cwd, "src/b.ts", NEW_ERROR);
  commitAll(cwd, "introduce an error");
  const skipped = pushWithEnv(cwd, { TSC_RATCHET_SKIP: "1" });
  assert.equal(skipped.status, 0, skipped.output);
  assert.match(skipped.output, /SKIPPED/);
  assert.ok(existsSync(join(cwd, ".git", "tsc-ratchet.log")));
  assert.match(readFileSync(join(cwd, ".git", "tsc-ratchet.log"), "utf8"), /refs\/heads\/main/);
});

test("the tests listed in tsc-ratchet.json must pass too", () => {
  const { cwd } = makePushableRepo();
  write(cwd, "tsc-ratchet.json", JSON.stringify({ minFreeGb: 0, tests: [`node -e "console.error('boom'); process.exit(1)"`] }));
  commitAll(cwd, "add a failing test command");
  const r = git(cwd, "push", "origin", "main");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /tests failed/);
  assert.match(r.out, /boom/);
});

test("not enough free RAM blocks the push before tsc runs", () => {
  const { cwd } = makePushableRepo();
  write(cwd, "tsc-ratchet.json", JSON.stringify({ minFreeGb: 100000 }));
  commitAll(cwd, "ask for an impossible amount of RAM");
  const r = git(cwd, "push", "origin", "main");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /GB of free RAM/);
});

test("a repo with no baseline is blocked with the command to fix it", () => {
  const cwd = makeRepo();
  write(cwd, "tsc-ratchet.json", JSON.stringify({ minFreeGb: 0 }));
  commitAll(cwd, "config only");
  ratchet(cwd, ["install-hook"]);
  const bare = makeRepoRemote(cwd);
  const r = git(cwd, "push", bare, "main");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /no baseline yet/);
});


function pushWithEnv(cwd, env) {
  const r = spawnSync("git", ["push", "origin", "main"], { cwd, encoding: "utf8", env: { ...process.env, ...env } });
  return { status: r.status, output: `${r.stdout}${r.stderr}` };
}

function makeRepoRemote(cwd) {
  const bare = mkdtempSync(join(tmpdir(), "tsc-ratchet-bare-"));
  git(bare, "init", "-q", "--bare", "-b", "main");
  git(cwd, "remote", "add", "origin", bare);
  return bare;
}
