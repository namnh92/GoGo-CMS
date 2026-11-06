import { z } from 'zod'
import { apiFetchParsed } from '@/shared/api/client'
import type { operations, Schemas } from '@/shared/api/generated'

// Runtime boundary validation; DTOs and request parameters come from OpenAPI.
export const assistantCreditEntrySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  delta: z.union([z.literal(50), z.literal(-1)]),
  reason: z.enum(['submission_approved', 'message_spent']),
  submissionId: z.string().uuid().nullable(),
  venueIdentity: z.string().nullable(),
  placeId: z.string().uuid().nullable(),
}) satisfies z.ZodType<Schemas['CmsAssistantCreditEntry']>

export const assistantCreditsSchema = z.object({
  user: z.object({ id: z.string().uuid(), displayName: z.string() }),
  balance: z.number().int().nonnegative(),
  items: z.array(assistantCreditEntrySchema).max(100),
  nextCursor: z.string().nullable(),
}) satisfies z.ZodType<Schemas['CmsAssistantCredits']>

export function fetchAssistantCredits(
  id: operations['cmsUserAssistantCredits']['parameters']['path']['id'],
  query: operations['cmsUserAssistantCredits']['parameters']['query'] = {},
  signal?: AbortSignal,
): Promise<Schemas['CmsAssistantCredits']> {
  return apiFetchParsed(
    assistantCreditsSchema,
    `/cms/users/${encodeURIComponent(id)}/assistant-credits`,
    {
      query,
      cache: 'no-store',
      signal,
    },
  )
}
