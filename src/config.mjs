import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILE = "tsc-ratchet.json";

export const DEFAULTS = {
  branches: ["main"], // pushes to these branches are checked; any other branch is left alone
  project: "tsconfig.json",
  tests: [], // fast commands that must pass too, e.g. ["npm test"]
  minFreeGb: 1, // refuse to run tsc with less free RAM than this (0 turns it off)
  heapMb: 4096, // --max-old-space-size for tsc
};

export function loadConfig(root) {
  const file = join(root, CONFIG_FILE);
  if (!existsSync(file)) return { ...DEFAULTS };
  const user = JSON.parse(readFileSync(file, "utf8"));
  return { ...DEFAULTS, ...user };
}
