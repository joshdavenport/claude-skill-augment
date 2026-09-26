import type { FsEntry, On } from 'claude-code'
import { mock } from 'claude-code/testing'

// Not /home: on macOS that's an automount, which the engine's fs refuses to
// reach as a network location.
export const HOME = '/Users/testuser'

export const ROOT = '/work/app'

export const USER_DIR = `${HOME}/.claude/skills-augment`

export const PROJECT_DIR = `${ROOT}/.claude/skills-augment`

/**
 * What a test's session sees: files by absolute path, symlinks from their
 * path to their target, and where the session is rooted.
 */
export type Workspace = {
  files: Record<string, string>
  links?: Record<string, string>
  root?: string
}

/**
 * A session rooted at ROOT (or `root`) with HOME as its home, answering the
 * plugin's `fs` calls from memory, and the skill's own prompt as the text
 * handed in, every transcript line kept for the test to read.
 *
 * Files and links are keyed by their real path; folders are implied by the
 * paths beneath them, and a path through a link reads its target's. A
 * missing path rejects, as the engine's `fs` does.
 *
 * @param on the test's `on`
 * @param workspace the files, links and root
 * @returns the transcript lines the plugin logged, in order
 */
export function workspaceOf(
  on: On,
  { files, links = {}, root = ROOT }: Workspace,
): { lines: string[] } {
  const lines: string[] = []
  const paths = [...Object.keys(files), ...Object.keys(links)]
  const realOf = (path: string): string => {
    const link = Object.keys(links).find(
      link => path === link || path.startsWith(`${link}/`),
    )

    return link === undefined
      ? path
      : realOf(`${links[link]}${path.slice(link.length)}`)
  }
  const kindOf = (real: string) =>
    real in files
      ? ('file' as const)
      : paths.some(path => path.startsWith(`${real}/`))
        ? ('dir' as const)
        : undefined
  const missing = (path: string) =>
    Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' })

  mock.env(on, { HOME: HOME })
  on('session.root', () => ({ value: root }))
  on('skill.prompt', ($, e) => ({ text: e.text }))
  on('ui.log', ($, e) => {
    if (e.to === 'transcript') {
      lines.push(e.text)
    }

    return { value: undefined }
  })

  on('fs.stat', ($, e) => {
    const real = realOf(e.path)
    const kind = kindOf(real)

    if (kind === undefined) {
      throw missing(e.path)
    }

    return {
      value: {
        kind,
        size: 0,
        mtimeMs: 0,
        isLink: e.path in links,
        ...(e.resolve ? { realPath: real } : {}),
      },
    }
  })

  on('fs.list', ($, e) => {
    const real = realOf(e.path)

    if (kindOf(real) !== 'dir') {
      throw missing(e.path)
    }

    const names = new Set<string>()

    for (const path of paths) {
      const child = /^[^/]+/.exec(path.slice(`${real}/`.length))

      if (path.startsWith(`${real}/`) && child !== null) {
        names.add(child[0])
      }
    }

    const entries: FsEntry[] = [...names].sort().map(name => {
      const path = `${real}/${name}`
      const isLink = path in links

      return {
        name,
        kind: isLink ? 'other' : (kindOf(path) ?? 'other'),
        size: 0,
        isLink,
      }
    })

    return { value: entries }
  })

  on('fs.read', ($, e) => {
    const text = files[realOf(e.path)]

    if (text === undefined) {
      throw missing(e.path)
    }

    return { value: text }
  })

  return { lines }
}
