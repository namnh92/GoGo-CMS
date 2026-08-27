import { useI18n, useT } from '@/shared/i18n/i18n'
import { formatDateTime } from '@/shared/format'
import type { AuditEntry } from '@/shared/api/contracts'
import { EmptyState } from './State'

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Audit is a feature, not a log: ops must be able to read who changed what,
 * as a before/after diff, without opening a database.
 */
export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  const t = useT()
  const { locale } = useI18n()

  if (entries.length === 0) return <EmptyState title={t('audit.empty')} hint={null} />

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => {
        const keys = Array.from(
          new Set([...Object.keys(entry.before ?? {}), ...Object.keys(entry.after ?? {})]),
        )
        return (
          <li key={entry.id} className="rounded-card border border-line bg-surface p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold text-text">
                {entry.actor} <span className="font-normal text-text-muted">{entry.action}</span>
              </p>
              <time className="text-xs tabular-nums text-text-subtle" dateTime={entry.at}>
                {formatDateTime(entry.at, locale)}
              </time>
            </div>
            {keys.length > 0 ? (
              <dl className="mt-2 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
                {keys.map((key) => (
                  <div key={key} className="contents">
                    <dt className="font-mono text-text-subtle">{key}</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-danger-soft px-1.5 py-0.5 text-danger line-through">
                        {renderValue(entry.before?.[key])}
                      </span>
                      <span aria-hidden="true" className="text-text-subtle">
                        →
                      </span>
                      <span className="rounded bg-mint-soft px-1.5 py-0.5 text-text">
                        {renderValue(entry.after?.[key])}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
