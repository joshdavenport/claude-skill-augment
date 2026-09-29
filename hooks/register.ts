import type { EngineInterface, On } from 'claude-code'

import {
  type AugmentFile,
  type Position,
  bodyOf,
  matchesSkill,
  parseAugmentFile,
} from './parse'
import { referencesIn, resolveReference } from './references'

export const HINT = "Didn't expect this? Check the augmentation markdown."

const AUGMENT_DIR = 'skills-augment'

/**
 * Which folder an augmentation file came from.
 */
type Source = 'user' | 'project'

type SourcedFile = AugmentFile & { source: Source }

/**
 * Registers the `skill.prompt` hook: each time a skill's prompt is expanded
 * (`/name`, the Skill tool, a subagent's preload), the augmentation files
 * naming that skill (by name or `*` pattern) add their text at its start or
 * end, user files before
 * project files, each folder in path order. Each file's text, followed by
 * the files it references with `@path` (withReferences), goes in its own
 * `<skill-augmentation>` tag (blockOf) unless it sets `wrap: false`. Every
 * file applied, or skipped as invalid, gets a transcript line, naming the
 * `*` pattern it matched by, if it wasn't the skill's own name.
 *
 * Files are read on every expansion, so edits apply without a restart.
 *
 * @param on the engine's registrar
 */
export function register(on: On): void {
  on('skill.prompt', async ($, e, next) => {
    const [result, { files, home }] = await Promise.all([
      next(e),
      augmentFilesOf($),
    ])
    const matching = files.flatMap(file => {
      const entry = file.skills.find(entry => matchesSkill(entry, e.skill))

      return entry === undefined ? [] : [{ ...file, entry }]
    })
    const shown = (path: string) =>
      home !== undefined && path.startsWith(`${home}/`)
        ? `~${path.slice(home.length)}`
        : path
    const via = (entry: string) =>
      entry.includes('*') ? ` (via ${entry})` : ''

    for (const file of matching) {
      if (file.kind === 'invalid') {
        $.ui.log(
          `Skipped augmentation ${shown(file.path)} for ${e.skill}${via(file.entry)}: ${file.reason}`,
        )
      }
    }

    const augments = matching.filter(file => file.kind === 'augment')

    if (augments.length === 0) {
      return result
    }

    for (const augment of augments) {
      $.ui.log(
        `Augmented ${e.skill} with ${shown(augment.path)}${via(augment.entry)}`,
      )
    }

    $.ui.log(HINT)

    const expanded = await Promise.all(
      augments.map(async augment => ({
        ...augment,
        text: await withReferences($, augment.path, augment.text, home, shown),
      })),
    )
    const textsAt = (position: Position) =>
      expanded
        .filter(augment => augment.position === position)
        .map(augment =>
          augment.wrap
            ? blockOf(
                e.skill,
                augment.source,
                shown(augment.path),
                augment.text,
              )
            : augment.text,
        )

    return {
      text: [...textsAt('start'), result.text, ...textsAt('end')].join('\n\n'),
    }
  })
}

/**
 * An augmentation's text in a tag of its own naming the skill it extends and
 * where it came from, with a line saying how it ranks against the skill.
 *
 * The tag marks where the addition ends, which matters at the end of a
 * prompt: the skill's text often closes with the user's `ARGUMENTS:`, and
 * bare text after it could read as more of them. The tag is not one of the
 * harness's own (`system-reminder`, `command-*`), so it doesn't pass for
 * Claude Code's text; the precedence line carries its meaning instead.
 *
 * @param skill the skill's qualified name
 * @param source the folder the file came from
 * @param path the file's path, as shown
 * @param text the file's body
 */
function blockOf(
  skill: string,
  source: Source,
  path: string,
  text: string,
): string {
  const attribute = (value: string) =>
    value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  const whose = source === 'user' ? "the user's" : "this project's"

  return [
    `<skill-augmentation skill="${attribute(skill)}" source="${source}" path="${attribute(path)}">`,
    `Additions to the ${skill} skill from ${whose} skill augmentations. ` +
      'Follow them alongside the skill; where they conflict, these take ' +
      'precedence.',
    '',
    text,
    '</skill-augmentation>',
  ].join('\n')
}

/**
 * An augmentation's text followed by the contents of each file it references
 * with `@path` (referencesIn), each under a line naming the file and the one
 * that referenced it, so the model can tie the `@` token, left in place, to
 * the text that answers it. References are followed depth first, from the
 * folder of the file holding them; a file is included once, body only
 * (bodyOf), the augment itself never; one that can't be read is skipped
 * with a debug line.
 *
 * @param $ the engine, as the hook holds it
 * @param path the augmentation file's path
 * @param text its body
 * @param home the home directory, for `~/` references
 * @param shown how to display a path
 */
async function withReferences(
  $: EngineInterface,
  path: string,
  text: string,
  home: string | undefined,
  shown: (path: string) => string,
): Promise<string> {
  const seen = new Set<string>([path])
  const blocks: string[] = []
  const nameOf = (file: string) => file.slice(file.lastIndexOf('/') + 1)
  const visit = async (from: string, body: string): Promise<void> => {
    for (const reference of referencesIn(body)) {
      const target = resolveReference(
        reference,
        from.slice(0, from.lastIndexOf('/')),
        home,
      )

      if (target === undefined || seen.has(target)) {
        continue
      }

      seen.add(target)

      const contents = await $.fs.read(target).then(bodyOf, () => undefined)

      if (contents === undefined) {
        $.ui.log(`could not read @${reference} from ${from}`, { to: 'debug' })

        continue
      }

      blocks.push(
        `Contents of ${shown(target)} (referenced from ${nameOf(from)}):\n\n${contents}`,
      )
      await visit(target, contents)
    }
  }

  await visit(path, text)

  return [text, ...blocks].join('\n\n')
}

/**
 * Every augmentation file in scope for this session, the user's before the
 * project's, each folder walked in name order.
 *
 * The user's folder is `skills-augment` in the Claude config directory
 * (`CLAUDE_CONFIG_DIR`, else `~/.claude`); the project's is
 * `<root>/.claude/skills-augment`. A folder seen twice (the session rooted at
 * home, a symlink back into a folder already walked) is walked once.
 *
 * @param $ the engine, as the hook holds it
 * @returns the augmentation files found (unreadable folders and files are
 *   skipped), and the home directory, for displaying their paths
 */
async function augmentFilesOf(
  $: EngineInterface,
): Promise<{ files: SourcedFile[]; home: string | undefined }> {
  const [home, profile, configDir, root] = await Promise.all([
    $.env.get('HOME'),
    $.env.get('USERPROFILE'),
    $.env.get('CLAUDE_CONFIG_DIR'),
    $.session.root(),
  ])
  const userHome = home ?? profile
  const userConfig =
    configDir ?? (userHome === undefined ? undefined : `${userHome}/.claude`)
  const dirs: { dir: string; source: Source }[] = [
    ...(userConfig === undefined
      ? []
      : [{ dir: `${userConfig}/${AUGMENT_DIR}`, source: 'user' as const }]),
    { dir: `${root}/.claude/${AUGMENT_DIR}`, source: 'project' },
  ]
  const seen = new Set<string>()
  const paths: { path: string; source: Source }[] = []

  for (const { dir, source } of dirs) {
    for (const path of await markdownPathsIn($, dir, seen)) {
      paths.push({ path, source })
    }
  }

  const files = await Promise.all(
    paths.map(({ path, source }) =>
      $.fs.read(path).then(
        text => {
          const file = parseAugmentFile(path, text)

          return file === undefined ? undefined : { ...file, source }
        },
        () => {
          $.ui.log(`could not read ${path}`, { to: 'debug' })

          return undefined
        },
      ),
    ),
  )

  return { files: files.filter(file => file !== undefined), home: userHome }
}

/**
 * The `.md` files under `dir`, recursively and in name order, following
 * symlinks; dot-prefixed entries are skipped.
 *
 * @param $ the engine, as the hook holds it
 * @param dir the folder to walk; a missing one has none
 * @param seen real paths of folders already walked, so none is walked twice
 */
async function markdownPathsIn(
  $: EngineInterface,
  dir: string,
  seen: Set<string>,
): Promise<string[]> {
  const real = await $.fs.stat(dir, { resolve: true }).then(
    stat => (stat.kind === 'dir' ? stat.realPath : undefined),
    () => undefined,
  )

  if (real === undefined || seen.has(real)) {
    return []
  }

  seen.add(real)

  const entries = await $.fs.list(dir).catch(() => [])
  const paths: string[] = []

  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue
    }

    const path = `${dir}/${entry.name}`
    const kind = entry.isLink
      ? await $.fs.stat(path).then(
          stat => stat.kind,
          () => undefined,
        )
      : entry.kind

    if (kind === 'dir') {
      paths.push(...(await markdownPathsIn($, path, seen)))
    } else if (kind === 'file' && entry.name.endsWith('.md')) {
      paths.push(path)
    }
  }

  return paths
}
