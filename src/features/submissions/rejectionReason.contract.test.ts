import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  placeSubmissionDetailSchema,
  placeSubmissionSchema,
  submissionHistoryReasonSchema,
  submissionRejectionReasonSchema,
} from '@/shared/api/contracts'
import type { DecidePlaceSubmissionBody, Schemas } from '@/shared/api/generated'
import { signInAs } from '@/shared/test/render'
import { mockDb, resetMockDb } from '@/shared/test/handlers'
import { decideSubmission, fetchSubmission } from './api'

beforeEach(() => resetMockDb())

const ID = '9a1d0c00-0000-4000-8000-000000000001'

describe('GoGo-BE#790 / CMS#281 rejection contract', () => {
  it('matches the generated enum and every key in the vendored contract', () => {
    expectTypeOf<z.infer<typeof submissionRejectionReasonSchema>>().toEqualTypeOf<
      Schemas['SubmissionRejectionReason']
    >()
    type Reject = Extract<DecidePlaceSubmissionBody, { decision: 'rejected' }>
    expectTypeOf<Reject>().toMatchTypeOf<{
      rejectionReason: Schemas['SubmissionRejectionReason']
    }>()
    const spec = readFileSync('openapi/gogo.v1.yaml', 'utf8')
    const definition = spec
      .split('    SubmissionRejectionReason:')[1]!
      .split('    PlaceSubmissionSummary:')[0]!
    const keys = definition
      .match(/enum:\s*\[([\s\S]*?)\]/)![1]!
      .split(',')
      .map((key) => key.trim())
      .filter(Boolean)
    expect(submissionRejectionReasonSchema.options).toEqual(keys)
    expect(submissionRejectionReasonSchema.safeParse('custom_reason').success).toBe(false)
  })

  it('preserves the public key on list, detail and audit boundaries', async () => {
    signInAs('moderator')
    const detail = await fetchSubmission(ID)
    expect(placeSubmissionSchema.shape.rejectionReason.parse('duplicate_place')).toBe(
      'duplicate_place',
    )
    expect(
      placeSubmissionDetailSchema.parse({ ...detail, rejectionReason: 'other' }).rejectionReason,
    ).toBe('other')
    expect(
      submissionHistoryReasonSchema.parse({
        rejectionReason: 'incorrect_location',
        reason: 'internal',
      }),
    ).toEqual({ rejectionReason: 'incorrect_location' })
    // Legacy history and arbitrary audit objects must never be rendered as a key.
    for (const value of [null, {}, { rejectionReason: 'unknown' }, 'other']) {
      expect(submissionHistoryReasonSchema.safeParse(value).success).toBe(false)
    }
  })

  it('sends a generated reject body without an internal note', async () => {
    signInAs('moderator')
    const body: DecidePlaceSubmissionBody = { decision: 'rejected', rejectionReason: 'other' }
    await decideSubmission(ID, body)
    expect(mockDb.decisions.at(-1)).toEqual({ id: ID, ...body })
    const detail = await fetchSubmission(ID)
    expect(detail.rejectionReason).toBe('other')
    expect(submissionHistoryReasonSchema.parse(detail.history.at(-1)?.detail)).toEqual({
      rejectionReason: 'other',
    })
  })

  it.each([undefined, 'unknown'])('the API refuses a handcrafted rejection key %s', async (key) => {
    signInAs('moderator')
    // Deliberately bypass TypeScript to exercise server-side validation.
    const body = {
      decision: 'rejected',
      rejectionReason: key,
      reason: 'Internal note',
    } as DecidePlaceSubmissionBody
    await expect(decideSubmission(ID, body)).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
      fieldErrors: [expect.objectContaining({ field: 'rejectionReason' })],
    })
  })

  it('the API refuses a handcrafted write by an ops_admin', async () => {
    signInAs('ops_admin')
    await expect(
      decideSubmission(ID, { decision: 'rejected', rejectionReason: 'other' }),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' })
  })
})
