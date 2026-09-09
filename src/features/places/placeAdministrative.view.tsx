import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import type { MessageKey } from '@/shared/i18n/vi'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { fetchPlaceAdministrativeMapping } from '@/features/administrative/api'
import { MappingDetailDrawer } from '@/features/administrative/mappingDetail.view'
import { MappingStatusBadge } from '@/features/administrative/mappingParts'
import type { PlaceAdministrativeSummary } from '@/shared/api/contracts'

/**
 * The decisions that make a review worth opening. `view` and `reconcile` are
 * not among them: reading changes nothing, and reconciling is ops re-evaluating
 * a mapping against the dataset — emphatically not a verification (ADM-009).
 */
const REVIEW_ACTIONS = ['verify', 'correct', 'reject', 'rematch'] as const

/**
 * ADM-106 — what a place's administrative identity is, on the editor's screen.
 *
 * It reads the summary the API stores rather than recomputing anything: the
 * moderation screen re-runs the resolver on every read because a reviewer needs
 * today's answer, and an editor opening a place to fix a phone number does not.
 *
 * Three things an editor has to be able to tell apart, so all three are here in
 * words:
 *
 * - **which unit** this place is filed under, by name *and* code — a bare code
 *   is not something anyone can check, and a bare name is not what gets stored;
 * - **how sure** that is: `AUTO_MATCHED` is the resolver's answer, not a
 *   person's, and rendering it as "đã xác minh" would claim something the
 *   server will refuse to act on;
 * - **what it blocks**, from the same policy the publish transaction enforces,
 *   so this screen cannot promise a publish that will then fail.
 *
 * There is no district row. That tier was dissolved on 2025-07-01; a legacy
 * free-text address may still mention one, and the note says so rather than
 * pretending the address line is wrong.
 */
export function AdministrativeSummary({
  summary,
  placeId,
}: {
  summary: PlaceAdministrativeSummary | null | undefined
  /** Omitted while a place is being created: there is no mapping to review yet. */
  placeId?: string | null
}) {
  const t = useT()
  const { can } = useSession()
  const [reviewing, setReviewing] = useState(false)

  const blocked = Boolean(summary?.approvalBlock)
  /*
   * ADM-009 — asked only when there is a blocker to lift, because this is the
   * moderation read: it re-runs the resolver server-side, and an editor opening
   * a place to fix a phone number has no reason to pay for that. The role gate
   * here decides whether to *ask*; what may be *done* comes back from the
   * server in `permittedActions` and nothing else.
   */
  const mapping = useQuery({
    queryKey: queryKeys.administrativeMappingDetail(placeId ?? ''),
    queryFn: ({ signal }) => fetchPlaceAdministrativeMapping(placeId!, signal),
    enabled: Boolean(placeId) && blocked && can('administrativeMapping.read'),
    staleTime: 30_000,
  })

  const permitted = mapping.data?.permittedActions ?? []
  const mayReview = REVIEW_ACTIONS.some((action) => permitted.includes(action))

  if (!summary) {
    // Older API, or a response that carried no summary at all. Saying nothing
    // is more honest than rendering an empty pair as "no unit".
    return null
  }

  const hasUnit = Boolean(summary.provinceCode || summary.communeCode)

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface-subtle p-3">
      <header className="flex flex-wrap items-center gap-2">
        <h4 className="text-[13px] font-semibold text-text">{t('placeEditor.administrative')}</h4>
        <MappingStatusBadge status={summary.status} />
      </header>

      {hasUnit ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-text-muted">{t('placeEditor.province')}</dt>
          <dd className="text-text">{unitLine(summary.provinceName, summary.provinceCode)}</dd>
          <dt className="text-text-muted">{t('placeEditor.commune')}</dt>
          <dd className="text-text">{unitLine(summary.communeName, summary.communeCode)}</dd>
        </dl>
      ) : (
        <p className="text-[13px] text-text-muted">{t('placeEditor.administrativeUnmapped')}</p>
      )}

      <p className="text-xs text-text-muted">
        {summary.activeDatasetVersion
          ? `${t('placeEditor.administrativeDataset')}: ${summary.datasetVersion ?? '—'}`
          : t('placeEditor.administrativeNoDataset')}
      </p>

      {summary.approvalBlock ? (
        <p className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="danger">{t('placeEditor.administrativeBlocked')}</Badge>
          <span className="text-text-muted">{blockMessage(t, summary.approvalBlock)}</span>
        </p>
      ) : (
        <p className="text-xs text-text-muted">{t('placeEditor.administrativeOk')}</p>
      )}

      {/*
        The way out of the blocker, on the screen that shows it. Which of the
        two appears is the server's answer, not this component's guess: a
        reviewer gets the decision drawer the moderation queue uses, and
        everybody else gets the queue itself, focused on this place, so a
        blocker is never the end of the road.
      */}
      {blocked && placeId ? (
        mayReview ? (
          <div>
            <Button variant="secondary" onClick={() => setReviewing(true)}>
              {t('placeEditor.administrativeReview')}
            </Button>
            <p className="mt-1 text-xs text-text-subtle">
              {t('placeEditor.administrativeReviewHint')}
            </p>
          </div>
        ) : (
          <p className="text-xs">
            <Link
              className="text-coral underline underline-offset-2"
              to={`/administrative-mapping?status=&place=${placeId}`}
            >
              {t('placeEditor.administrativeReviewQueue')}
            </Link>
          </p>
        )
      ) : null}

      <p className="text-xs text-text-subtle">{t('placeEditor.administrativeLegacyNote')}</p>

      {placeId ? (
        <MappingDetailDrawer
          placeId={reviewing ? placeId : null}
          onClose={() => setReviewing(false)}
        />
      ) : null}
    </section>
  )
}

/**
 * Name and code together, always.
 *
 * The code is what is stored and what an editor quotes when reporting a wrong
 * mapping; the name is the only half a person can actually judge. A row missing
 * either one is a row nobody can act on.
 */
function unitLine(name: string | null | undefined, code: string | null | undefined): string {
  if (!code) return '—'
  return name ? `${name} (${code})` : code
}

/**
 * The blocker in Vietnamese, falling back to the server's own sentence.
 *
 * The codes are a closed set the console already translates for the moderation
 * queue; a code this build has no phrase for still says *something* rather than
 * rendering an enum member at an editor.
 */
function blockMessage(
  t: (key: MessageKey) => string,
  block: { code: string; message: string },
): string {
  const key = `mapping.block.${block.code}` as MessageKey
  const translated = t(key)
  return translated === key ? block.message : translated
}
