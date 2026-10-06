import { describe, expect, it } from 'vitest'
import * as contracts from './contracts'
import { privacyRequests } from '@/shared/test/fixtures'

/*
 * GoGo-BE#256 / ADR-0032 (alpha.67). The two CMS export routes answer `202`
 * metadata. The client schemas keep the export facts and drop anything else —
 * a stray `data` from an old or buggy server never reaches a component.
 */

const exportFacts = {
  id: '77777777-0000-4000-8000-000000000001',
  status: 'ready',
  initiatedBy: 'support',
  createdAt: '2026-10-06T08:00:00.000Z',
  readyAt: '2026-10-06T08:05:00.000Z',
  expiresAt: '2026-10-07T08:05:00.000Z',
  transferOutcome: 'completed',
}

describe('privacy export contract (alpha.67)', () => {
  it('execute 202: keeps `export`, drops any `data`', () => {
    const parsed = contracts.privacyExecuteResultSchema.parse({
      request: { ...privacyRequests[0]!, status: 'in_progress' },
      export: exportFacts,
      data: { profile: { email: 'leak@example.com' } },
    }) as Record<string, unknown>
    expect(parsed).not.toHaveProperty('data')
    expect((parsed.export as { status?: string } | undefined)?.status).toBe('ready')
  })

  it('execute 201 (delete) still parses with no export', () => {
    const parsed = contracts.privacyExecuteResultSchema.parse({ request: privacyRequests[1]! })
    expect(parsed).not.toHaveProperty('export')
  })

  it('direct user export 202: privacyRequestId + export, nothing else', () => {
    const schema = (contracts as Record<string, unknown>).cmsUserExportResultSchema as
      { parse: (value: unknown) => Record<string, unknown> } | undefined
    expect(schema, 'cmsUserExportResultSchema is exported').toBeDefined()
    const parsed = schema!.parse({
      privacyRequestId: '66666666-0000-4000-8000-000000000902',
      export: exportFacts,
      profile: { email: 'leak@example.com' },
    })
    expect(Object.keys(parsed).sort()).toEqual(['export', 'privacyRequestId'])
  })

  it('an unknown future failure code is kept as a fact, not a crash', () => {
    const parsed = contracts.privacyRequestSchema.parse({
      ...privacyRequests[0]!,
      secureExport: { ...exportFacts, status: 'failed', failureCode: 'brand_new_code' },
    }) as Record<string, unknown>
    expect((parsed.secureExport as { failureCode?: string }).failureCode).toBe('brand_new_code')
  })
})
