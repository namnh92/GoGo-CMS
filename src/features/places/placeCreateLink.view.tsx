import { useState } from 'react'

import { toApiError, type ApiError } from '@/shared/api/errors'
import { useLabel, useT } from '@/shared/i18n/i18n'
import { Button, Spinner } from '@/shared/ui/Button'
import { StatusBadge } from '@/shared/ui/Badge'
import { TextInput } from '@/shared/ui/Field'
import { AlertIcon, CheckIcon, InfoIcon } from '@/shared/ui/icons'
import { useErrorMessage } from '@/shared/ui/State'
import { useOnline } from '@/shared/ui/useOnline'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { resolvePlaceLink, type ResolveLinkResult } from './api'
import { readGoogleLink, type GoogleLinkReading } from './googleLink'
import { styles } from './placeCreateLink.style'

/**
 * Google publishes coordinates to seven decimals; JSON hands back the double
 * nearest to that, and `10.7951153` arrives as `10.795115299999999`. Put
 * straight into a number input it renders all sixteen digits, which reads as a
 * broken value — the first thing an editor saw on cms-dev.
 *
 * Rounding back to seven puts the number where Google had it. The seventh
 * decimal is about a centimetre; nothing downstream can tell the difference,
 * and the duplicate check works in metres.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 1e7) / 1e7
}

/**
 * What the editor gets to apply.
 *
 * Two halves, and the split is the point. The top block is **theirs**: it lands
 * in form boxes, they may change any of it before submitting, and whatever they
 * leave alone is recorded `google_derived`. `lat`/`lng` travel together — one
 * position, one provenance row.
 *
 * `provider` is **not** theirs and is not editable. Rating, review count, the
 * week and the canonical link are facts GoGo-BE fetches for itself when the
 * place is created (PI-BE-021 / ADR-0020), so the panel renders them as what
 * the row will carry rather than as inputs. A box an editor could type a Google
 * rating into would be a box for authoring one.
 */
export type AppliedResolution = {
  googlePlaceId: string
  name: string
  addressText: string
  lat: number
  lng: number
  /**
   * ADM-017 — from the coordinate, against GoGo's own boundaries. Empty string
   * where the resolve could not name a unit: the selector then opens empty
   * rather than on a guess, and Google's address components are never used.
   */
  provinceCode: string
  communeCode: string
  /** PI-BE-021 — a taxonomy key the server already checked exists. */
  categoryKey: string
  provider: {
    googleMapsUri: string | null
    rating: number | null
    ratingCount: number | null
    priceLevel: number | null
    openingHourCount: number
  }
}

/**
 * GoGo-CMS#157 — the front door of the create form.
 *
 * The form used to open on a latitude box. Coordinates typed by hand are the
 * most reliable way to put a pin on the wrong street, and a place entered that
 * way carries no Google Place ID — so it sits outside provider dedup and
 * nothing can ever refresh it. The link is what an editor actually has.
 *
 * Two halves, and the split matters. **Recognising** a link is string work on a
 * URL and happens here as the editor types (`readGoogleLink`, #126) — it costs
 * nothing and answers instantly. **Resolving** one needs an SSRF-safe redirect
 * hop and, for a name, the Places API; that is a server call behind
 * `place.write`, and it costs money, so it happens on a button press and never
 * on a keystroke.
 *
 * Typing everything by hand is still a complete path. Not every place is on
 * Google — a new stall, a private room — and a link that will not resolve must
 * not become a wall.
 */
export function PlaceCreateLinkPanel({
  onApply,
  onResolveStart,
}: {
  onApply: (values: AppliedResolution) => void
  /**
   * Fired the moment a resolve leaves, so the form can remember what it held.
   * That snapshot is what lets an apply skip a box the editor has typed in
   * since — a late answer must not land on newer work.
   */
  onResolveStart?: () => void
}) {
  const t = useT()
  const label = useLabel()
  const navigate = useNavigate()
  const online = useOnline()
  const describeError = useErrorMessage()
  const [url, setUrl] = useState('')
  const [answer, setAnswer] = useState<{
    /** The URL this answer is about, or null when a branch id was resolved. */
    answersFor: string | null
    data: ResolveLinkResult
  } | null>(null)
  const [failure, setFailure] = useState<ApiError | null>(null)
  /** Which branch is being resolved, so only that row shows the spinner. */
  const [picking, setPicking] = useState<string | null>(null)

  const reading = readGoogleLink(url)
  const resolvable =
    reading.kind === 'place_id' || reading.kind === 'short_link' || reading.kind === 'hints'

  const resolve = useMutation({
    mutationFn: (ask: { url: string } | { googlePlaceId: string }) => resolvePlaceLink(ask),
    onMutate: (ask) => {
      // A branch that turns out to be unresolvable must leave the list it was
      // picked from on screen — otherwise one bad pick empties the panel and
      // the editor has to paste the link again to get the other two back.
      if ('url' in ask) setAnswer(null)
      setFailure(null)
      onResolveStart?.()
    },
    /**
     * GoGo-CMS#179 — the answer is stored with the link it answers about.
     *
     * Resolving takes a second or two, and an editor does not wait: they paste
     * a different link while the first is still in flight. The answer then
     * arrives about a URL that is no longer in the box, and applying it would
     * fill the form from a place the editor has already moved on from —
     * silently, because the preview looks exactly like a fresh one.
     *
     * Keeping the URL beside the result is what makes that visible. The answer
     * is not thrown away — it was paid for, and re-pasting the old link would
     * pay for it again — it simply stops being applicable until the box agrees
     * with it.
     */
    onSuccess: (data, ask) => setAnswer({ answersFor: 'url' in ask ? ask.url : null, data }),
    // The link the editor pasted stays in the box: a provider that is down is
    // a reason to press the button again, not to retype the URL.
    onError: (error) => setFailure(toApiError(error)),
  })

  const result = answer?.data ?? null
  const candidate = result?.candidate
  /**
   * The answer on screen is about a link the box no longer holds.
   *
   * Not an error and not thrown away — it is a real answer GoGo paid for, and
   * it is still the answer to the question that was asked. It has simply
   * stopped being the answer to the one the form is now about, so it may be
   * read and may not be applied.
   */
  const answersOldLink = answer?.answersFor != null && answer.answersFor !== url.trim()

  return (
    <div className={styles.wrap}>
      <p className={styles.intro}>{t('placeCreate.link.intro')}</p>

      <div className={styles.row}>
        <TextInput
          className={styles.input}
          label={t('placeCreate.link.label')}
          hint={t('placeCreate.link.hint')}
          placeholder="https://maps.app.goo.gl/…"
          value={url}
          autoFocus
          onChange={(event) => setUrl(event.target.value)}
        />
        <Button
          type="button"
          variant="secondary"
          loading={resolve.isPending}
          disabled={!resolvable || !online}
          onClick={() => {
            setPicking(null)
            resolve.mutate({ url: url.trim() })
          }}
        >
          {t('placeCreate.link.resolve')}
        </Button>
      </div>

      {/*
        Read as they type. A host that only looks like Google is caught before
        anything is spent asking a provider about it.
      */}
      {reading.kind === 'empty' ? null : (
        <p className={styles.reading} role="status">
          <LinkReading reading={reading} t={t} />
        </p>
      )}

      {candidate && result?.status === 'RESOLVED' ? (
        <div className={styles.preview} role="status" aria-live="polite">
          <p className={styles.previewTitle}>
            <CheckIcon size={14} aria-hidden="true" />
            {t('placeCreate.link.found')}
          </p>
          <p className={styles.previewName}>{candidate.name}</p>
          {candidate.address ? <p className={styles.previewAddress}>{candidate.address}</p> : null}
          <div className={styles.previewFacts}>
            {/* The same number the boxes will hold — a preview that rounds
                differently from what it applies is its own small lie. */}
            <span className={styles.previewCoords}>
              {`${roundCoordinate(candidate.location.lat)}, ${roundCoordinate(candidate.location.lng)}`}
            </span>
            {/*
              PI-BE-021 / ADR-0020. The rating is the provider's and is stored
              as the provider's: GoGo-BE fetches it again for itself when the
              place is created, so nothing here authors it. It also still does
              what it always did — tell two branches of one chain apart.
            */}
            {typeof candidate.googleRating === 'number' ? (
              <span>
                {t('placeCreate.link.rating', {
                  rating: candidate.googleRating.toFixed(1),
                  count: String(candidate.googleRatingCount ?? 0),
                })}
              </span>
            ) : null}
          </div>

          {/*
            ADM-017 — where the coordinate falls, against GoGo's own pinned
            boundaries. Never Google's address components: those are the
            provider's opinion of an address, and the codes GoGo stores have to
            be reproducible from geometry (ADR-0019 §10).

            Two levels, and only two. The district tier was dissolved on
            2025-07-01; nothing here names one.
          */}
          {result.administrative &&
          (result.administrative.provinceName || result.administrative.communeName) ? (
            <p className={styles.previewUnits}>
              {[result.administrative.provinceName, result.administrative.communeName]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : null}

          {/*
            What the row will carry, rendered as facts rather than as inputs —
            there is no box here to type a Google rating into. A value the
            provider does not publish is left out entirely: an em dash where a
            price or a rating belongs reads as "free" to some people and
            "broken" to the rest.
          */}
          <dl className={styles.providerFacts}>
            {candidate.googleMapsUri ? (
              <div>
                <dt className={styles.providerLabel}>{t('placeCreate.link.canonicalUrl')}</dt>
                <dd>
                  <a
                    className={styles.providerLink}
                    href={candidate.googleMapsUri}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {t('placeCreate.link.openInMaps')}
                  </a>
                </dd>
              </div>
            ) : null}
            {candidate.openingHours.length > 0 ? (
              <div>
                <dt className={styles.providerLabel}>{t('placeCreate.link.hours')}</dt>
                <dd className={styles.providerValue}>
                  {t('placeCreate.link.hoursCount', {
                    count: String(candidate.openingHours.length),
                  })}
                </dd>
              </div>
            ) : null}
            {typeof candidate.priceLevel === 'number' ? (
              <div>
                <dt className={styles.providerLabel}>{t('placeCreate.link.priceLevel')}</dt>
                <dd className={styles.providerValue}>{`${candidate.priceLevel}/4`}</dd>
              </div>
            ) : null}
            {candidate.categoryKey ? (
              <div>
                <dt className={styles.providerLabel}>{t('placeCreate.link.category')}</dt>
                {/* A taxonomy key is stable by contract but the client does
                    not assume the server's vocabulary is closed: an unknown key
                    renders as itself rather than as a blank cell. */}
                <dd className={styles.providerValue}>
                  {label(`taxonomy.key.${candidate.categoryKey}`, candidate.categoryKey)}
                </dd>
              </div>
            ) : null}
          </dl>
          <p className={styles.providerNote}>{t('placeCreate.link.providerNote')}</p>

          {candidate.attributions.length > 0 ? (
            <p className={styles.attribution}>{candidate.attributions.join(' · ')}</p>
          ) : null}
          {/*
            Rule 16 — a control that cannot do what it says must not look
            operable. The answer stays on screen because it is still a real
            answer; the button says why it will not act on it, and resolving
            the link now in the box makes it applicable again.
          */}
          {answersOldLink ? (
            <p className={styles.staleNote} role="status">
              <InfoIcon size={14} aria-hidden="true" />
              {t('placeCreate.link.stale')}
            </p>
          ) : null}
          <div className={styles.actions}>
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={answersOldLink}
              onClick={() =>
                onApply({
                  googlePlaceId: candidate.googlePlaceId,
                  name: candidate.name,
                  addressText: candidate.address,
                  lat: roundCoordinate(candidate.location.lat),
                  lng: roundCoordinate(candidate.location.lng),
                  provinceCode: result.administrative?.provinceCode ?? '',
                  communeCode: result.administrative?.communeCode ?? '',
                  categoryKey: candidate.categoryKey ?? '',
                  provider: {
                    googleMapsUri: candidate.googleMapsUri ?? null,
                    rating: candidate.googleRating ?? null,
                    ratingCount: candidate.googleRatingCount ?? null,
                    priceLevel: candidate.priceLevel ?? null,
                    openingHourCount: candidate.openingHours.length,
                  },
                })
              }
            >
              {t('placeCreate.link.apply')}
            </Button>
            <span className={styles.intro}>{t('placeCreate.link.applyNote')}</span>
          </div>
        </div>
      ) : null}

      {result?.status === 'ALREADY_EXISTS' && result.existingPlaceId ? (
        <div className={styles.question} role="status" aria-live="polite">
          <p className={styles.questionTitle}>
            <InfoIcon size={14} aria-hidden="true" />
            {t('placeCreate.link.exists')}
          </p>
          <p className={styles.questionBody}>{t('placeCreate.link.existsBody')}</p>
          <div className={styles.actions}>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => navigate(`/places/${result.existingPlaceId}`)}
            >
              {t('placeCreate.link.existsOpen')}
            </Button>
          </div>
        </div>
      ) : null}

      {/*
        GoGo-CMS#160. The first cut of this rendered the branches read-only,
        under a comment claiming a button here "could only fail" because the
        candidates carry no position. That was wrong: each carries a real Google
        Place ID, and what was missing was an endpoint that took one — which
        GoGo-BE#469 added by exposing a resolver that already existed. Rule 16
        offers two ways out of a dead control and wiring it to a real path is
        the better one.

        Picking re-enters `resolve` with that id, so a chosen branch lands on
        the same preview, the same `ALREADY_EXISTS`, the same everything as a
        link that had named it outright.
      */}
      {result?.status === 'CANDIDATE_SELECTION' && result.candidates.length > 0 ? (
        <div className={styles.question} role="status" aria-live="polite">
          {/*
            One candidate is not "several branches". The server still asks for a
            person when it is confident enough to offer a match but not enough
            to take it, and that happens with a single result — telling the
            editor the link matched several places when it matched one is a
            small lie they can see.
          */}
          <p className={styles.questionTitle}>
            <AlertIcon size={14} aria-hidden="true" />
            {t(
              result.candidates.length === 1
                ? 'placeCreate.link.oneMaybe'
                : 'placeCreate.link.ambiguous',
            )}
          </p>
          <p className={styles.questionBody}>
            {t(
              result.candidates.length === 1
                ? 'placeCreate.link.oneMaybeBody'
                : 'placeCreate.link.ambiguousBody',
            )}
          </p>
          <ul className={styles.candidateList}>
            {result.candidates.map((option) => (
              <li key={option.googlePlaceId}>
                <button
                  type="button"
                  className={styles.candidate}
                  // One branch at a time: two in flight would race to fill the
                  // same form, and the loser would win.
                  disabled={resolve.isPending || !online}
                  aria-busy={picking === option.googlePlaceId || undefined}
                  onClick={() => {
                    setPicking(option.googlePlaceId)
                    resolve.mutate({ googlePlaceId: option.googlePlaceId })
                  }}
                >
                  <span className={styles.candidateName}>
                    {picking === option.googlePlaceId && resolve.isPending ? (
                      <Spinner className={styles.candidateSpinner} />
                    ) : null}
                    {option.name}
                  </span>
                  {option.address ? (
                    <span className={styles.candidateAddress}>{option.address}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result?.status === 'UNRESOLVED' ? (
        <div className={styles.question} role="status" aria-live="polite">
          <p className={styles.questionTitle}>
            <AlertIcon size={14} aria-hidden="true" />
            {t('placeCreate.link.unresolved')}
          </p>
          <p className={styles.questionBody}>{t('placeCreate.link.unresolvedBody')}</p>
        </div>
      ) : null}

      {failure ? (
        <div className={styles.problem} role="alert">
          <p className={styles.problemTitle}>
            <AlertIcon size={14} aria-hidden="true" />
            {t('placeCreate.link.failed')}
          </p>
          {/*
            A provider GoGo cannot reach says nothing about the link. Presenting
            it as "địa điểm không tồn tại" is the mistake GoGo-BE#279 exists to
            prevent, so the envelope's own message is what shows.
          */}
          <p className={styles.problemBody}>{describeError(failure)}</p>
        </div>
      ) : null}
    </div>
  )
}

function LinkReading({ reading, t }: { reading: GoogleLinkReading; t: ReturnType<typeof useT> }) {
  switch (reading.kind) {
    case 'place_id':
      return <StatusBadge tone="mint" shape="check" label={t('googleLink.read.placeId')} />
    case 'short_link':
      return <StatusBadge tone="neutral" shape="clock" label={t('googleLink.read.shortLink')} />
    case 'hints':
      return (
        <>
          <StatusBadge tone="neutral" shape="info" label={t('googleLink.read.hints')} />
          {reading.query ? (
            <span>{t('googleLink.read.hintsName', { name: reading.query })}</span>
          ) : null}
        </>
      )
    case 'foreign_host':
      return (
        <StatusBadge
          tone="danger"
          shape="alert"
          label={t('googleLink.read.foreignHost', { host: reading.host })}
        />
      )
    case 'invalid':
      return <StatusBadge tone="danger" shape="alert" label={t('googleLink.read.invalid')} />
    default:
      return null
  }
}
