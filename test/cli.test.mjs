import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NEW_ERROR, OLD_ERROR, git, makeRepo, ratchet, write } from "./helpers.mjs";

const baselineOf = (cwd) => JSON.parse(readFileSync(join(cwd, ".tsc-ratchet", "baseline.json"), "utf8"));

test("baseline records the old error; a second baseline without --update refuses", () => {
  const cwd = makeRepo();
  const first = ratchet(cwd, ["baseline"]);
  assert.equal(first.code, 0, first.out);
  assert.equal(baselineOf(cwd).total, 1);
  const second = ratchet(cwd, ["baseline"]);
  assert.equal(second.code, 1);
  assert.match(second.out, /already exists/);
});

test("check passes when nothing changed and says how many old errors remain", () => {
  const cwd = makeRepo();
  ratchet(cwd, ["baseline"]);
  const r = ratchet(cwd, ["check"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ok - 1 errors, baseline 1/);
});

test("check fails on a new error and prints it", () => {
  const cwd = makeRepo();
  ratchet(cwd, ["baseline"]);
  write(cwd, "src/b.ts", NEW_ERROR);
  git(cwd, "add", "-A");
  const r = ratchet(cwd, ["check"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /src\/b\.ts\(1,\d+\): error TS2322/);
});

test("moving code does not make an old error new", () => {
  const cwd = makeRepo();
  ratchet(cwd, ["baseline"]);
  write(cwd, "src/a.ts", `// a new comment\n// and another\n\n${OLD_ERROR}`);
  const r = ratchet(cwd, ["check"]);
  assert.equal(r.code, 0, r.out);
});

test("errors in files git does not track are ignored; once tracked they count", () => {
  const cwd = makeRepo();
  ratchet(cwd, ["baseline"]);
  write(cwd, "src/untracked.ts", NEW_ERROR);
  assert.equal(ratchet(cwd, ["check"]).code, 0);
  git(cwd, "add", "src/untracked.ts");
  assert.equal(ratchet(cwd, ["check"]).code, 1);
});

test("the ratchet only goes down: fixing lowers the baseline and the old error cannot come back", () => {
  const cwd = makeRepo();
  ratchet(cwd, ["baseline"]);
  write(cwd, "src/a.ts", `export const a: number = 1;\n`);
  const fixed = ratchet(cwd, ["check"]);
  assert.equal(fixed.code, 0);
  assert.match(fixed.out, /1 fixed/);
  const lowered = ratchet(cwd, ["baseline", "--update"]);
  assert.equal(lowered.code, 0, lowered.out);
  assert.match(lowered.out, /1 -> 0/);
  assert.equal(baselineOf(cwd).total, 0);
  write(cwd, "src/a.ts", OLD_ERROR);
  assert.equal(ratchet(cwd, ["check"]).code, 1, "the error that was fixed is now forbidden");
});

test("baseline --update refuses when an error is new and leaves the file untouched", () => {
  const cwd = makeRepo();
  ratchet(cwd, ["baseline"]);
  const before = readFileSync(join(cwd, ".tsc-ratchet", "baseline.json"), "utf8");
  write(cwd, "src/b.ts", NEW_ERROR);
  git(cwd, "add", "-A");
  const r = ratchet(cwd, ["baseline", "--update"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /can only go down/);
  assert.equal(readFileSync(join(cwd, ".tsc-ratchet", "baseline.json"), "utf8"), before);
});

test("check without a baseline tells you what to do", () => {
  const cwd = makeRepo();
  const r = ratchet(cwd, ["check"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /tsc-ratchet baseline/);
});

test("baseline warns when errors sit in files git does not track, instead of silently recording zero", () => {
  const cwd = makeRepo();
  write(cwd, "src/new.ts", NEW_ERROR); // not added to git
  const r = ratchet(cwd, ["baseline"]);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /1 error in files git does not track were not counted/);
});

test("a tsc that dies without reporting errors is a failure, never 'zero errors'", () => {
  const cwd = makeRepo();
  ratchet(cwd, ["baseline"]);
  write(cwd, "tsc-ratchet.json", JSON.stringify({ heapMb: 1 })); // tsc cannot start with a 1 MB heap
  const r = ratchet(cwd, ["check"]);
  assert.equal(r.code, 1);
  assert.match(r.out, /tsc did not finish/);
});
