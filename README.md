# skill-augment

A Claude Code mod that adds your own text to the prompts of skills you can't
practically edit, such as those shipped in plugins.

## Install

```sh
claude plugin marketplace add joshdavenport/claude-skill-augment
claude plugin install skill-augment@claude-skill-augment
```

Then turn on function hooks (see [Requirements](#requirements)), e.g. in
`~/.claude/settings.json`:

```json
{ "env": { "CLAUDE_CODE_ENABLE_FUNCTION_HOOKS": "1" } }
```

To run a local checkout instead, link it into your skills folder, where
Claude Code loads it as `skill-augment@skills-dir`:

```sh
ln -s /path/to/claude-skill-augment ~/.claude/skills/skill-augment
```

## Augmentation files

Markdown files, anywhere under either folder (subfolders are for your own
organisation, or for dropping in a shared set, symlinks followed):

- `~/.claude/skills-augment/` (or `$CLAUDE_CONFIG_DIR/skills-augment/`)
- `<project>/.claude/skills-augment/`

```md
---
skills: [mattpocock-skills:tdd, mattpocock-skills:code-review]
position: end # start | end, default end
wrap: true # false adds the text without its tag, default true
---

Use pnpm and vitest.
```

- `skills` takes qualified names, as the Skill tool lists them:
  `plugin:skill` for a plugin's skill, the bare name for your own. In an
  entry, `*` stands for any run of characters, `:` included:
  `mattpocock-skills:*` for a whole plugin, `asana-*`, `*react*`,
  `*-design`, or `"*"` for every skill (quotes are optional here; YAML
  proper wants them on an entry starting with `*`).
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

Each file's text goes in a tag of its own, saying which skill it extends,
where it came from, and how it ranks against the skill:

```
<skill-augmentation skill="mattpocock-skills:tdd" source="user" path="~/.claude/skills-augment/house/tdd.md">
Additions to the mattpocock-skills:tdd skill from the user's skill augmentations. Follow them alongside the skill; where they conflict, these take precedence.

Use pnpm and vitest.
</skill-augmentation>
```

The tag marks where the addition ends, which matters at the end: a skill's
text often closes with the user's `ARGUMENTS:`, and bare text after it can
read as more of them. Set `wrap: false` to add a file's text as written.

A file can pull in another with `@path` (relative to it, `~/`, or absolute),
as `CLAUDE.md` imports do. The token stays as written, and the referenced
file's contents follow inside the same tag, under a line naming both files,
so the model can tie the two together and re-read the file if it needs to:

```
Use pnpm and vitest, following @house-style.md.

Contents of ~/.claude/skills-augment/house/house-style.md (referenced from tdd.md):

## House style
…
```

References nest, each file included once, its frontmatter (if any) left
off; one that can't be read is skipped; code spans and fenced blocks
aren't looked in.

Each applied file gets a transcript line, followed by a hint:

```
Augmented mattpocock-skills:tdd with ~/.claude/skills-augment/house/tdd.md
Augmented mattpocock-skills:tdd with ~/.claude/skills-augment/all.md (via *)
Didn't expect this? Check the augmentation markdown.
```

A file naming the skill but broken (an unknown `position` or `wrap`, no body) is
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
`hooks/parse.ts` and `hooks/references.ts` are pure.
