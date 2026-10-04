# tsc-ratchet

A git `pre-push` gate that blocks **new** TypeScript errors and allows the old ones.

Most gates say "zero errors or no push". That is impossible to adopt in a codebase that already has errors, so nobody turns it on. `tsc-ratchet` records today's errors as a baseline and only fails when a push adds one that is not in it. The baseline can go down, never up: every error you fix is locked in as forbidden.

```
$ git push origin main
tsc-ratchet: BLOCKED - 1 new TypeScript error (baseline allows 1)
src/bug.ts(1,14): error TS2322: Type 'string' is not assignable to type 'number'.
Fix them and push again. Old errors are allowed; new ones are not.
```

Try it in 60 seconds, on a throwaway repo, without touching your own: `git clone` this repo, `npm install`, `npm run demo`.

## Quick start

```bash
npm install --save-dev github:GonzaloNavach/tsc-ratchet   # not on npm yet
npx tsc-ratchet baseline        # record today's errors, then commit .tsc-ratchet/baseline.json
npx tsc-ratchet install-hook    # every developer runs this once
```

From then on, a push to `main` runs `tsc --noEmit` and compares. Pushes to other branches are not checked.

## Commands

| Command | What it does |
|---|---|
| `baseline` | Records the current errors. Refuses if a baseline already exists. |
| `baseline --update` | Lowers the baseline after you fixed errors. Refuses if any error is new. |
| `check` | Compares the working tree with the baseline. Exit 1 on new errors. Run it in your editor task or CI too. |
| `install-hook [--branches main,release]` | Installs `pre-push`. Safe to run twice; a hook you already had is kept as `pre-push.backup`. |
| `hook` | What git runs on push (reads the refs on stdin). |

To skip once, on purpose: `TSC_RATCHET_SKIP=1 git push` (it is noted in `.git/tsc-ratchet.log`).

## Settings (`tsc-ratchet.json`, optional)

| Key | Default | Meaning |
|---|---|---|
| `branches` | `["main"]` | Pushes to these branches are checked |
| `project` | `"tsconfig.json"` | Passed to `tsc -p` |
| `tests` | `[]` | Fast commands that must pass too, e.g. `["npm test"]` |
| `minFreeGb` | `1` | Refuse to start tsc with less free RAM than this (`0` turns it off) |
| `heapMb` | `4096` | `--max-old-space-size` for tsc |

## How it decides

- **An error is identified by file, code and message, not by line.** Moving code around does not turn an old error into a new one. The baseline stores how many of each exist.
- **Only tracked files count** (`git ls-files`). Ignored or untracked files are not pushed and differ between checkouts.
- **A crash is never "zero errors".** If tsc dies without reporting errors, the push is blocked with the last lines of its output.
- **It checks the working tree**, so it also requires a clean tree and that the commit you push is `HEAD`. Otherwise it could approve code that is not what you send.
- **Failures are short**: at most 20 lines.

## Does it work? What I did to find out

- 30 tests (`npm test`) on real git repos: real `git push` against a bare remote, a real `tsc`, real hooks. They cover: blocked push does not move the remote, a fix goes through, other branches are untouched, uncommitted changes block, the skip switch, failing test commands, no baseline, low RAM, a tsc that crashes, moved code, untracked files, and the ratchet going down but not up.
- A negative control (`npm run mutation`) breaks the code six different ways, one at a time (for example, putting the line number back into the signature, or letting one extra error through), and checks that the suite fails each time. If a test could not catch its own bug, it would not count.
- Overhead on a synthetic project of 300 files with 5 old errors: plain `tsc --noEmit` 1.38 s, `tsc-ratchet check` 1.57 s (+0.19 s, 14 %), median of 3 runs on my laptop (Windows 11, Node 22). Reproduce with `npm run bench`.

## Limits

- It only watches `tsc`. It is not a linter.
- It is a local hook: anyone can skip it with `git push --no-verify`. It protects you from yourself; it does not replace a server-side check.
- The hook stores the path of this install, so each developer runs `install-hook` themselves (a `prepare` script can do it).
- Built and tested on Windows 11 with Git for Windows and Node 22. I have not run it on Linux or macOS yet.

## About this project

This is a clean, standalone rewrite of a pre-push gate I use every day on production TypeScript projects. I built it with Claude Code. What I trust is the evidence above (the tests and the negative control), not that an AI wrote it or that I read every line.

My private version also queues heavy checks across parallel sessions, caches a previous result, and leaves generated folders out of tsc. I left those out on purpose: they only matter on a crowded machine.

## Nota en español

`tsc-ratchet` es un guarda de `git push` que bloquea los errores de TypeScript **nuevos** y deja pasar los antiguos. Sirve para adoptar un chequeo de tipos en un proyecto que ya tiene errores: la base de errores solo puede bajar. Lo escribí con Claude Code a partir de una herramienta que uso en mi trabajo; la evidencia está en las 30 pruebas y en el control negativo (`npm run mutation`).

## License

MIT
