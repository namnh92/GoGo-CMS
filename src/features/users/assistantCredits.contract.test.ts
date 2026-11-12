import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { creditCursor, creditGrant, creditPage, creditUserId } from '@/shared/test/assistantCredits'
import { assistantCreditsSchema, fetchAssistantCredits } from './assistantCredits.api'

const endpoint = '/v1/cms/users/:id/assistant-credits'

describe('assistant credit client contract (BE#778)', () => {
  it('uses the CMS GET endpoint, passes the opaque cursor and signal, and disables browser cache', async () => {
    let called = false
    server.use(
      http.get(endpoint, ({ request, params }) => {
        called = true
        const url = new URL(request.url)
        expect(params.id).toBe(creditUserId)
        expect(url.searchParams.get('limit')).toBe('50')
        expect(url.searchParams.get('cursor')).toBe(creditCursor)
        expect(request.cache).toBe('no-store')
        expect(request.credentials).toBe('include')
        return HttpResponse.json(creditPage)
      }),
    )
    const controller = new AbortController()
    expect(
      await fetchAssistantCredits(
        creditUserId,
        { limit: 50, cursor: creditCursor },
        controller.signal,
      ),
    ).toEqual(creditPage)
    expect(called).toBe(true)
  })

  it('omits the cursor on the first page and preserves zero with an empty ledger', async () => {
    server.use(
      http.get(endpoint, ({ request }) => {
        expect(new URL(request.url).searchParams.has('cursor')).toBe(false)
        return HttpResponse.json({ ...creditPage, balance: 0, items: [], nextCursor: null })
      }),
    )
    expect(await fetchAssistantCredits(creditUserId)).toMatchObject({
      balance: 0,
      items: [],
      nextCursor: null,
    })
  })

  it('validates credit facts and strips surplus PII at the boundary', () => {
    const parsed = assistantCreditsSchema.parse({
      ...creditPage,
      user: { ...creditPage.user, email: 'private@example.test' },
      conversation: 'private conversation',
    })
    expect(parsed.user).not.toHaveProperty('email')
    expect(parsed).not.toHaveProperty('conversation')
    expect(parsed.items[0]?.createdAt).toBe(creditGrant.createdAt)
    expect(assistantCreditsSchema.safeParse({ ...creditPage, balance: -1 }).success).toBe(false)
    expect(
      assistantCreditsSchema.safeParse({ ...creditPage, items: [{ ...creditGrant, delta: 0 }] })
        .success,
    ).toBe(false)
  })

  it('accepts signed usage adjustments and open reasons from contract 10.3, rejecting invalid deltas', () => {
    for (const delta of [2, -2, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
      expect(
        assistantCreditsSchema.parse({
          ...creditPage,
          items: [{ ...creditGrant, delta, reason: 'assistant_usage_adjustment' }],
        }).items[0],
      ).toMatchObject({ delta, reason: 'assistant_usage_adjustment' })
    }
    for (const delta of [0, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER - 1]) {
      expect(
        assistantCreditsSchema.safeParse({ ...creditPage, items: [{ ...creditGrant, delta }] })
          .success,
      ).toBe(false)
    }
  })

  it('honors an aborted query signal', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(fetchAssistantCredits(creditUserId, {}, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('surfaces permission errors and unknown users rather than empty history', async () => {
    for (const [status, code] of [
      [403, 'ROLE_DENIED'],
      [404, 'USER_NOT_FOUND'],
    ] as const) {
      server.use(http.get(endpoint, () => HttpResponse.json({ code, message: code }, { status })))
      await expect(fetchAssistantCredits(creditUserId)).rejects.toMatchObject({ status, code })
    }
  })
})
