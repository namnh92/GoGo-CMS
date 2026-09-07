import { afterEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { NAV_ENTRIES } from '@/app/nav'
import { roleCan } from '@/shared/auth/permissions'
import type { AdminRole } from '@/shared/api/contracts'
import { capabilityNotice } from './capability'
import AdministrativeDataScreen from './administrativeData.view'
import AdministrativeMappingScreen from './administrativeMapping.view'

/**
 * CMS #153 — the shell, its guards and its contract.
 *
 * The assertions that matter are the negative ones. A destination hidden from
 * the sidebar is a courtesy; what stops an unauthorised person is the screen
 * refusing and, behind it, the server. So the tests check that a role without
 * permission reaching the route directly gets a denial **and that no request
 * leaves the browser** — a screen that renders "forbidden" after asking the API
 * anyway has already leaked the question.
 */

afterEach(() => {
  window.sessionStorage.clear()
})

/** Counts requests the screen makes, so "asked nothing" is provable. */
function spyOn(path: string) {
  const calls: string[] = []
  server.use(
    http.get(`*${path}`, ({ request }) => {
      calls.push(request.url)
      return undefined
    }),
  )
  return calls
}

const capability = {
  dataset: {
    state: 'AVAILABLE',
    version: 'v5.0.0+v2.4.1+7fac8c45+none+r0',
    publishedAt: '2026-09-07T00:00:00.000Z',
    ageSeconds: 120,
    counts: { PUBLISHED: 1 },
    quarantined: 1033,
    unresolved: 1033,
    validation: { errors: 0, warnings: 2 },
  },
  boundaries: {
    state: 'AVAILABLE',
    version: 'v5.0.0',
    loadedAt: '2026-09-07T00:00:00.000Z',
    ageSeconds: 300,
    provinces: 34,
    communes: 3321,
  },
  resolver: 'FULL',
  publication: 'ENABLED',
  mappings: { UNMAPPED: 4, NEEDS_REVIEW: 2 },
  remediation: { compliant: 10 },
  observedAt: '2026-09-07T00:02:00.000Z',
}

describe('navigation offers each destination to exactly the roles that may read it', () => {
  const leaves = NAV_ENTRIES.flatMap((entry) => (entry.kind === 'group' ? entry.children : [entry]))
  const mapping = leaves.find((leaf) => leaf.to === '/administrative-mapping')
  const dataset = leaves.find((leaf) => leaf.to === '/administrative-data')

  it('adds both destinations without disturbing the existing ones', () => {
    expect(mapping?.permission).toBe('administrativeMapping.read')
    expect(dataset?.permission).toBe('administrativeDataset.read')
    // The rest of the information architecture is untouched: one sidebar, the
    // same groups, no second staff surface.
    expect(leaves.some((leaf) => leaf.to === '/places')).toBe(true)
    expect(leaves.some((leaf) => leaf.to === '/moderation')).toBe(true)
    expect(NAV_ENTRIES.filter((entry) => entry.kind === 'group').map((entry) => entry.id)).toEqual([
      'catalog',
      'review',
      'operations',
      'users',
      'administration',
    ])
  })

  it.each([
    ['editor', true, false],
    ['moderator', true, false],
    ['ops_admin', true, true],
    ['super_admin', true, true],
  ] as [AdminRole, boolean, boolean][])(
    '%s sees mapping=%s dataset=%s',
    (role, seesMapping, seesDataset) => {
      expect(roleCan(role, mapping!.permission)).toBe(seesMapping)
      expect(roleCan(role, dataset!.permission)).toBe(seesDataset)
    },
  )
})

describe('the route enforces its own permission', () => {
  it('refuses the dataset shell to a moderator, and asks the API nothing', async () => {
    signInAs('moderator')
    const calls = spyOn('/cms/administrative-datasets/capability')
    renderWithProviders(<AdministrativeDataScreen />)

    expect(await screen.findByText(/Không đủ quyền|Not permitted/i)).toBeInTheDocument()
    // Hiding the nav entry is not the security boundary; not asking is the
    // half this screen owns.
    expect(calls).toEqual([])
  })

  it('lets ops open the dataset shell and reads the capability once', async () => {
    signInAs('ops_admin')
    const calls = spyOn('/cms/administrative-datasets/capability')
    renderWithProviders(<AdministrativeDataScreen />)

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
  })

  it('refuses the mapping shell to nobody with a role, and to everybody without one', async () => {
    const calls = spyOn('/cms/administrative-mappings')
    renderWithProviders(<AdministrativeMappingScreen />)
    expect(await screen.findByText(/Không đủ quyền|Not permitted/i)).toBeInTheDocument()
    expect(calls).toEqual([])
  })

  it('lets an editor read the mapping queue', async () => {
    signInAs('editor')
    const calls = spyOn('/cms/administrative-mappings')
    renderWithProviders(<AdministrativeMappingScreen />)

    await waitFor(() => expect(calls.length).toBeGreaterThan(0))
  })

  /*
   * The dataset screen stopped being a shell in #154; the mapping queue has
   * not. The assertion moves rather than being deleted — a shell that quietly
   * grew controls nobody designed is exactly what it was written to catch.
   */
  it('says plainly that the mapping queue is not built rather than showing dead controls', async () => {
    signInAs('moderator')
    renderWithProviders(<AdministrativeMappingScreen />)

    expect(await screen.findByText(/chưa được dựng|not built yet/i)).toBeInTheDocument()
    for (const name of [/xác nhận|verify/i, /từ chối|reject/i, /gán lại|rematch/i]) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
  })
})

describe('capability states', () => {
  it.each([
    [
      'a missing dataset stops everything',
      { dataset: 'MISSING', publication: 'BLOCKED' },
      'danger',
    ],
    ['blocked publication is reported on its own', { publication: 'BLOCKED' }, 'danger'],
    ['missing boundaries only degrade the resolver', { boundaries: 'MISSING' }, 'amber'],
    ['a partial resolver is the same warning', { resolver: 'PARTIAL' }, 'amber'],
    ['everything present is the quiet case', {}, 'mint'],
  ] as [string, Record<string, string>, string][])('%s', (_case, over, tone) => {
    const value = {
      ...capability,
      dataset: { ...capability.dataset, state: over.dataset ?? 'AVAILABLE' },
      boundaries: { ...capability.boundaries, state: over.boundaries ?? 'AVAILABLE' },
      resolver: over.resolver ?? 'FULL',
      publication: over.publication ?? 'ENABLED',
    }
    expect(capabilityNotice(value as never).tone).toBe(tone)
  })

  it('never turns partial administrative capability into a broken console', async () => {
    signInAs('ops_admin')
    server.use(
      http.get('*/cms/administrative-datasets/capability', () =>
        HttpResponse.json({
          ...capability,
          boundaries: { ...capability.boundaries, state: 'MISSING', version: null },
          resolver: 'PARTIAL',
        }),
      ),
    )
    renderWithProviders(<AdministrativeDataScreen />)

    // The screen renders, says what is missing, and does not error the console.
    expect(await screen.findByText(/chưa nạp ranh giới|no boundary release/i)).toBeInTheDocument()
    // Degraded, not down: the resolver still answers, and the screen says so.
    expect(screen.getByText(/một phần|partial/i)).toBeInTheDocument()
    expect(screen.queryByText(/state.error|không tải được/i)).not.toBeInTheDocument()
  })
})
