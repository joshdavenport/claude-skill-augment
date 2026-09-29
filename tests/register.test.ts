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

/**
 * An augmentation file's source; each option left out is left out of its
 * frontmatter too.
 */
const augmentOf = (
  text: string,
  {
    skill = SKILL,
    position,
    wrap,
    once,
  }: { skill?: string; position?: string; wrap?: boolean; once?: boolean } = {},
) =>
  [
    '---',
    `skills: [${skill}]`,
    ...(position === undefined ? [] : [`position: ${position}`]),
    ...(wrap === undefined ? [] : [`wrap: ${wrap}`]),
    ...(once === undefined ? [] : [`once: ${once}`]),
    '---',
    text,
  ].join('\n')

/**
 * Tests about which files apply, and in what order, add them bare, so the
 * text reads plainly; the tag has tests of its own.
 */
const bareOf = (text: string, position?: string) =>
  augmentOf(text, { position, wrap: false })

describe('register', () => {
  test('a user augment is appended in its tag and announced', async ($, on) => {
    const { lines } = workspaceOf(on, {
      files: { [`${USER_DIR}/house/tdd.md`]: augmentOf('Use vitest.') },
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(
      `${PROMPT}\n\n` +
        `<skill-augmentation skill="${SKILL}" source="user" path="~/.claude/skills-augment/house/tdd.md">\n` +
        `Additions to the ${SKILL} skill from the user's skill augmentations. ` +
        'Follow them alongside the skill; where they conflict, these take precedence.\n' +
        '\n' +
        'Use vitest.\n' +
        '</skill-augmentation>',
    )
    expect(lines).toEqual([
      `Augmented ${SKILL} with ~/.claude/skills-augment/house/tdd.md`,
      HINT,
    ])
  })

  test('a project augment is prepended in its tag', async ($, on) => {
    workspaceOf(on, {
      files: {
        [`${PROJECT_DIR}/tdd.md`]: augmentOf('Say "hi" & go.', {
          position: 'start',
        }),
      },
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(
      `<skill-augmentation skill="${SKILL}" source="project" path="${PROJECT_DIR}/tdd.md">\n` +
        `Additions to the ${SKILL} skill from this project's skill augmentations. ` +
        'Follow them alongside the skill; where they conflict, these take precedence.\n' +
        '\n' +
        'Say "hi" & go.\n' +
        '</skill-augmentation>\n\n' +
        PROMPT,
    )
  })

  test('wrap: false adds the text bare', async ($, on) => {
    workspaceOf(on, {
      files: { [`${USER_DIR}/tdd.md`]: bareOf('Use vitest.') },
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(`${PROMPT}\n\nUse vitest.`)
  })

  test('user augments come before project ones, at both ends', async ($, on) => {
    const { lines } = workspaceOf(on, {
      files: {
        [`${USER_DIR}/a.md`]: bareOf('user start', 'start'),
        [`${USER_DIR}/b.md`]: bareOf('user end', 'end'),
        [`${PROJECT_DIR}/a.md`]: bareOf('project start', 'start'),
        [`${PROJECT_DIR}/b.md`]: bareOf('project end'),
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
        [`${USER_DIR}/pack/commit.md`]: augmentOf('No.', { skill: 'commit' }),
        [`${USER_DIR}/pack/notes.txt`]: bareOf('Not markdown.'),
        [`${USER_DIR}/pack/tdd.md`]: bareOf('Yes.'),
        [`${USER_DIR}/.draft/tdd.md`]: bareOf('Draft.'),
      },
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(`${PROMPT}\n\nYes.`)
    expect(lines).toEqual([
      `Augmented ${SKILL} with ~/.claude/skills-augment/pack/tdd.md`,
      HINT,
    ])
  })

  test('a wildcard applies to each skill it matches, saying which', async ($, on) => {
    const { lines } = workspaceOf(on, {
      files: {
        [`${USER_DIR}/all.md`]: augmentOf('Body', {
          skill: '*',
          position: 'top',
        }),
        [`${USER_DIR}/plugin.md`]: augmentOf('Plugin-wide.', {
          skill: 'mattpocock-skills:*',
        }),
      },
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toContain(
      `<skill-augmentation skill="${SKILL}" source="user" path="~/.claude/skills-augment/plugin.md">`,
    )
    expect(text).toContain('Plugin-wide.')
    expect(await $.skill.prompt({ skill: 'commit', text: PROMPT })).toEqual({
      text: PROMPT,
    })
    expect(lines).toEqual([
      `Skipped augmentation ~/.claude/skills-augment/all.md for ${SKILL} (via *): ` +
        'position must be "start" or "end", not "top"',
      `Augmented ${SKILL} with ~/.claude/skills-augment/plugin.md (via mattpocock-skills:*)`,
      HINT,
      'Skipped augmentation ~/.claude/skills-augment/all.md for commit (via *): ' +
        'position must be "start" or "end", not "top"',
    ])
  })

  test('an @reference follows the text inside the tag, under a header', async ($, on) => {
    const dir = `${USER_DIR}/implement-guidance`

    workspaceOf(on, {
      files: {
        [`${dir}/asana-github.md`]: augmentOf(
          'Follow the guidance in @AUGMENT.md',
          { skill: 'asana-github' },
        ),
        [`${dir}/AUGMENT.md`]: '## Project procedure\n\nDo the thing.\n',
      },
    })

    const { text } = await $.skill.prompt({
      skill: 'asana-github',
      text: PROMPT,
    })

    expect(text).toBe(
      `${PROMPT}\n\n` +
        '<skill-augmentation skill="asana-github" source="user" path="~/.claude/skills-augment/implement-guidance/asana-github.md">\n' +
        "Additions to the asana-github skill from the user's skill augmentations. " +
        'Follow them alongside the skill; where they conflict, these take precedence.\n' +
        '\n' +
        'Follow the guidance in @AUGMENT.md\n' +
        '\n' +
        'Contents of ~/.claude/skills-augment/implement-guidance/AUGMENT.md (referenced from asana-github.md):\n' +
        '\n' +
        '## Project procedure\n' +
        '\n' +
        'Do the thing.\n' +
        '</skill-augmentation>',
    )
  })

  test('references nest from their own folder, bodies only, each file once', async ($, on) => {
    const { lines } = workspaceOf(on, {
      files: {
        [`${USER_DIR}/tdd.md`]: bareOf(
          'Top: @shared/a.md and @missing.md, not `@shared/c.md`.',
        ),
        [`${USER_DIR}/shared/a.md`]:
          'A: @b.md, @../tdd.md, @~/.claude/skills-augment/shared/b.md',
        [`${USER_DIR}/shared/b.md`]: '---\ntitle: b\n---\nB.',
        [`${USER_DIR}/shared/c.md`]: 'C.',
      },
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(
      [
        PROMPT,
        'Top: @shared/a.md and @missing.md, not `@shared/c.md`.',
        'Contents of ~/.claude/skills-augment/shared/a.md (referenced from tdd.md):\n' +
          '\n' +
          'A: @b.md, @../tdd.md, @~/.claude/skills-augment/shared/b.md',
        'Contents of ~/.claude/skills-augment/shared/b.md (referenced from a.md):\n' +
          '\n' +
          'B.',
      ].join('\n\n'),
    )
    expect(lines).toEqual([
      `Augmented ${SKILL} with ~/.claude/skills-augment/tdd.md`,
      HINT,
    ])
  })

  test('a once file applies on its first match a session, then is skipped', async ($, on) => {
    const { lines, nextSession } = workspaceOf(on, {
      files: {
        [`${USER_DIR}/each.md`]: bareOf('Each time.'),
        [`${USER_DIR}/once.md`]: augmentOf('One time.', {
          skill: 'mattpocock-skills:*',
          wrap: false,
          once: true,
        }),
      },
    })
    const load = async (skill: string) =>
      (await $.skill.prompt({ skill, text: PROMPT })).text

    expect(await load(SKILL)).toBe(`${PROMPT}\n\nEach time.\n\nOne time.`)
    expect(await load(SKILL)).toBe(`${PROMPT}\n\nEach time.`)
    expect(await load('mattpocock-skills:code-review')).toBe(PROMPT)
    nextSession()
    expect(await load(SKILL)).toBe(`${PROMPT}\n\nEach time.\n\nOne time.`)
    expect(lines).toEqual([
      `Augmented ${SKILL} with ~/.claude/skills-augment/each.md`,
      `Augmented ${SKILL} with ~/.claude/skills-augment/once.md (via mattpocock-skills:*)`,
      HINT,
      `Skipped augmentation ~/.claude/skills-augment/once.md for ${SKILL} (via mattpocock-skills:*): ` +
        'once, applied earlier this session',
      `Augmented ${SKILL} with ~/.claude/skills-augment/each.md`,
      HINT,
      'Skipped augmentation ~/.claude/skills-augment/once.md for mattpocock-skills:code-review (via mattpocock-skills:*): ' +
        'once, applied earlier this session',
      `Augmented ${SKILL} with ~/.claude/skills-augment/each.md`,
      `Augmented ${SKILL} with ~/.claude/skills-augment/once.md (via mattpocock-skills:*)`,
      HINT,
    ])
  })

  test('compaction of the conversation lets a once file apply again', async ($, on) => {
    const { lines } = workspaceOf(on, {
      files: {
        [`${USER_DIR}/once.md`]: augmentOf('One time.', {
          wrap: false,
          once: true,
        }),
      },
    })
    const load = async () =>
      (await $.skill.prompt({ skill: SKILL, text: PROMPT })).text
    const messages = [{ role: 'user' as const, text: 'Hi.', toolUses: [] }]

    expect(await load()).toBe(`${PROMPT}\n\nOne time.`)
    await $.session.compact({ trigger: 'auto', agentId: 'sub', messages })
    await $.session.compact({ trigger: 'precompute', messages })
    expect(await load()).toBe(PROMPT)
    await $.session.compact({ trigger: 'auto', messages })
    expect(await load()).toBe(`${PROMPT}\n\nOne time.`)
    expect(lines).toEqual([
      `Augmented ${SKILL} with ~/.claude/skills-augment/once.md`,
      HINT,
      `Skipped augmentation ~/.claude/skills-augment/once.md for ${SKILL}: ` +
        'once, applied earlier this session',
      `Augmented ${SKILL} with ~/.claude/skills-augment/once.md`,
      HINT,
    ])
  })

  test('a session rooted at home applies the user folder once', async ($, on) => {
    workspaceOf(on, {
      files: { [`${USER_DIR}/tdd.md`]: bareOf('Once.') },
      root: HOME,
    })

    const { text } = await $.skill.prompt({ skill: SKILL, text: PROMPT })

    expect(text).toBe(`${PROMPT}\n\nOnce.`)
  })

  test('a symlinked folder is followed, a loop walked once', async ($, on) => {
    const shared = '/shared/team-augments'

    workspaceOf(on, {
      files: { [`${shared}/tdd.md`]: bareOf('Team rule.') },
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
      files: {
        [`${PROJECT_DIR}/tdd.md`]: augmentOf('Body', { position: 'top' }),
      },
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
