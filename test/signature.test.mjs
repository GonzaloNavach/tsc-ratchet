import { test } from "node:test";
import assert from "node:assert/strict";
import { count, parseLine, parseOutput } from "../src/signature.mjs";
import { fixedCount, newErrors } from "../src/baseline.mjs";

const line = (file, n, msg = "Type 'string' is not assignable to type 'number'.") => `${file}(${n},7): error TS2322: ${msg}`;

test("the signature ignores line and column: moved code is the same error", () => {
  assert.equal(parseLine(line("src/a.ts", 3)).sig, parseLine(line("src/a.ts", 40)).sig);
});

test("a different file, code or message is a different error", () => {
  const base = parseLine(line("src/a.ts", 3)).sig;
  assert.notEqual(base, parseLine(line("src/b.ts", 3)).sig);
  assert.notEqual(base, parseLine(line("src/a.ts", 3, "Another message.")).sig);
  assert.notEqual(base, parseLine("src/a.ts(3,7): error TS2304: Type 'string' is not assignable to type 'number'.").sig);
});

test("Windows and POSIX paths give the same signature", () => {
  assert.equal(parseLine(line("src\\a.ts", 3)).sig, parseLine(line("src/a.ts", 3)).sig);
});

test("errors that belong to no file (config errors) are parsed", () => {
  const e = parseLine("error TS18003: No inputs were found in config file.");
  assert.equal(e.file, "");
  assert.equal(e.code, "TS18003");
});

test("lines that are not errors are ignored", () => {
  assert.deepEqual(parseOutput("Found 2 errors.\n\nsome noise"), []);
});

test("only tracked files are counted; config errors always are", () => {
  const errors = parseOutput([line("src/a.ts", 1), line("src/untracked.ts", 1), "error TS5058: The specified path does not exist."].join("\n"));
  const { total, counts } = count(errors, new Set(["src/a.ts"]));
  assert.equal(total, 2);
  assert.equal(Object.keys(counts).length, 2);
});

test("ratchet: only what exceeds the baseline is new, and it is the newest line of that signature", () => {
  const baseline = { errors: { [parseLine(line("src/a.ts", 1)).sig]: 1 } };
  const current = count(parseOutput([line("src/a.ts", 1), line("src/a.ts", 9)].join("\n")), null);
  assert.deepEqual(newErrors(baseline, current), [line("src/a.ts", 9)]);
  assert.equal(fixedCount(baseline, current), 0);
});

test("fixedCount counts baseline errors that are gone", () => {
  const baseline = { errors: { [parseLine(line("src/a.ts", 1)).sig]: 2 } };
  const current = count(parseOutput(line("src/a.ts", 1)), null);
  assert.equal(fixedCount(baseline, current), 1);
  assert.deepEqual(newErrors(baseline, current), []);
});
