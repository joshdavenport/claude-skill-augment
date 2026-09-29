# skill-augment

A Claude Code mod: a `skill.prompt` function hook that adds augmentation markdown to skill prompts. `README.md` is the source of truth for behaviour and file format; `package.json` scripts for commands.

## The API has no docs

Function hooks ("mods") are early access. Read these instead of guessing:

- **Type declarations** — `.claude-plugin/types/claude-code/index.d.ts`, written by Claude Code the first time it loads the plugin (not in git; run `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude -p --plugin-dir . "ok"` once to create it). It matches the installed binary, and its JSDoc is the real documentation: grep it for an event (`'skill.prompt'`), a noun (`fs: {`), or the test kit (`declare module 'claude-code/testing'`).
- **Official mods** — https://github.com/anthropics/claude-code/tree/main/mods. `agents-md` is the closest model for module layout and in-memory `fs` tests; `sec-default` explains tiers.
- **Proposal and changelog** — https://github.com/anthropics/claude-code/issues/91870.

## Rules the validator and engine enforce

Each of these cost a debugging round to find:

- **`$` stays in `hooks/register.ts`.** `claude plugin validate` follows `$` only into functions declared in the same file, never across an import. Anything that calls `$` lives in `register.ts`; pure logic goes in its own modules (`hooks/parse.ts`, `hooks/references.ts`).
- **One hook per event per plugin**, tests included. `tests/fixtures/workspace-of.ts` already answers `fs.stat`, `fs.list`, `fs.read`, `ui.log`, `session.root`, `skill.prompt` and env (via `mock.env`); extend it instead of registering those again.
- **A failing hook is skipped silently**: the prompt passes through unchanged. When a change "does nothing", read the debug log before the code.
- **`$.env.get` takes string literals only**; the validator lists the names it finds.
- **A test's `$` has no `env` noun.** Set env with `mock.env(on, …)`.
- **Fixture paths avoid `/home`**: on macOS it's an automount, and the engine refuses it as a network location.
- **`claude plugin validate .` checks only the marketplace** when `marketplace.json` exists. `pnpm validate` checks both manifests.
- **Hook budget is 10s** per dispatch; past it the skill loads unaugmented.

## Environment gotchas

- Installed mods and `claude plugin test` load only with `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` (the `test` script sets it; a settings `env` block works for sessions).
- On a Team or Enterprise org, the built-in `sec-default` forwards `skill.prompt` past user-tier plugins, so the hook never fires. The debug log says `sec-default@builtin seated outermost`; the fix is managed `prependPlugins` (see README Requirements).
- Hooks modules load only after workspace trust is accepted; `-p` runs imply trust.
- Skill names arrive qualified: `plugin:skill` for a plugin's skill.
- `$.ui.log` draws every line the same dim style; there's no emphasis control.

## Verifying against the real binary

Unit tests prove the logic; confirm engine behaviour with a probe run:

1. Make a temp project with `.claude/skills-augment/<file>.md` targeting a real skill (leave `~/.claude` alone).
2. From it, run `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude -p --model haiku --debug-file /tmp/probe.log --plugin-dir <repo> "/<plugin>:<skill> test"`. Drop `--plugin-dir` if the checkout is already installed (e.g. symlinked into `~/.claude/skills/`), or it loads twice.
3. Evidence is the debug log (`rg '\[skill-augment\]' /tmp/probe.log`, plus `hooks module skill-augment… loaded`) and the session transcript under `~/.claude/projects/<project-dir>/*.jsonl` showing the delivered text. The model's reply alone proves nothing: it can ignore delivered text that conflicts with the skill.

## Skills

- `mattpocock-skills:tdd` for behaviour changes: tests first, against `workspaceOf`.
- `mattpocock-skills:diagnosing-bugs` when the hook doesn't fire or text doesn't arrive.
- `mattpocock-skills:writing-for-agents` before editing this file.
