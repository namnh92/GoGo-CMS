import { describe, expect, it } from 'vitest'
import { errorEnvelopeSchema } from './errors'

/**
 * Review F-04/F-06 — a duplicate candidate that breaks the contract is not
 * linked to: the entry keeps its human `message` and loses only `candidate`.
 */
describe('duplicate candidate in the error envelope', () => {
  it('falls back to the message for a candidate that breaks the contract', () => {
    const parsed = errorEnvelopeSchema.parse({
      code: 'PLACE_DUPLICATE_SUSPECTED',
      message: 'm',
      field_errors: [
        {
          field: 'name',
          code: 'duplicate_candidate',
          message: 'Quán Cũ (12m)',
          candidate: {
            placeId: 'not-a-uuid',
            name: 'Quán Cũ',
            status: 'draft',
            distanceM: 12.5,
            nameSimilarity: 1.5,
          },
        },
      ],
      request_id: 'r',
      retryable: false,
    })
    expect(parsed.code).toBe('PLACE_DUPLICATE_SUSPECTED')
    expect(parsed.field_errors[0]).toEqual({
      field: 'name',
      code: 'duplicate_candidate',
      message: 'Quán Cũ (12m)',
      candidate: undefined,
    })
  })
})
