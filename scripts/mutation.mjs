// Negative control: break the code on purpose, one way at a time, and check the test suite notices.
// A suite that stays green with broken code proves nothing. Exit 0 only if every mutation is caught.
//   npm run mutation
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MUTATIONS = [
  {
    why: "the signature includes the line number (moving code would look like a new error)",
    file: "src/signature.mjs",
    from: "sig: signature(file, code, message), raw: line.trim() };\n  }\n  const g",
    to: "sig: signature(file, code, message) + ln, raw: line.trim() };\n  }\n  const g",
    tests: ["test/signature.test.mjs", "test/cli.test.mjs"],
  },
  {
    why: "untracked files are counted",
    file: "src/signature.mjs",
    from: "if (e.file && tracked && !tracked.has(e.file)) {",
    to: "if (false) {",
    tests: ["test/signature.test.mjs", "test/cli.test.mjs"],
  },
  {
    why: "the ratchet lets one extra error of each kind through",
    file: "src/baseline.mjs",
    from: "if (extra > 0) fresh.push",
    to: "if (extra > 1) fresh.push",
    tests: ["test/signature.test.mjs", "test/cli.test.mjs"],
  },
  {
    why: "baseline --update accepts new errors",
    file: "bin/tsc-ratchet.mjs",
    from: "if (fresh.length) return out(clip([\"Refusing",
    to: "if (false) return out(clip([\"Refusing",
    tests: ["test/cli.test.mjs"],
  },
  {
    why: "the hook checks every branch, not only the configured ones",
    file: "src/hook.mjs",
    from: "cfg.branches.includes(branchOf(r.remoteRef))",
    to: "true",
    tests: ["test/hook.test.mjs"],
  },
  {
    why: "the hook lets new errors through",
    file: "src/hook.mjs",
    from: "if (result.fresh.length > 0)",
    to: "if (false)",
    tests: ["test/hook.test.mjs"],
  },
];

let escaped = 0;
for (const m of MUTATIONS) {
  const path = join(ROOT, m.file);
  const original = readFileSync(path, "utf8");
  if (!original.includes(m.from)) {
    console.log(`INVALID  ${m.why}: the text to break is not in ${m.file} (the mutation list is out of date)`);
    escaped++;
    continue;
  }
  try {
    writeFileSync(path, original.replace(m.from, m.to));
    const r = spawnSync(process.execPath, ["--test", ...m.tests], { cwd: ROOT, encoding: "utf8" });
    if (r.status === 0) {
      console.log(`ESCAPED  ${m.why}  <- the suite stayed green with broken code`);
      escaped++;
    } else console.log(`caught   ${m.why}`);
  } finally {
    writeFileSync(path, original); // always restore
  }
}
console.log(escaped === 0 ? `\nAll ${MUTATIONS.length} mutations were caught.` : `\n${escaped} of ${MUTATIONS.length} mutations were NOT caught.`);
process.exitCode = escaped === 0 ? 0 : 1;
