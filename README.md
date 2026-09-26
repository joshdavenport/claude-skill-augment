# skill-augment

A Claude Code mod that adds your own text to the prompts of skills you can't
practically edit, such as those shipped in plugins.

## Augmentation files

Markdown files, anywhere under either folder (subfolders are for your own
organisation, or for dropping in a shared set, symlinks followed):

- `~/.claude/skills-augment/` (or `$CLAUDE_CONFIG_DIR/skills-augment/`)
- `<project>/.claude/skills-augment/`

```md
---
skills: [mattpocock-skills:tdd, mattpocock-skills:code-review]
position: end # start | end, default end
---

Use pnpm and vitest.
```

- `skills` takes qualified names, as the Skill tool lists them:
  `plugin:skill` for a plugin's skill, the bare name for your own.
- A `.md` file without frontmatter naming `skills` isn't an augmentation, so
  READMEs and notes can sit beside them. Dot-prefixed files and folders are
  skipped.
- Files are read each time a skill loads; edits apply without a restart.

## How text is placed

When a skill's prompt is expanded (typed `/name`, the Skill tool, or a
subagent preloading it), matching augments are joined around it, user
files before project files, each folder in path order:

```
user start… · project start… · <skill prompt> · user end… · project end…
```

Each applied file gets a transcript line, followed by a hint:

```
Augmented mattpocock-skills:tdd with ~/.claude/skills-augment/house/tdd.md
Didn't expect this? Check the augmentation markdown.
```

A file naming the skill but broken (an unknown `position`, no body) is
skipped with a line saying why.

## Requirements

- **Function hooks enabled.** Installed mods only load with
  `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1` in Claude Code's environment (early
  access; the API may change between releases).
- **Team and Enterprise orgs:** the built-in `sec-default` mod forwards every
  `skill.prompt` past user-installed plugins, so this mod never sees one. An
  admin can set managed `"prependPlugins"` to a list that leaves
  `sec-default@builtin` out (e.g. `[]`), or that seats this plugin ahead of
  it.
- **Project augments need workspace trust.** Hooks modules don't load until
  a workspace's trust dialog is accepted, as with project skills and
  `CLAUDE.md`.

## Development

```sh
pnpm test        # claude plugin test, with function hooks enabled
pnpm typecheck   # needs .claude-plugin/types, written when Claude Code first loads the plugin
pnpm lint        # prettier, typecheck, claude plugin validate
```

Run it from source with
`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 claude --plugin-dir .`.

`$` is only followed by `claude plugin validate` into functions declared in
the same file, so everything that calls it lives in `hooks/register.ts`;
`hooks/parse.ts` is pure.
