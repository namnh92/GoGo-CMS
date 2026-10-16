import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { matchRoutes } from 'react-router-dom'
import { router } from './routes'
import { routeTemplateOf } from '@/shared/observability/sentry'

/**
 * GoGo-CMS#241 — every screen yields a template the Sentry tag accepts, and a
 * real location never leaks its ids into it.
 */
describe('route templates of the real router', () => {
  it.each([
    ['/', '/'],
    ['/places', '/places'],
    ['/places/new', '/places/new'],
    ['/places/3f2504e0-4f89-11d3-9a0c-0305e82c3301', '/places/:id'],
    ['/costs/test-runs/42', '/costs/test-runs/:id'],
    ['/administrative-data/ds_2026', '/administrative-data/:datasetId'],
    ['/moderation/reviews/r-1', '/moderation/reviews/:reviewId'],
    ['/settings/accounts/new', '/settings/accounts/new'],
    ['/login', '/login'],
    ['/no/such/screen', '/*'],
  ])('%s → %s', (path, template) => {
    expect(routeTemplateOf(matchRoutes(router.routes, path) ?? [])).toBe(template)
  })
})

/** `main.tsx` runs `bootstrap()` on import, so its wiring is checked as source. */
describe('main.tsx route wiring', () => {
  const main = readFileSync(resolve(__dirname, '..', 'main.tsx'), 'utf8')

  it('sets the route at start and on every navigation, from route matches', () => {
    expect(main).toMatch(/setSentryRoute\(routeTemplateOf\(router\.state\.matches\)\)/)
    expect(main).toMatch(
      /router\.subscribe\(\(state\) => setSentryRoute\(routeTemplateOf\(state\.matches\)\)\)/,
    )
  })

  it('never feeds the tag from the location', () => {
    expect(main).not.toMatch(/setSentryRoute\([^)]*location/)
  })
})
