import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GoGo-CMS#247. A colour utility naming a token that does not exist compiles
 * to nothing: Tailwind emits no rule, the build stays green, and the element
 * silently loses its fill or border. `border-border bg-surface-subtle` left the
 * place editor's administrative panel bare, and nothing said so.
 *
 * So every colour utility in a source string must resolve to a `--color-*`
 * token in `tokens.css`. A class from Tailwind's default palette
 * (`bg-neutral-400`) is caught too: it renders, but in a grey the design system
 * does not have.
 */
const SRC = path.resolve(__dirname, '..')
const TOKENS = readFileSync(path.resolve(__dirname, 'tokens.css'), 'utf8')
const COLORS = new Set([...TOKENS.matchAll(/--color-([a-z0-9-]+)\s*:/g)].map((m) => m[1]!))
/** The named type scale (`--text-body`), which shares the `text-` prefix with colours. */
const TEXT_SIZES = new Set([...TOKENS.matchAll(/--text-([a-z]+)\s*:/g)].map((m) => m[1]!))

/** CSS keywords that are colours without being tokens. */
const KEYWORD_COLORS = new Set(['transparent', 'current', 'inherit'])

/**
 * Suffixes of the same prefixes that are not colours at all. Numeric suffixes
 * (`border-2`, `text-2xl`) and arbitrary values (`text-caption`) never reach
 * the check — it only looks at suffixes that start with a letter.
 */
const NOT_A_COLOR: Record<string, RegExp> = {
  text: /^(xs|sm|base|lg|xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/,
  bg: /^(fixed|local|scroll|clip-.+|origin-.+|repeat|no-repeat|repeat-[xy]|repeat-round|repeat-space|cover|contain|auto|center|top|bottom|left|right|(left|right)-(top|bottom)|linear-.+|gradient-.+|radial|conic|none|blend-.+)$/,
  border: /^(solid|dashed|dotted|double|none|hidden|collapse|separate|spacing-.+)$/,
  divide: /^(solid|dashed|dotted|double|none|[xy]|[xy]-reverse)$/,
  ring: /^(inset|offset-.+)$/,
  outline: /^(none|hidden|solid|dashed|dotted|double|offset-.+)$/,
  shadow: /^(xs|sm|md|lg|xl|inner|none)$/,
  decoration: /^(solid|double|dotted|dashed|wavy|auto|from-font|clone|slice)$/,
  fill: /^none$/,
  stroke: /^none$/,
  accent: /^auto$/,
  caret: /^auto$/,
}

const UTILITY =
  /(?<![\w-])(?:[a-z0-9-]+:)*(bg|text|border|divide|ring|outline|shadow|decoration|fill|stroke|accent|caret|placeholder|from|via|to)-([a-z][a-z0-9-]*)(?:\/\d+)?(?![\w-])/g

/** A side (`border-l-…`, `border-x-…`) is a position, not part of the colour. */
function colourPart(prefix: string, suffix: string): string | null {
  let rest = suffix
  if (prefix === 'border') {
    const side = /^(t|r|b|l|x|y|s|e)(?:-(.+))?$/.exec(rest)
    if (side) {
      if (!side[2]) return null
      rest = side[2]
    }
  }
  if (NOT_A_COLOR[prefix]?.test(rest)) return null
  if (prefix === 'text' && TEXT_SIZES.has(rest)) return null
  if (/^\d/.test(rest)) return null
  return rest
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    if (!/\.tsx?$/.test(name) || /\.d\.ts$/.test(name) || /\.test\.tsx?$/.test(name)) return []
    return [full]
  })
}

/** Every colour utility in a string literal whose colour is not a token. */
function unknownColourClasses(source: string): string[] {
  const found: string[] = []
  for (const literal of source.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g)) {
    for (const match of literal[0].matchAll(UTILITY)) {
      const colour = colourPart(match[1]!, match[2]!)
      if (colour === null || COLORS.has(colour) || KEYWORD_COLORS.has(colour)) continue
      found.push(match[0])
    }
  }
  return found
}

describe('colour classes resolve to tokens (#247)', () => {
  it('reads the tokens it checks against', () => {
    // Guards the guard: an empty set would flag everything, a wrong regex nothing.
    expect(COLORS.has('line')).toBe(true)
    expect(COLORS.has('surface-canvas')).toBe(true)
    expect(TEXT_SIZES.has('body')).toBe(true)
  })

  it('recognises what it is meant to catch, and only that', () => {
    expect(unknownColourClasses(`'rounded-lg border border-border bg-surface-sunken p-3'`)).toEqual(
      ['border-border', 'bg-surface-sunken'],
    )
    // #248: the names the shared vocabulary replaced are gone, not aliased.
    expect(unknownColourClasses(`'bg-surface text-text text-text-subtle'`)).toEqual([
      'bg-surface',
      'text-text',
      'text-text-subtle',
    ])
    expect(unknownColourClasses(`'text-caption text-body text-hero text-text-primary'`)).toEqual([])
    expect(
      unknownColourClasses(
        `'border-b-2 border-l-danger text-xs text-text-muted hover:bg-danger-soft/40 bg-transparent'`,
      ),
    ).toEqual([])
    expect(unknownColourClasses(`'bg-neutral-400'`)).toEqual(['bg-neutral-400'])
  })

  it('finds no colour utility naming a token tokens.css does not define', () => {
    const offenders = sourceFiles(SRC).flatMap((file) =>
      unknownColourClasses(readFileSync(file, 'utf8')).map(
        (cls) => `${path.relative(SRC, file)}: ${cls}`,
      ),
    )
    expect(offenders).toEqual([])
  })
})
