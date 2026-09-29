/**
 * The `@path` references in a markdown text, in order of appearance, as
 * written after the `@`: a token at the start of the text or after
 * whitespace, running to the next whitespace, with sentence punctuation
 * after it dropped. Code spans and fenced blocks are not looked in, as with
 * `CLAUDE.md` imports.
 *
 * @param text the markdown
 */
export function referencesIn(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, ' ')
  const references: string[] = []

  for (const match of prose.matchAll(/(?<=^|\s)@(\S+)/g)) {
    const reference = (match[1] ?? '').replace(/[.,;:!?)]+$/, '')

    if (reference !== '') {
      references.push(reference)
    }
  }

  return references
}

/**
 * Where a reference points: `~/` from the home directory, `/` as written,
 * anything else from the folder of the file holding it, with `.` and `..`
 * segments folded away.
 *
 * @param reference the path as written after the `@`
 * @param dir the folder of the file holding the reference
 * @param home the home directory, when known
 * @returns the absolute path, or undefined for a `~/` reference with no home
 */
export function resolveReference(
  reference: string,
  dir: string,
  home: string | undefined,
): string | undefined {
  const path = reference.startsWith('~/')
    ? home === undefined
      ? undefined
      : `${home}${reference.slice(1)}`
    : reference.startsWith('/')
      ? reference
      : `${dir}/${reference}`

  if (path === undefined) {
    return undefined
  }

  const segments: string[] = []

  for (const segment of path.split('/')) {
    if (segment === '..') {
      segments.pop()
    } else if (segment !== '.' && segment !== '') {
      segments.push(segment)
    }
  }

  return `/${segments.join('/')}`
}
