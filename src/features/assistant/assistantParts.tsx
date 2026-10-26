import { useLabel, useT } from '@/shared/i18n/i18n'
import { StatusBadge, type BadgeShape, type Tone } from '@/shared/ui/Badge'
import type { AssistantDocumentStatus } from '@/shared/api/contracts-assistant'
import { diffLines, withContext } from './textDiff'
import { styles } from './assistant.style'

const DOC_TONE: Record<AssistantDocumentStatus, [Tone, BadgeShape]> = {
  draft: ['neutral', 'dot'],
  published: ['mint', 'check'],
  unpublished: ['amber', 'alert'],
}

export function DocumentStatusBadge({ status }: { status: AssistantDocumentStatus }) {
  const t = useT()
  const [tone, shape] = DOC_TONE[status]
  return <StatusBadge tone={tone} shape={shape} label={t(`assistant.status.${status}` as const)} />
}

const VERSION_TONE: Record<string, [Tone, BadgeShape]> = {
  draft: ['lavender', 'dot'],
  published: ['mint', 'check'],
  superseded: ['neutral', 'clock'],
  withdrawn: ['amber', 'alert'],
  discarded: ['neutral', 'info'],
}

/** `state` is extensible: an unknown value renders as itself, neutrally. */
export function VersionStateBadge({ state }: { state: string }) {
  const label = useLabel()
  const [tone, shape] = VERSION_TONE[state] ?? ['neutral', 'info']
  return (
    <StatusBadge
      tone={tone}
      shape={shape}
      label={label(`assistant.versionState.${state}`, state)}
    />
  )
}

/**
 * A line diff of two bodies. Added and removed lines carry a `+` / `−` sign
 * and a screen-reader word as well as their fill, so the change survives
 * greyscale and a screen reader.
 */
export function BodyDiff({
  before,
  after,
  label,
}: {
  before: string
  after: string
  /** Accessible name of the diff region. */
  label: string
}) {
  const t = useT()
  const diff = diffLines(before, after)
  return (
    <div className="flex flex-col gap-2">
      <p className={styles.diffSummary}>
        <span>{t('assistant.diff.added', { count: diff.added })}</span>
        <span>{t('assistant.diff.removed', { count: diff.removed })}</span>
      </p>
      {diff.tooLarge ? (
        <p className={styles.note}>{t('assistant.diff.tooLarge')}</p>
      ) : diff.added === 0 && diff.removed === 0 ? (
        <p className={styles.fieldSame}>{t('assistant.diff.noChange')}</p>
      ) : (
        <div role="region" aria-label={label} className={styles.diff}>
          {withContext(diff.lines).map((row, index) => {
            if (row.kind === 'skip') {
              return (
                <p key={index} className={styles.diffSkip}>
                  {t('assistant.diff.unchanged', { count: row.count })}
                </p>
              )
            }
            const className =
              row.kind === 'added'
                ? styles.diffAdded
                : row.kind === 'removed'
                  ? styles.diffRemoved
                  : styles.diffSame
            const sign = row.kind === 'added' ? '+' : row.kind === 'removed' ? '−' : ' '
            return (
              <p key={index} className={className}>
                <span aria-hidden="true" className={styles.diffSign}>
                  {sign}
                </span>
                {row.kind !== 'same' ? (
                  <span className="sr-only">
                    {row.kind === 'added'
                      ? t('assistant.diff.srAdded')
                      : t('assistant.diff.srRemoved')}
                  </span>
                ) : null}
                <span className={styles.diffText}>{row.text || ' '}</span>
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** One short field (title, description) before → after, or "unchanged". */
export function FieldDiff({
  label,
  before,
  after,
}: {
  label: string
  before: string | null | undefined
  after: string | null | undefined
}) {
  const t = useT()
  const from = before ?? ''
  const to = after ?? ''
  return (
    <div className={styles.fieldDiff}>
      <p className={styles.fieldDiffLabel}>{label}</p>
      {from === to ? (
        <p className={styles.fieldSame}>
          {t('assistant.diff.unchangedField')}: {to || '—'}
        </p>
      ) : (
        <p className="flex flex-wrap items-center gap-2 text-body">
          <span className={styles.fieldFrom}>
            <span className="sr-only">{t('assistant.diff.srRemoved')} </span>
            {from || '—'}
          </span>
          <span aria-hidden="true" className="text-text-secondary">
            →
          </span>
          <span className={styles.fieldTo}>
            <span className="sr-only">{t('assistant.diff.srAdded')} </span>
            {to || '—'}
          </span>
        </p>
      )}
    </div>
  )
}

/** Title, description and body of two versions, in reading order. */
export function VersionDiff({
  before,
  after,
}: {
  before: { title: string; description: string; body: string } | null
  after: { title: string; description: string; body: string } | null
}) {
  const t = useT()
  return (
    <div className="flex flex-col gap-3">
      <FieldDiff label={t('assistant.field.title')} before={before?.title} after={after?.title} />
      <FieldDiff
        label={t('assistant.field.description')}
        before={before?.description}
        after={after?.description}
      />
      <div className={styles.fieldDiff}>
        <p className={styles.fieldDiffLabel}>{t('assistant.field.body')}</p>
        <BodyDiff
          before={before?.body ?? ''}
          after={after?.body ?? ''}
          label={t('assistant.diff.regionLabel')}
        />
      </div>
    </div>
  )
}
