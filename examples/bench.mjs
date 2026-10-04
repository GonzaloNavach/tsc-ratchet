// Measures what tsc-ratchet costs on top of plain `tsc --noEmit`, on a synthetic project.
//   npm run bench            (300 files)       npm run bench -- 1000
// The numbers depend on your machine; the point is the overhead, which is the difference.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BIN = join(ROOT, "bin", "tsc-ratchet.mjs");
const TSC = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const FILES = Number(process.argv[2] ?? 300);
const OLD_ERRORS = 5;
const RUNS = 3;

const dir = mkdtempSync(join(tmpdir(), "tsc-ratchet-bench-"));
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: dir, encoding: "utf8", ...opts });
sh("git", ["init", "-q", "-b", "main"]);
sh("git", ["config", "user.email", "bench@example.com"]);
sh("git", ["config", "user.name", "Bench"]);
writeFileSync(join(dir, "package.json"), `{"name":"bench","private":true}\n`);
writeFileSync(
  join(dir, "tsconfig.json"),
  JSON.stringify({ compilerOptions: { strict: true, noEmit: true, target: "es2020", module: "esnext", moduleResolution: "bundler", skipLibCheck: true, types: [] }, include: ["src"] }),
);
mkdirSync(join(dir, "src"));
for (let i = 0; i < FILES; i++) {
  const prev = i > 0 ? `import { total${i - 1} } from "./m${i - 1}";\n` : "";
  const body = [
    prev,
    `export interface Item${i} { id: number; name: string; tags: string[]; price: number }`,
    `export const items${i}: Item${i}[] = Array.from({ length: 5 }, (_, k) => ({ id: k, name: "n" + k, tags: ["a", "b"], price: k * 1.5 }));`,
    `export function total${i}(extra = ${i > 0 ? `total${i - 1}()` : "0"}): number { return items${i}.reduce((s, it) => s + it.price, extra); }`,
    i < OLD_ERRORS ? `export const broken${i}: number = "not a number";` : "",
  ];
  writeFileSync(join(dir, "src", `m${i}.ts`), `${body.join("\n")}\n`);
}
sh("git", ["add", "-A"]);
sh("git", ["commit", "-q", "-m", "bench"]);
const base = sh(process.execPath, [BIN, "baseline"]);
if (base.status !== 0) throw new Error(`baseline failed: ${base.stdout}${base.stderr}`);

const time = (cmd, args) => {
  const t = process.hrtime.bigint();
  const r = sh(cmd, args);
  return { ms: Number(process.hrtime.bigint() - t) / 1e6, status: r.status };
};
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

time(process.execPath, [TSC, "--noEmit", "--pretty", "false"]); // warm the disk cache
const plain = Array.from({ length: RUNS }, () => time(process.execPath, [TSC, "--noEmit", "--pretty", "false"]).ms);
const gated = Array.from({ length: RUNS }, () => time(process.execPath, [BIN, "check"]));
if (gated.some((g) => g.status !== 0)) throw new Error("check failed on the unchanged project");

const p = median(plain);
const g = median(gated.map((x) => x.ms));
console.log(`project: ${FILES} files, ${OLD_ERRORS} old errors, node ${process.version}, ${process.platform}, median of ${RUNS} runs`);
console.log(`| command | time |\n|---|---|`);
console.log(`| tsc --noEmit | ${(p / 1000).toFixed(2)} s |`);
console.log(`| tsc-ratchet check | ${(g / 1000).toFixed(2)} s |`);
console.log(`| overhead | ${((g - p) / 1000).toFixed(2)} s (${(((g - p) / p) * 100).toFixed(0)} %) |`);
