import type { CmsPlaceDetail, PlaceStatus } from '@/shared/api/contracts'
import { PLACE_TRANSITIONS } from './status'

/**
 * GoGo-CMS#127 — what actually stands between a place and `published`.
 *
 * The honest answer is: almost nothing. `transitionPlace` in GoGo-BE
 * (`libs/modules/cms/application/cms-catalog.service.ts`) checks exactly two
 * things — that the transition is legal for the current status, and that the
 * caller holds the role. **There is no field the server requires before a
 * place goes live.**
 *
 * So this file draws a line the issue insists on: a *blocking* item is one the
 * API would refuse, and everything else is a **suggestion that does not
 * block**. Inventing a client-side gate — "you cannot publish without a photo"
 * — would be adding a business rule the product never agreed, in the one layer
 * that cannot enforce it anyway (`.claude/rules/core.md` §5: the API is the
 * final enforcement layer).
 *
 * The suggestions are still worth showing. A published place with no hours and
 * no coordinates is a bad row in a catalogue people plan evenings from; the
 * screen just has to be clear about which half of the list is a rule and which
 * is advice.
 */

export type ChecklistItemId =
  | 'transition'
  | 'permission'
  | 'coordinates'
  | 'address'
  | 'area'
  | 'hours'
  | 'photo'
  | 'price'
  | 'description'
  | 'freshness'

export type ChecklistItem = {
  id: ChecklistItemId
  /** `required` is refused by the API. `suggested` never blocks anything. */
  kind: 'required' | 'suggested'
  met: boolean
  /** Extra facts for the label, e.g. how many photos are approved. */
  detail?: Record<string, string | number>
}

export type ChecklistInput = {
  place: CmsPlaceDetail
  canTransition: boolean
  target: PlaceStatus
}

/** Freshness older than this reads as "nobody has looked in a while". */
export const STALE_AFTER_DAYS = 90

function isFresh(checkedAt: string | null | undefined): boolean {
  if (!checkedAt) return false
  const at = new Date(checkedAt).getTime()
  if (Number.isNaN(at)) return false
  return Date.now() - at < STALE_AFTER_DAYS * 86_400_000
}

export function buildChecklist({ place, canTransition, target }: ChecklistInput): ChecklistItem[] {
  const approvedPhotos = place.media.filter((media) => media.moderation === 'approved').length
  /*
   * A day with no row is *unknown*, not closed, so "has hours" means the week
   * says something about at least one day — including saying it is closed
   * (GoGo-BE#425). A place with zero rows is one nobody has filled in.
   */
  const knownDays = new Set(place.hours.map((hour) => hour.dayOfWeek)).size

  return [
    // ---- Blocking: these are the only two the API enforces. -----------------
    {
      id: 'transition',
      kind: 'required',
      /*
       * A place already at the target has nothing to do, so the requirement is
       * satisfied rather than failed. `PLACE_TRANSITIONS` has no self-edge —
       * `published → published` is not a legal move — and reporting that as
       * "cannot publish" on a place that *is* published would be true about the
       * transition table and nonsense to the person reading it.
       */
      met: place.status === target || PLACE_TRANSITIONS[place.status].includes(target),
      detail: { from: place.status, to: target },
    },
    { id: 'permission', kind: 'required', met: canTransition },

    // ---- Advisory: quality, not law. ---------------------------------------
    {
      id: 'coordinates',
      kind: 'suggested',
      // `geom` is NOT NULL on the server, so this is really "did the read
      // carry them" — a place without them on screen cannot be placed on a map.
      met: place.lat != null && place.lng != null,
    },
    { id: 'address', kind: 'suggested', met: Boolean(place.addressText?.trim()) },
    { id: 'area', kind: 'suggested', met: Boolean(place.areaKey?.trim()) },
    { id: 'hours', kind: 'suggested', met: knownDays > 0, detail: { days: knownDays } },
    {
      id: 'photo',
      kind: 'suggested',
      // Only approved photos reach consumers, so a pending upload is not one.
      met: approvedPhotos > 0,
      detail: { approved: approvedPhotos, total: place.media.length },
    },
    { id: 'price', kind: 'suggested', met: place.prices.length > 0 },
    { id: 'description', kind: 'suggested', met: Boolean(place.description?.trim()) },
    { id: 'freshness', kind: 'suggested', met: isFresh(place.freshnessCheckedAt) },
  ]
}

/** Only the blocking half decides whether the CTA can fire. */
export function blockingFailures(items: readonly ChecklistItem[]): ChecklistItem[] {
  return items.filter((item) => item.kind === 'required' && !item.met)
}

export function suggestionsUnmet(items: readonly ChecklistItem[]): ChecklistItem[] {
  return items.filter((item) => item.kind === 'suggested' && !item.met)
}
