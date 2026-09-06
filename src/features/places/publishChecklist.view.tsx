import { useMemo } from 'react'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { formatRelative } from '@/shared/format'
import { Badge } from '@/shared/ui/Badge'
import type { CmsPlaceDetail, PlaceStatus } from '@/shared/api/contracts'
import { blockingFailures, buildChecklist, type ChecklistItem } from './publishChecklist'
import { styles } from './publishChecklist.style'

/**
 * GoGo-CMS#127 — what stands between this place and `published`, split by
 * whether it actually stands there.
 *
 * `transitionPlace` on GoGo-BE enforces exactly two things: the transition is
 * legal for the current status, and the caller holds the role. Everything else
 * on this list is advice, and the screen says so in words rather than letting
 * a row of grey ticks imply a gate that does not exist. Adding one here would
 * be inventing a publishing rule in the layer least able to enforce it.
 */
export function PublishChecklist({
  place,
  canTransition,
  target = 'published',
}: {
  place: CmsPlaceDetail
  canTransition: boolean
  target?: PlaceStatus
}) {
  const t = useT()
  const { locale } = useI18n()
  const items = useMemo(
    () => buildChecklist({ place, canTransition, target }),
    [place, canTransition, target],
  )
  const blocking = blockingFailures(items)
  const required = items.filter((item) => item.kind === 'required')
  const suggested = items.filter((item) => item.kind === 'suggested')
  const metCount = suggested.filter((item) => item.met).length

  return (
    <div className={styles.wrap}>
      <section aria-labelledby="publish-required">
        <h4 id="publish-required" className={styles.groupTitle}>
          {t('publishChecklist.required')}
        </h4>
        <p className={styles.groupHint}>{t('publishChecklist.requiredHint')}</p>
        <ul className={styles.list}>
          {required.map((item) => (
            <Row key={item.id} item={item} t={t} />
          ))}
        </ul>
      </section>

      <section aria-labelledby="publish-suggested">
        <h4 id="publish-suggested" className={styles.groupTitle}>
          {t('publishChecklist.suggested', {
            met: metCount,
            total: suggested.length,
          })}
        </h4>
        {/*
          Stated outright: an unmet suggestion changes nothing about whether
          the CTA fires. A checklist that looks like a gate but is not one
          teaches editors to distrust every checklist.
        */}
        <p className={styles.groupHint}>{t('publishChecklist.suggestedHint')}</p>
        <ul className={styles.list}>
          {suggested.map((item) => (
            <Row key={item.id} item={item} t={t} />
          ))}
        </ul>
        {place.freshnessCheckedAt ? (
          <p className={styles.freshness}>
            {t('publishChecklist.lastChecked', {
              time: formatRelative(place.freshnessCheckedAt, locale),
            })}
          </p>
        ) : (
          <p className={styles.freshness}>{t('places.freshness.never')}</p>
        )}
      </section>

      {blocking.length > 0 ? (
        <p role="status" className={styles.blocked}>
          <span aria-hidden="true">⚠</span>
          {t('publishChecklist.blocked', {
            reason: blocking.map((item) => reason(item, t)).join(', '),
          })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Why an item blocks, phrased as a failure.
 *
 * The list labels (`publishChecklist.item.*`) are written affirmatively because
 * `Row` shows them beside ✓/○ and a "Chưa đạt" badge, where that reads
 * correctly. Joining those same labels after "Chưa xuất bản được:" produced a
 * sentence that contradicted itself — "cannot publish: the current status
 * allows a move to Published" (#138). Only `transition` and `permission` can
 * ever block, so only those two need a reason.
 */
function reason(item: ChecklistItem, t: ReturnType<typeof useT>): string {
  if (item.id === 'permission') return t('publishChecklist.reason.permission')
  if (item.id === 'transition') {
    return t('publishChecklist.reason.transition', {
      from: t(`placeStatus.${item.detail?.from as PlaceStatus}` as const),
      to: t(`placeStatus.${item.detail?.to as PlaceStatus}` as const),
    })
  }
  // A suggested item never reaches `blockingFailures`, but if that ever changes
  // the label is a better answer than an empty string.
  return t(`publishChecklist.item.${item.id}` as const)
}

function Row({ item, t }: { item: ChecklistItem; t: ReturnType<typeof useT> }) {
  return (
    <li className={styles.row}>
      {/* Colour is never the only signal: the glyph and the badge word both say it. */}
      <span className={item.met ? styles.markMet : styles.markUnmet} aria-hidden="true">
        {item.met ? '✓' : '○'}
      </span>
      <span className={styles.label}>{t(`publishChecklist.item.${item.id}` as const)}</span>
      <Badge tone={item.met ? 'mint' : item.kind === 'required' ? 'danger' : 'neutral'}>
        {item.met
          ? t('publishChecklist.met')
          : item.kind === 'required'
            ? t('publishChecklist.missingRequired')
            : t('publishChecklist.missingSuggested')}
      </Badge>
    </li>
  )
}
