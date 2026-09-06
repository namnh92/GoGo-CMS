import { useT } from '@/shared/i18n/i18n'
import { Button } from '@/shared/ui/Button'
import { styles } from './publishChecklist.style'

/**
 * GoGo-CMS#127 — the coordinates, said plainly.
 *
 * What was here before was a grey rounded box with a coral dot pinned to its
 * centre and the numbers in the corner. It was not a map and never had been:
 * no tiles, no library, no request — the dot sat in the middle whatever the
 * coordinates were. On screen it read as a map that had failed to load, which
 * is the worst of the three options, because an operator cannot tell a broken
 * integration from a deliberate absence.
 *
 * The issue offers the choice: a real map through an existing integration, or
 * an honest coordinate view with a way to open a real map. There is no map
 * library in this client and adding a provider is explicitly out of scope, so
 * this is the second — labelled as what it is, with the numbers readable and
 * copyable and a link that opens the point somewhere that *does* draw maps.
 *
 * The link is a plain `google.com/maps` URL built from the coordinates. It
 * costs nothing, calls no API, and needs no key: it is a hyperlink, not an
 * integration.
 */
export function PlaceLocationPanel({
  lat,
  lng,
  name,
}: {
  lat: number | null | undefined
  lng: number | null | undefined
  name: string
}) {
  const t = useT()
  const hasPoint = lat != null && lng != null

  if (!hasPoint) {
    return (
      <div className={styles.geoGrid}>
        <p className={styles.geoLabel}>{t('placeEditor.location.title')}</p>
        <p className={styles.geoMissing}>{t('placeEditor.location.none')}</p>
      </div>
    )
  }

  const pair = `${lat.toFixed(6)}, ${lng.toFixed(6)}`
  // `q=` with a lat/lng pair is the documented "show me this point" form.
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`

  return (
    <div className={styles.geoGrid}>
      <p className={styles.geoLabel}>{t('placeEditor.location.title')}</p>
      <div className={styles.geoRow}>
        <span className={styles.geoValue}>{pair}</span>
        <span className={styles.geoActions}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              // Best effort: a browser without clipboard permission simply does
              // nothing, and the numbers are selectable on screen regardless.
              void navigator.clipboard?.writeText(pair).catch(() => undefined)
            }}
          >
            {t('placeEditor.location.copy')}
          </Button>
          <a
            className={styles.geoLink}
            href={mapsUrl}
            target="_blank"
            rel="noreferrer noopener"
            aria-label={t('placeEditor.location.openFor', { name })}
          >
            {t('placeEditor.location.open')}
          </a>
        </span>
      </div>
      <p className={styles.geoMissing}>{t('placeEditor.location.hint')}</p>
    </div>
  )
}
