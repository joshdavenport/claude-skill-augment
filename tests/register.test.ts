import { describe, expect, test } from 'claude-code/testing'

import { HINT } from '../hooks/register'
import {
  HOME,
  PROJECT_DIR,
  USER_DIR,
  workspaceOf,
} from './fixtures/workspace-of'

const SKILL = 'mattpocock-skills:tdd'

const PROMPT = 'Base directory for this skill: /skills/tdd\n\n# TDD'

const augmentOf = (text: string, position?: string, skill = SKILL) =>
  [
    '---',
    `skills: [${skill}]`,
    ...(position === undefined ? [] : [`position: ${position}`]),
    '---',
    text,
  ].join('\n')

describe('register', () => {
  test('a user augment is appended and announced', async ($, on) => {
    const { lines } = workspaceOf(on, {
      files: { [`${USER_DIR}/house/tdd.md`]: augmentOf('Use vitest.') },
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(`${PROMPT}\n\nUse vitest.`)
    expect(lines).toEqual([
      `Augmented ${SKILL} with ~/.claude/skills-augment/house/tdd.md`,
      HINT,
    ])
  })

  test('user augments come before project ones, at both ends', async ($, on) => {
    const { lines } = workspaceOf(on, {
      files: {
        [`${USER_DIR}/a.md`]: augmentOf('user start', 'start'),
        [`${USER_DIR}/b.md`]: augmentOf('user end', 'end'),
        [`${PROJECT_DIR}/a.md`]: augmentOf('project start', 'start'),
        [`${PROJECT_DIR}/b.md`]: augmentOf('project end'),
      },
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(
      ['user start', 'project start', PROMPT, 'user end', 'project end'].join(
        '\n\n',
      ),
    )
    expect(lines).toEqual([
      `Augmented ${SKILL} with ~/.claude/skills-augment/a.md`,
      `Augmented ${SKILL} with ~/.claude/skills-augment/b.md`,
      `Augmented ${SKILL} with ${PROJECT_DIR}/a.md`,
      `Augmented ${SKILL} with ${PROJECT_DIR}/b.md`,
      HINT,
    ])
  })

  test('other skills, READMEs and dotfiles are left alone', async ($, on) => {
    const { lines } = workspaceOf(on, {
      files: {
        [`${USER_DIR}/pack/README.md`]: '# My augments\n',
        [`${USER_DIR}/pack/commit.md`]: augmentOf('No.', 'end', 'commit'),
        [`${USER_DIR}/pack/notes.txt`]: augmentOf('Not markdown.'),
        [`${USER_DIR}/pack/tdd.md`]: augmentOf('Yes.'),
        [`${USER_DIR}/.draft/tdd.md`]: augmentOf('Draft.'),
      },
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(`${PROMPT}\n\nYes.`)
    expect(lines).toEqual([
      `Augmented ${SKILL} with ~/.claude/skills-augment/pack/tdd.md`,
      HINT,
    ])
  })

  test('a session rooted at home applies the user folder once', async ($, on) => {
    workspaceOf(on, {
      files: { [`${USER_DIR}/tdd.md`]: augmentOf('Once.') },
      root: HOME,
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(`${PROMPT}\n\nOnce.`)
  })

  test('a symlinked folder is followed, a loop walked once', async ($, on) => {
    const shared = '/shared/team-augments'

    workspaceOf(on, {
      files: { [`${shared}/tdd.md`]: augmentOf('Team rule.') },
      links: {
        [`${USER_DIR}/team`]: shared,
        [`${shared}/loop`]: shared,
      },
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(`${PROMPT}\n\nTeam rule.`)
  })

  test('an invalid augment for the skill is skipped and said', async ($, on) => {
    const { lines } = workspaceOf(on, {
      files: { [`${PROJECT_DIR}/tdd.md`]: augmentOf('Body', 'top') },
    })

    expect(await $.skill.prompt({ skill: SKILL, text: PROMPT })).toEqual({
      text: PROMPT,
    })
    expect(lines).toEqual([
      `Skipped augmentation ${PROJECT_DIR}/tdd.md for ${SKILL}: ` +
        'position must be "start" or "end", not "top"',
    ])
  })

  test('with no augment folders the prompt passes through', async ($, on) => {
    const { lines } = workspaceOf(on, { files: {} })

    expect(await $.skill.prompt({ skill: SKILL, text: PROMPT })).toEqual({
      text: PROMPT,
    })
    expect(lines).toEqual([])
  })
})
