import { useMemo, useState } from 'react'
import { useT } from '@/shared/i18n/i18n'
import { TextInput } from '@/shared/ui/Field'
import { Badge, StatusBadge } from '@/shared/ui/Badge'
import type { PlaceSource } from '@/shared/api/contracts'
import { compareIdentity, readGoogleLink } from './googleLink'
import { styles } from './googleLink.style'

/** GoGo-BE#334 renamed the provider; older fixtures still say `google_places`. */
export function findGoogleSource(sources: readonly PlaceSource[]): PlaceSource | undefined {
  return sources.find(
    (source) => source.provider === 'google' || source.provider === 'google_places',
  )
}

/**
 * GoGo-CMS#126 — paste a Google Maps link, learn what it names, and see how
 * that compares to the Google identity this place already holds.
 *
 * ## What this deliberately does not do
 *
 * The issue asks to "reuse the existing provider preview". **There is no
 * existing provider preview.** `POST /cms/places/{id}/provider-preview` and
 * `POST /cms/places/{id}/refresh` are not on `GoGo-BE develop`; GoGo-BE#341 is
 * open and titled *"CHẶN bởi quyết định chính sách PR0"*; GoGo-BE PR#365 and
 * GoGo-CMS PR#104 — the two that built it — were both closed unmerged when PR8
 * was cancelled. So it is not only *applying* provider fields that is blocked:
 * the comparison itself is.
 *
 * Rather than restore a cancelled feature or ship a button that could only
 * fail, the field-by-field comparison is rendered **visibly unavailable with
 * the reason** (`.claude/rules/core.md` §16 — no dead controls).
 *
 * ## What is genuinely unblocked
 *
 * Identity. A Place ID is an identifier, not content, and ADR-0006 §9.3 records
 * that Google's Service Specific Terms §3 permit storing one indefinitely. So
 * reading a link and comparing its id against `place_sources` needs no policy
 * decision — it is arithmetic on values GoGo already holds.
 *
 * Recognition happens in the browser because it is string work on a URL, not a
 * provider call. **Resolution does not**: a `maps.app.goo.gl` link needs an
 * SSRF-safe redirect hop and a name needs the Places API, both of which live in
 * `PlaceResolverService.identifyUrl()` behind no CMS route. A short link is
 * therefore reported as a short link and not guessed at.
 */
export function GoogleLinkPanel({ sources }: { sources: readonly PlaceSource[] }) {
  const t = useT()
  const [input, setInput] = useState('')
  const reading = useMemo(() => readGoogleLink(input), [input])
  const googleSource = findGoogleSource(sources)
  const comparison = compareIdentity(reading, googleSource?.externalId)

  return (
    <div className={styles.wrap}>
      <TextInput
        label={t('googleLink.label')}
        hint={t('googleLink.hint')}
        placeholder="https://www.google.com/maps/place/..."
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />

      {reading.kind === 'empty' ? null : (
        <div className={styles.reading} role="status">
          <Reading reading={reading} t={t} />
        </div>
      )}

      {comparison.kind !== 'unknown' ? (
        <div className={styles.comparison}>
          {comparison.kind === 'same' ? (
            <StatusBadge tone="mint" shape="check" label={t('googleLink.match.same')} />
          ) : comparison.kind === 'place_has_none' ? (
            <StatusBadge tone="amber" shape="info" label={t('googleLink.match.none')} />
          ) : (
            <StatusBadge tone="danger" shape="alert" label={t('googleLink.match.different')} />
          )}
          <dl className={styles.diff}>
            {comparison.kind === 'different' ? (
              <>
                <dt className={styles.diffKey}>{t('googleLink.stored')}</dt>
                <dd className={styles.diffValue}>{comparison.stored}</dd>
              </>
            ) : null}
            <dt className={styles.diffKey}>{t('googleLink.pasted')}</dt>
            <dd className={styles.diffValue}>
              {comparison.kind === 'same' ? googleSource?.externalId : comparison.pasted}
            </dd>
          </dl>
          {/*
            Linking an identity is a write no CMS route offers either — the
            place's Google link is set by import and by the dedup resolver, not
            from this screen. Saying that is better than a button that 404s.
          */}
          <p className={styles.note}>{t('googleLink.linkingNote')}</p>
        </div>
      ) : null}

      {/*
        The comparison the issue asks for, rendered as what it is: unavailable,
        with the reason and where the decision lives. Not a disabled button with
        no explanation, and not a working-looking one that would 404.
      */}
      <div className={styles.blocked}>
        <Badge tone="neutral">{t('googleLink.compare.unavailable')}</Badge>
        <p className={styles.blockedWhy}>{t('googleLink.compare.reason')}</p>
        <a
          className={styles.blockedLink}
          href="https://github.com/namnh92/GoGo-BE/issues/341"
          target="_blank"
          rel="noreferrer noopener"
        >
          {t('googleLink.compare.tracking')}
        </a>
      </div>
    </div>
  )
}

function Reading({
  reading,
  t,
}: {
  reading: ReturnType<typeof readGoogleLink>
  t: ReturnType<typeof useT>
}) {
  switch (reading.kind) {
    case 'place_id':
      // The id itself is printed once, in the comparison below — repeating it
      // here made the same string appear twice for one paste.
      return <StatusBadge tone="mint" shape="check" label={t('googleLink.read.placeId')} />
    case 'short_link':
      return (
        <>
          <StatusBadge tone="amber" shape="clock" label={t('googleLink.read.shortLink')} />
          <span className={styles.note}>{t('googleLink.read.shortLinkWhy')}</span>
        </>
      )
    case 'hints':
      return (
        <>
          <StatusBadge tone="amber" shape="info" label={t('googleLink.read.hints')} />
          <span className={styles.note}>
            {reading.query
              ? t('googleLink.read.hintsName', { name: reading.query })
              : reading.lat != null && reading.lng != null
                ? t('googleLink.read.hintsCoords', {
                    lat: reading.lat.toFixed(5),
                    lng: reading.lng.toFixed(5),
                  })
                : t('googleLink.read.hintsNothing')}
          </span>
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
