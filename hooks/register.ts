import type { EngineInterface, On } from 'claude-code'

import { type AugmentFile, type Position, parseAugmentFile } from './parse'

export const HINT = "Didn't expect this? Check the augmentation markdown."

const AUGMENT_DIR = 'skills-augment'

/**
 * Registers the `skill.prompt` hook: each time a skill's prompt is expanded
 * (`/name`, the Skill tool, a subagent's preload), the augmentation files
 * naming that skill add their text at its start or end, user files before
 * project files, each folder in path order. Every file applied, or skipped as
 * invalid, gets a transcript line.
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
    const matching = files.filter(file => file.skills.includes(e.skill))
    const shown = (path: string) =>
      home !== undefined && path.startsWith(`${home}/`)
        ? `~${path.slice(home.length)}`
        : path

    for (const file of matching) {
      if (file.kind === 'invalid') {
        $.ui.log(
          `Skipped augmentation ${shown(file.path)} for ${e.skill}: ${file.reason}`,
        )
      }
    }

    const augments = matching.filter(file => file.kind === 'augment')

    if (augments.length === 0) {
      return result
    }

    for (const augment of augments) {
      $.ui.log(`Augmented ${e.skill} with ${shown(augment.path)}`)
    }

    $.ui.log(HINT)

    const textsAt = (position: Position) =>
      augments
        .filter(augment => augment.position === position)
        .map(augment => augment.text)

    return {
      text: [...textsAt('start'), result.text, ...textsAt('end')].join('\n\n'),
    }
  })
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
): Promise<{ files: AugmentFile[]; home: string | undefined }> {
  const [home, profile, configDir, root] = await Promise.all([
    $.env.get('HOME'),
    $.env.get('USERPROFILE'),
    $.env.get('CLAUDE_CONFIG_DIR'),
    $.session.root(),
  ])
  const userHome = home ?? profile
  const userConfig =
    configDir ?? (userHome === undefined ? undefined : `${userHome}/.claude`)
  const dirs = [
    ...(userConfig === undefined ? [] : [`${userConfig}/${AUGMENT_DIR}`]),
    `${root}/.claude/${AUGMENT_DIR}`,
  ]
  const seen = new Set<string>()
  const paths: string[] = []

  for (const dir of dirs) {
    paths.push(...(await markdownPathsIn($, dir, seen)))
  }

  const files = await Promise.all(
    paths.map(path =>
      $.fs.read(path).then(
        source => parseAugmentFile(path, source),
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
