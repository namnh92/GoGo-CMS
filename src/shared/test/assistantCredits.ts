import type { Schemas } from '@/shared/api/generated'

export const creditUserId = '77777777-0000-4000-8000-000000000001'
export const creditCursor = 'opaque+/cursor==:user-scoped'
export const creditGrant = {
  id: '77777777-0000-4000-8000-000000000002',
  createdAt: '2026-11-06T08:00:00.123456Z',
  delta: 50,
  reason: 'submission_approved',
  submissionId: '77777777-0000-4000-8000-000000000003',
  venueIdentity: 'google:venue-reference',
  placeId: '77777777-0000-4000-8000-000000000004',
} satisfies Schemas['CmsAssistantCreditEntry']
export const creditSpend = {
  id: '77777777-0000-4000-8000-000000000005',
  createdAt: '2026-11-06T07:00:00.123455Z',
  delta: -1,
  reason: 'message_spent',
  submissionId: null,
  venueIdentity: null,
  placeId: null,
} satisfies Schemas['CmsAssistantCreditEntry']
export const creditPage = {
  user: { id: creditUserId, displayName: 'Người đóng góp' },
  balance: 149,
  items: [creditGrant],
  nextCursor: creditCursor,
} satisfies Schemas['CmsAssistantCredits']
