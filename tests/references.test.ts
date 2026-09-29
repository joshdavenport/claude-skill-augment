import { describe, expect, test } from 'claude-code/testing'

import { referencesIn, resolveReference } from '../hooks/references'

describe('referencesIn', () => {
  test('tokens after whitespace, in order, punctuation after them dropped', () => {
    expect(
      referencesIn('See @AUGMENT.md, then @./more/x.md; also @/abs/z.md.'),
    ).toEqual(['AUGMENT.md', './more/x.md', '/abs/z.md'])
    expect(referencesIn('@a.md leads')).toEqual(['a.md'])
  })

  test('an @ inside a word, as in an email, is not one', () => {
    expect(referencesIn('mail josh@example.com; npm @scope/pkg')).toEqual([
      'scope/pkg',
    ])
  })

  test('code spans and fenced blocks are not looked in', () => {
    expect(
      referencesIn(
        'Use `@a.md`.\n\n```md\n@b.md\n```\n\n~~~\n@c.md\n~~~\n\n@d.md',
      ),
    ).toEqual(['d.md'])
  })
})

describe('resolveReference', () => {
  const dir = '/Users/testuser/.claude/skills-augment/pack'

  test('from the folder, with . and .. folded', () => {
    expect(resolveReference('AUGMENT.md', dir, undefined)).toBe(
      `${dir}/AUGMENT.md`,
    )
    expect(resolveReference('./sub/../x.md', dir, undefined)).toBe(
      `${dir}/x.md`,
    )
    expect(resolveReference('../shared/y.md', dir, undefined)).toBe(
      '/Users/testuser/.claude/skills-augment/shared/y.md',
    )
  })

  test('~/ from home, nowhere without one', () => {
    expect(resolveReference('~/notes/z.md', dir, '/Users/testuser')).toBe(
      '/Users/testuser/notes/z.md',
    )
    expect(resolveReference('~/notes/z.md', dir, undefined)).toBeUndefined()
  })

  test('an absolute path as written', () => {
    expect(resolveReference('/etc/x.md', dir, '/Users/testuser')).toBe(
      '/etc/x.md',
    )
  })
})
