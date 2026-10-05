import { beforeEach, describe, expect, it } from 'vitest'
import { mockDb, resetMockDb } from './handlers'

/**
 * Sol F-01 / F-02 (CMS#228 @2b67280) — the MSW mock is the console's only
 * stand-in for GoGo-BE#280 in dev, unit and e2e, so it must refuse what
 * BE#672 @cda3e2a refuses and store what it stores
 * (`libs/modules/shared/place-contact.ts`, `place-contact-write.ts`,
 * `place-contact-schema.ts`, `place-submission.service.ts`
 * `normalizeDraftContact`).
 */

const EVIDENCE = {
  sourceType: 'editorial',
  sourceReference: 'Gọi chủ quán ngày 30/09',
  collectedAt: '2026-09-30T09:00:00+07:00',
}

const api = (path: string, init: { method: string; body?: unknown; key?: boolean }) =>
  fetch(new URL(`/v1${path}`, window.location.origin), {
    method: init.method,
    headers: {
      'content-type': 'application/json',
      ...(init.key ? { 'Idempotency-Key': `test-key-${Math.random().toString(16).slice(2)}` } : {}),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })

const createBody = (extra: Record<string, unknown>) => ({
  name: 'Quán Mới',
  lat: 10.7769,
  lng: 106.7009,
  sourceReferences: { name: 'Đến tận nơi', geom: 'Đo tại chỗ' },
  ...extra,
})

beforeEach(() => resetMockDb())

describe('F-01 — the mock create persists the request, normalised', () => {
  it('stores the normalised phone and only this create’s provenance', async () => {
    const response = await api('/cms/places', {
      method: 'POST',
      key: true,
      body: createBody({ phone: '028 3822 9999', provenance: { phone: EVIDENCE } }),
    })
    expect(response.status).toBe(201)
    const created = (await response.json()) as Record<string, unknown>
    expect(created.phone).toBe('+842838229999')
    // Nothing inherited from the seed row the mock copies its shape from.
    expect(created.website).toBeNull()
    expect(created.addressText).toBeNull()
    // The two references this create made, and the one contact claim: no
    // seed-row origin, and no claim for a contact the body did not send.
    expect(Object.keys(created.provenance as object).sort()).toEqual(['geom', 'name', 'phone'])
    expect((created.provenance as Record<string, unknown>).phone).toMatchObject({
      sourceType: 'editorial',
      sourceReference: 'Gọi chủ quán ngày 30/09',
      collectedAt: '2026-09-30T02:00:00.000Z',
      ownership: 'gogo',
    })
  })

  /*
   * Fable F-01 (CMS#228 @af0c2ef) — GoGo-BE `createPlace` writes an
   * `editorial` provenance row for every accepted `sourceReferences` entry
   * (`claimed` → `place_field_provenance`) and then the contact claims
   * (`writeContactProvenance`); the detail reads all of them back under the
   * API field name. The mock used to answer provenance for the contact claims
   * only, so a console reading `provenance.name` after a create saw nothing.
   */
  it('reads back an editorial claim per source reference beside the contact claim', async () => {
    const response = await api('/cms/places', {
      method: 'POST',
      key: true,
      body: createBody({ phone: '028 3822 9999', provenance: { phone: EVIDENCE } }),
    })
    expect(response.status).toBe(201)
    const { id } = (await response.json()) as { id: string }

    const read = await api(`/cms/places/${id}`, { method: 'GET' })
    expect(read.status).toBe(200)
    const { provenance } = (await read.json()) as { provenance: Record<string, unknown> }
    expect(Object.keys(provenance).sort()).toEqual(['geom', 'name', 'phone'])
    // A reference is an assertion: `editorial`, verified at the write, no
    // collection time and — outside the contact columns — no `ownership`.
    expect(provenance.name).toEqual({
      sourceType: 'editorial',
      sourceReference: 'Đến tận nơi',
      verifiedAt: expect.any(String),
      collectedAt: null,
    })
    expect(provenance.geom).toEqual({
      sourceType: 'editorial',
      sourceReference: 'Đo tại chỗ',
      verifiedAt: expect.any(String),
      collectedAt: null,
    })
    expect(provenance.phone).toEqual({
      sourceType: 'editorial',
      sourceReference: 'Gọi chủ quán ngày 30/09',
      collectedAt: '2026-09-30T02:00:00.000Z',
      verifiedAt: expect.any(String),
      ownership: 'gogo',
    })
  })

  it('claims every supplied fact its reference names, codes included', async () => {
    const response = await api('/cms/places', {
      method: 'POST',
      key: true,
      body: createBody({
        description: 'Quán nhỏ trong hẻm',
        taxonomyIds: ['tx-cat-cafe'],
        provinceCode: '01',
        communeCode: '00004',
        sourceReferences: {
          name: 'Đến tận nơi',
          geom: 'Đo tại chỗ',
          description: 'Ghi nhận tại chỗ',
          taxonomyIds: 'Quan sát tại quán',
          provinceCode: 'Biển số nhà',
          communeCode: 'Biển số nhà',
        },
      }),
    })
    expect(response.status).toBe(201)
    const { provenance } = (await response.json()) as { provenance: Record<string, unknown> }
    expect(Object.keys(provenance).sort()).toEqual([
      'communeCode',
      'description',
      'geom',
      'name',
      'provinceCode',
      'taxonomyIds',
    ])
    expect(provenance.taxonomyIds).toMatchObject({
      sourceType: 'editorial',
      sourceReference: 'Quan sát tại quán',
    })
  })

  it.each([
    ['phone', 'abc', 'invalid'],
    ['phone', '38229999', 'no_country'],
    ['website', 'https://user:pw@quan.vn', 'credentials'],
    ['website', 'http://localhost', 'invalid'],
    ['addressText', '1 Lê Lợi <b>', 'invalid'],
  ])('refuses %s %j as %s, on the value', async (field, value, code) => {
    const response = await api('/cms/places', {
      method: 'POST',
      key: true,
      body: createBody({ [field]: value, provenance: { [field]: EVIDENCE } }),
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { code: string; field_errors: unknown[] }
    expect(body.code).toBe('VALIDATION_FAILED')
    expect(body.field_errors).toEqual([expect.objectContaining({ field, code })])
  })
})

describe('F-01 — the mock review save validates values and stores them normalised', () => {
  const SUBMISSION = '9a1d0c00-0000-4000-8000-000000000001'
  const draft = (extra: Record<string, unknown>) => ({
    name: 'Cà phê Ngọc Hà',
    taxonomyIds: [],
    ...extra,
  })

  it('refuses an invalid phone even with evidence', async () => {
    const response = await api(`/cms/place-submissions/${SUBMISSION}/review`, {
      method: 'PUT',
      body: { draft: draft({ phone: 'abc', provenance: { phone: EVIDENCE } }) },
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { field_errors: unknown[] }
    expect(body.field_errors).toEqual([
      expect.objectContaining({ field: 'phone', code: 'invalid' }),
    ])
  })

  it('stores the draft the way approval will read it', async () => {
    const response = await api(`/cms/place-submissions/${SUBMISSION}/review`, {
      method: 'PUT',
      body: {
        draft: draft({ website: 'quanmoi.vn', provenance: { website: EVIDENCE } }),
      },
    })
    expect(response.status).toBe(200)
    const stored = (
      mockDb.submissionDetails[SUBMISSION] as { review: { draft: Record<string, unknown> } }
    ).review.draft
    expect(stored.website).toBe('https://quanmoi.vn/')
    expect(stored.provenance).toEqual({
      website: { ...EVIDENCE, collectedAt: '2026-09-30T02:00:00.000Z' },
    })
  })
})

describe('F-02 — evidence is as strict as GoGo-BE', () => {
  /** A create carrying a phone with `evidence`, and what the mock answered. */
  async function createWithEvidence(evidence: unknown) {
    const response = await api('/cms/places', {
      method: 'POST',
      key: true,
      body: createBody({ phone: '+842838229999', provenance: { phone: evidence } }),
    })
    return {
      status: response.status,
      body: (await response.json()) as { field_errors?: { field: string; code: string }[] },
    }
  }

  it('refuses a null evidence entry at the schema layer', async () => {
    const { status, body } = await createWithEvidence(null)
    expect(status).toBe(400)
    // A schema refusal of the entry's type — not the gate's "evidence missing"
    // (`required`), which is what a nullable entry used to fall through to.
    expect(body.field_errors?.[0]).toMatchObject({ field: 'phone', code: 'invalid_type' })
  })

  it('refuses control characters in the reference', async () => {
    const { status, body } = await createWithEvidence({
      ...EVIDENCE,
      sourceReference: 'Gọi\u0007 chủ quán',
    })
    expect(status).toBe(400)
    expect(body.field_errors).toEqual([
      expect.objectContaining({ field: 'provenance.phone.sourceReference', code: 'invalid' }),
    ])
  })

  it.each([
    ['2026-09-30T09:00:00+0700', 'offset without a colon'],
    ['2026-02-30T09:00:00Z', 'an impossible date'],
    ['2026-09-30T24:00:00Z', 'hour 24'],
    ['2026-09-30T09:00:00+24:00', 'an offset past 23 hours'],
  ])('refuses %s (%s) as invalid_datetime', async (collectedAt) => {
    const { status, body } = await createWithEvidence({ ...EVIDENCE, collectedAt })
    expect(status).toBe(400)
    expect(body.field_errors).toEqual([
      expect.objectContaining({ field: 'provenance.phone.collectedAt', code: 'invalid_datetime' }),
    ])
  })

  it.each(['2026-09-30T09:00Z', '2026-09-30T09:00:00.123+07:00', '2026-09-30T02:00:00Z'])(
    'accepts %s',
    async (collectedAt) => {
      const { status } = await createWithEvidence({ ...EVIDENCE, collectedAt })
      expect(status).toBe(201)
    },
  )
})
