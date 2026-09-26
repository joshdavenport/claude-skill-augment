import { describe, expect, test } from 'claude-code/testing'

import { parseAugmentFile } from '../hooks/parse'

const PATH = '/augments/tdd.md'

describe('parse', () => {
  test('an inline list, a start position and the body', () => {
    const source = [
      '---',
      'skills: [mattpocock-skills:tdd, "mattpocock-skills:code-review"]',
      'position: start # before the skill',
      '---',
      '',
      'Use vitest.',
      '',
    ].join('\n')

    expect(parseAugmentFile(PATH, source)).toEqual({
      kind: 'augment',
      path: PATH,
      skills: ['mattpocock-skills:tdd', 'mattpocock-skills:code-review'],
      position: 'start',
      wrap: true,
      text: 'Use vitest.',
    })
  })

  test('a block list over CRLF, position defaulting to end', () => {
    const source = '---\r\nskills:\r\n  - a:b\r\n  - c\r\n---\r\nBody\r\n'

    expect(parseAugmentFile(PATH, source)).toEqual({
      kind: 'augment',
      path: PATH,
      skills: ['a:b', 'c'],
      position: 'end',
      wrap: true,
      text: 'Body',
    })
  })

  test('a single skill as a scalar', () => {
    expect(
      parseAugmentFile(PATH, "---\nskills: 'commit'\n---\nBody"),
    ).toMatchObject({ kind: 'augment', skills: ['commit'] })
  })

  test('wrap: false turns the tag off', () => {
    expect(
      parseAugmentFile(PATH, '---\nskills: [a]\nwrap: false\n---\nBody'),
    ).toMatchObject({ kind: 'augment', wrap: false })
  })

  test('files without frontmatter or skills are not augments', () => {
    expect(parseAugmentFile(PATH, '# README\n\nSome notes.')).toBeUndefined()
    expect(
      parseAugmentFile(PATH, '---\ntitle: notes\n---\nBody'),
    ).toBeUndefined()
    expect(parseAugmentFile(PATH, '---\nskills: []\n---\nBody')).toBeUndefined()
  })

  test('an unknown position or wrap, or an empty body, is invalid', () => {
    expect(
      parseAugmentFile(PATH, '---\nskills: [a]\nposition: middle\n---\nBody'),
    ).toEqual({
      kind: 'invalid',
      path: PATH,
      skills: ['a'],
      reason: 'position must be "start" or "end", not "middle"',
    })
    expect(
      parseAugmentFile(PATH, '---\nskills: [a]\nwrap: no\n---\nBody'),
    ).toEqual({
      kind: 'invalid',
      path: PATH,
      skills: ['a'],
      reason: 'wrap must be true or false, not "no"',
    })
    expect(parseAugmentFile(PATH, '---\nskills: [a]\n---\n\n')).toEqual({
      kind: 'invalid',
      path: PATH,
      skills: ['a'],
      reason: 'it has no text',
    })
  })
})
