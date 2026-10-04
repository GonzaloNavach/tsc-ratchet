import { execFileSync } from "node:child_process";
import { isAbsolute, resolve } from "node:path";
import { normalizePath } from "./signature.mjs";

export const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

export const repoRoot = (cwd) => resolve(git(cwd, "rev-parse", "--show-toplevel"));

/** Repo-relative paths of every tracked file (what a push would carry). */
export function trackedFiles(cwd) {
  const out = execFileSync("git", ["ls-files", "-z"], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return new Set(out.split("\0").filter(Boolean).map(normalizePath));
}

/** Directory where git looks for hooks (honours core.hooksPath and worktrees). */
export function hooksDir(cwd) {
  const p = git(cwd, "rev-parse", "--git-path", "hooks");
  return isAbsolute(p) ? p : resolve(cwd, p);
}

export function gitDir(cwd) {
  const p = git(cwd, "rev-parse", "--git-dir");
  return isAbsolute(p) ? p : resolve(cwd, p);
}

export const isClean = (cwd) => git(cwd, "status", "--porcelain", "--untracked-files=no") === "";
export const headSha = (cwd) => git(cwd, "rev-parse", "HEAD");
