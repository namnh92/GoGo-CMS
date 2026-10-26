import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GoGo-CMS#147. Contrast is measurable, so it belongs in a test rather than in
 * a reviewer's judgement.
 *
 * Every status badge failed at once and none of them looked broken: the tone on
 * its own `-soft` fill ran from 3.74 (danger) down to 2.24 (amber), on the
 * column an editor reads most. `--color-text-subtle` was 3.78 on the sunken
 * surface across 200-odd usages.
 */
const AA_TEXT = 4.5
const AA_NON_TEXT = 3
const TOKENS = readFileSync(path.resolve(__dirname, 'tokens.css'), 'utf8')
const UI = path.resolve(__dirname, '../shared/ui')

/** Resolves `var(--x)` aliases, so a semantic token is tested by what it points at. */
function hex(token: string): string {
  const match = new RegExp(`--${token}:\\s*(#[0-9a-fA-F]{6}|var\\(--([\\w-]+)\\))`).exec(TOKENS)
  if (!match) throw new Error(`--${token} is not a hex token in tokens.css`)
  return match[2] ? hex(match[2]) : match[1]!
}

/** The `bg-*` token a component class string fills with, e.g. `bg-accent-primary`. */
function fillOf(classes: string): string {
  const match = /(?:^|\s)bg-([a-z][\w-]*)(?=\s|$)/.exec(classes)
  if (!match) throw new Error(`no bg-* fill in "${classes}"`)
  return `color-${match[1]}`
}

function luminance(value: string): number {
  const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(value.slice(i, i + 2), 16) / 255))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

describe('token contrast', () => {
  it.each(['coral', 'lavender', 'mint', 'amber', 'danger'])(
    '%s badge text reads on its own soft fill',
    (tone) => {
      expect(contrast(hex(`color-${tone}-ink`), hex(`color-${tone}-soft`))).toBeGreaterThanOrEqual(
        AA_TEXT,
      )
    },
  )

  it.each([
    ['on white', 'color-neutral-0'],
    ['on the sunken surface', 'color-neutral-50'],
  ])('subtle text reads %s', (_label, surface) => {
    expect(contrast(hex('color-neutral-500'), hex(surface))).toBeGreaterThanOrEqual(AA_TEXT)
  })

  // GoGo-CMS#246: white on the brand coral is 4.09, and the primary CTA, the
  // active tab and 35 links used it. The suite only looked at -ink/-soft pairs.
  it.each([
    ['on white', 'color-surface'],
    ['on the muted surface', 'color-surface-muted'],
    ['on the sunken surface', 'color-surface-sunken'],
  ])('accent text and links read %s', (_label, surface) => {
    expect(contrast(hex('color-accent-primary'), hex(surface))).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it.each(['color-accent-primary', 'color-accent-pressed'])('text on the %s fill reads', (fill) => {
    expect(contrast(hex('color-text-on-accent'), hex(fill))).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('accent text reads on the accent soft fill', () => {
    expect(contrast(hex('color-accent-on-soft'), hex('color-accent-soft'))).toBeGreaterThanOrEqual(
      AA_TEXT,
    )
  })

  it.each(['color-surface', 'color-surface-sunken'])(
    'the focus ring is visible on %s',
    (surface) => {
      expect(contrast(hex('color-focus'), hex(surface))).toBeGreaterThanOrEqual(AA_NON_TEXT)
    },
  )

  it('the primary button fills with a colour white text reads on', () => {
    // Read from the component, not restated here: the bug was a correct token
    // set next to a button that used a different one.
    const button = readFileSync(path.join(UI, 'Button.tsx'), 'utf8')
    const primary = /primary:\s*'([^']+)'/.exec(button)?.[1]
    expect(primary, 'primary variant classes').toBeDefined()
    const fill = fillOf(primary!)
    expect(contrast(hex('color-text-on-accent'), hex(fill))).toBeGreaterThanOrEqual(AA_TEXT)
  })

  it('mirrors the mobile orange accent', () => {
    /* eslint-disable no-restricted-syntax */
    expect(hex('color-accent-primary').toLowerCase()).toBe('#ca381f')
    expect(hex('color-accent-pressed').toLowerCase()).toBe('#a72e19')
    expect(hex('color-accent-soft').toLowerCase()).toBe('#ffe3da')
    expect(hex('color-accent-on-soft').toLowerCase()).toBe('#a72e19')
    /* eslint-enable no-restricted-syntax */
  })

  it('keeps the mobile neutral ramp mirrored', () => {
    // The two repos share one palette by decision, not by coincidence: a value
    // that drifts here shows up as two products that look almost the same.
    //
    // These literals are the assertion itself — the rule that bans colour
    // literals exists to stop components inventing colours, and a test that
    // pins the palette to GoGo-MobileApp/src/shared/ui/tokens.ts is the
    // opposite of that.
    /* eslint-disable no-restricted-syntax */
    expect(hex('color-neutral-500').toLowerCase()).toBe('#746e68')
    expect(hex('color-neutral-700').toLowerCase()).toBe('#4a4641')
    expect(hex('color-neutral-900').toLowerCase()).toBe('#211f1c')
    /* eslint-enable no-restricted-syntax */
  })
})
