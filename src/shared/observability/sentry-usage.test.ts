import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

/*
 * ADR-0011 D-10 — only `src/shared/observability/sentry.ts` imports the SDK, so
 * every event goes through its `beforeSend` and `beforeBreadcrumb`. Tests in
 * this folder mock the SDK and are allowed to name it.
 */

const SRC = resolve(__dirname, '..', '..')
const ALLOWED = new Set([
  'shared/observability/sentry.ts',
  'shared/observability/sentry.test.ts',
  'shared/observability/sentry-perf.test.ts',
  'shared/observability/sentry-usage.test.ts',
])

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(?:ts|tsx)$/.test(name) ? [path] : []
  })
}

describe('Sentry SDK usage', () => {
  it('is imported by sentry.ts only', () => {
    const offenders = sources(SRC)
      .map((path) => relative(SRC, path).split('\\').join('/'))
      .filter((path) => !ALLOWED.has(path))
      .filter((path) => /['"]@sentry\//.test(readFileSync(join(SRC, path), 'utf8')))
    expect(offenders).toEqual([])
  })
})
