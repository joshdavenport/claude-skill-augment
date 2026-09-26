/**
 * Where an augmentation's text goes in the skill's prompt.
 */
export type Position = 'start' | 'end'

/**
 * One augmentation markdown file, read: either usable, or naming skills but
 * broken in a way worth telling the user about when one of them loads.
 */
export type AugmentFile =
  | {
      kind: 'augment'
      path: string
      skills: readonly string[]
      position: Position
      wrap: boolean
      text: string
    }
  | {
      kind: 'invalid'
      path: string
      skills: readonly string[]
      reason: string
    }

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Reads an augmentation file: YAML-ish frontmatter naming `skills` (qualified
 * names, `plugin:skill` for a plugin's), an optional `position` (`start` or
 * `end`, `end` when left out) and an optional `wrap` (`false` to add the body
 * bare, without its labelled tag), then the markdown body to add.
 *
 * Only the subset of YAML those keys need is understood: `key: value`, an
 * inline `[a, b]` list, a block `- a` list, quotes, and ` #` comments.
 *
 * @param path the file's path, carried through for logging
 * @param source the file's text
 * @returns the file read, or undefined when it isn't an augmentation file (no
 *   frontmatter, or no `skills`), so READMEs and notes beside augments are
 *   left alone
 */
export function parseAugmentFile(
  path: string,
  source: string,
): AugmentFile | undefined {
  const match = FRONTMATTER.exec(source)

  if (match === null) {
    return undefined
  }

  const fields = fieldsOf(match[1] ?? '')
  const skillsField = fields.get('skills')
  const skills =
    typeof skillsField === 'string' ? [skillsField] : (skillsField ?? [])

  if (skills.length === 0 || skills.some(skill => skill === '')) {
    return undefined
  }

  const position = fields.get('position') ?? 'end'

  if (position !== 'start' && position !== 'end') {
    return {
      kind: 'invalid',
      path,
      skills,
      reason: `position must be "start" or "end", not ${JSON.stringify(position)}`,
    }
  }

  const wrap = fields.get('wrap') ?? 'true'

  if (wrap !== 'true' && wrap !== 'false') {
    return {
      kind: 'invalid',
      path,
      skills,
      reason: `wrap must be true or false, not ${JSON.stringify(wrap)}`,
    }
  }

  const text = source.slice(match[0].length).trim()

  if (text === '') {
    return { kind: 'invalid', path, skills, reason: 'it has no text' }
  }

  return {
    kind: 'augment',
    path,
    skills,
    position,
    wrap: wrap === 'true',
    text,
  }
}

/**
 * The frontmatter's top-level keys: a scalar as a string, a list as strings.
 */
function fieldsOf(frontmatter: string): Map<string, string | string[]> {
  const fields = new Map<string, string | string[]>()
  let listKey: string | undefined

  for (const line of frontmatter.split(/\r?\n/)) {
    const item = /^\s+-\s*(.*)$/.exec(line)

    if (item !== null && listKey !== undefined) {
      const list = fields.get(listKey)

      if (Array.isArray(list)) {
        list.push(scalarOf(item[1] ?? ''))
      }

      continue
    }

    const pair = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line)
    listKey = undefined

    if (pair === null) {
      continue
    }

    const key = pair[1] ?? ''
    const value = withoutComment(pair[2] ?? '')
    const inline = /^\[(.*)\]$/.exec(value)

    if (inline !== null) {
      fields.set(
        key,
        (inline[1] ?? '')
          .split(',')
          .map(scalarOf)
          .filter(entry => entry !== ''),
      )
    } else if (value === '') {
      fields.set(key, [])
      listKey = key
    } else {
      fields.set(key, scalarOf(value))
    }
  }

  return fields
}

function scalarOf(raw: string): string {
  const value = withoutComment(raw)
  const quoted = /^(['"])(.*)\1$/.exec(value)

  return quoted === null ? value : (quoted[2] ?? '')
}

function withoutComment(raw: string): string {
  return raw.replace(/\s+#.*$/, '').trim()
}
