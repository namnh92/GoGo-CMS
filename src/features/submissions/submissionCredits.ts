import type { Schemas } from '@/shared/api/generated'

/**
 * Contract 7.5.0-alpha.1 has no award fields in detail/decision responses.
 * BE origin/re-design 1cd439d: libs/modules/shared/assistant-credits.ts:30,
 * grantSubmissionCredits: (grantBase ? 50 : 0) + (approvedMenuBillPhotoCount > 0 ? 20 : 0).
 * These are prospective rates, not an assertion that the ledger granted credits.
 */
export function submissionCreditPreview(
  registered: boolean,
  enrichment: Schemas['ContributionEnrichment'] | undefined,
  photos: Schemas['SubmissionPhoto'][],
  excludedIds: string[],
) {
  const evidenceMediaIds = new Set(enrichment?.photos?.map((photo) => photo.mediaId) ?? [])
  const bonus =
    registered &&
    photos.some(
      (photo) =>
        photo.status === 'pending' &&
        !excludedIds.includes(photo.id) &&
        evidenceMediaIds.has(photo.mediaId),
    )
      ? 20
      : 0
  const base = registered ? 50 : 0
  return { base, bonus, total: base + bonus }
}
