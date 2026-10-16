import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { RouteObject } from 'react-router-dom'
import { matchRoutes } from 'react-router-dom'
import { router } from './routes'
import {
  asRouteTemplate,
  beforeSend,
  routeTemplateOf,
  trackSentryRoute,
} from '@/shared/observability/sentry'

/**
 * GoGo-CMS#241 — every screen of the real router yields a template the Sentry
 * tag accepts, and a real location never leaks its ids into it.
 */

/** Every leaf of the route tree with the definitions above it, index and pathless branches included. */
function leaves(routes: readonly RouteObject[], above: string[] = []): string[][] {
  return routes.flatMap((route) => {
    const chain = [...above, route.path ?? '']
    return route.children?.length ? leaves(route.children, chain) : [chain]
  })
}

describe('route templates of the real router', () => {
  const all = leaves(router.routes)

  it('has the screens it is expected to have', () => {
    expect(all.length).toBeGreaterThan(40)
  })

  it.each(all.map((chain) => [chain.filter(Boolean).join(' > ') || '(root)', chain] as const))(
    '%s is a template the tag accepts',
    (_name, chain) => {
      const template = routeTemplateOf(chain.map((path) => ({ route: { path } })))
      expect(template).not.toBeNull()
      expect(asRouteTemplate(template ?? '')).toBe(template)
    },
  )

  it.each([
    ['/', '/'],
    ['/places', '/places'],
    ['/places/new', '/places/new'],
    ['/places/3f2504e0-4f89-11d3-9a0c-0305e82c3301', '/places/:id'],
    ['/costs/test-runs/42', '/costs/test-runs/:id'],
    ['/administrative-data/ds_2026', '/administrative-data/:datasetId'],
    ['/moderation/reviews/r-1', '/moderation/reviews/:reviewId'],
    ['/settings/accounts/new', '/settings/accounts/new'],
    ['/403', '/403'],
    ['/login', '/login'],
    ['/no/such/screen', '/*'],
  ])('%s → %s', (path, template) => {
    expect(routeTemplateOf(matchRoutes(router.routes, path) ?? [])).toBe(template)
  })
})

describe('the tag follows the real router', () => {
  const tagOf = () =>
    beforeSend({ exception: { values: [{ type: 'TypeError', value: 'x' }] } } as never, {
      originalException: new TypeError('x'),
    })?.tags?.route

  beforeEach(() => trackSentryRoute(router))

  it('after navigating to a place with a real id, the tag is the template', async () => {
    await router.navigate('/places/3f2504e0-4f89-11d3-9a0c-0305e82c3301?tab=media#photos')
    expect(tagOf()).toBe('/places/:id')
    await router.navigate('/costs/test-runs/42')
    expect(tagOf()).toBe('/costs/test-runs/:id')
  })
})

/** `main.tsx` runs `bootstrap()` on import, so its order is checked as source. */
describe('main.tsx route wiring', () => {
  const main = readFileSync(resolve(__dirname, '..', 'main.tsx'), 'utf8')
  const body = main.slice(main.indexOf('async function bootstrap()'))

  it('tracks the route right after Sentry starts, before the first await (Sol #243 F-01)', () => {
    const init = body.indexOf('initSentry()')
    const track = body.indexOf('trackSentryRoute(router)')
    expect(init).toBeGreaterThan(-1)
    expect(track).toBeGreaterThan(init)
    expect(track).toBeLessThan(body.indexOf('await '))
  })
})
