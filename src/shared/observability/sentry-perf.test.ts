import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { redactText } from './sentry'

/*
 * ADR-0011 C-16 — the oracle's `perf` rows: 100 kB adversarial inputs, each
 * bounded per call (1 000 ms on CI, 300 ms locally). A regression test against
 * known expensive patterns, not a proof of complexity; a new pattern adds a row
 * to the oracle, not here.
 */

vi.mock('@sentry/react', () => ({}))

type PerfCase = {
  id: string
  surface: string
  construct: { kind: 'repeat'; unit: string; size: number; prefix?: string; suffix?: string }
  boundMs: { ci: number; local: number }
}

const FIXTURE = resolve(__dirname, '__fixtures__/redaction-cases.v1.json')
const perf = (JSON.parse(readFileSync(FIXTURE, 'utf8')) as { cases: PerfCase[] }).cases.filter(
  (c) => c.surface === 'perf',
)

function build({ unit, size, prefix = '', suffix = '' }: PerfCase['construct']): string {
  return prefix + unit.repeat(Math.ceil(size / unit.length)).slice(0, size) + suffix
}

describe('redactText cost (oracle C-16)', () => {
  it('has the corpus', () => {
    expect(perf.length).toBeGreaterThanOrEqual(18)
  })

  it.each(perf.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(c.construct.kind).toBe('repeat')
    const input = build(c.construct)
    const bound = process.env.CI ? c.boundMs.ci : c.boundMs.local
    const started = performance.now()
    redactText(input)
    expect(performance.now() - started).toBeLessThanOrEqual(bound)
  })
})
