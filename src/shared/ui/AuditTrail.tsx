import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { formatDateTime } from '@/shared/format'
import type { AuditEntry } from '@/shared/api/contracts'
import { Badge } from './Badge'
import { EmptyState } from './State'

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `diff` is free-form JSON written by whichever service made the change, so
 * the shape is only a convention: most writes store `{ before, after }`, and
 * break-glass adds its own keys around them. Where that convention holds the
 * trail renders a field-by-field diff; where it does not, the raw payload is
 * shown rather than silently dropped.
 */
function splitDiff(diff: unknown): {
  before: Record<string, unknown>
  after: Record<string, unknown>
  rest: unknown
} {
  if (!isRecord(diff)) return { before: {}, after: {}, rest: diff ?? null }
  const before = isRecord(diff.before) ? diff.before : {}
  const after = isRecord(diff.after) ? diff.after : {}
  const rest = Object.fromEntries(
    Object.entries(diff).filter(([key]) => key !== 'before' && key !== 'after' && key !== 'reason'),
  )
  return { before, after, rest: Object.keys(rest).length > 0 ? rest : null }
}

/**
 * Audit is a feature, not a log: ops must be able to read who changed what,
 * as a before/after diff, without opening a database.
 */
export function AuditTrail({ entries }: { entries: AuditEntry[] }) {
  const t = useT()
  const label = useLabel()
  const { locale } = useI18n()

  if (entries.length === 0) return <EmptyState title={t('audit.empty')} hint={null} />

  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => {
        const { before, after, rest } = splitDiff(entry.diff)
        const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
        return (
          <li
            key={entry.id}
            className={`rounded-card border bg-surface p-3 ${
              entry.breakGlass ? 'border-danger/50' : 'border-line'
            }`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold text-text">
                {entry.actorRole ? t(`role.${entry.actorRole}` as const) : entry.actorType}{' '}
                <span className="font-normal text-text-muted">{entry.action}</span>
              </p>
              <time className="text-xs tabular-nums text-text-subtle" dateTime={entry.occurredAt}>
                {formatDateTime(entry.occurredAt, locale)}
              </time>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-subtle">
              {/* Colour is never the only signal: break-glass is also worded. */}
              {entry.breakGlass ? <Badge tone="danger">{t('audit.breakGlassBadge')}</Badge> : null}
              {entry.authorizationPath ? (
                <span>{label(`authPath.${entry.authorizationPath}`, entry.authorizationPath)}</span>
              ) : null}
              {entry.requestId ? <span className="font-mono">{entry.requestId}</span> : null}
              {/* Absent for roles that are not entitled to it — not an empty cell. */}
              {entry.ipAddress ? <span className="font-mono">{entry.ipAddress}</span> : null}
            </p>
            {entry.reason ? (
              <p className="mt-2 text-xs text-text-muted">
                <span className="text-text-subtle">{t('audit.reason')}: </span>
                {entry.reason}
              </p>
            ) : null}
            {keys.length > 0 ? (
              <dl className="mt-2 grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-3 gap-y-1 text-xs">
                {keys.map((key) => (
                  <div key={key} className="contents">
                    <dt className="font-mono text-text-subtle">{key}</dt>
                    <dd className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-danger-soft px-1.5 py-0.5 text-danger line-through">
                        {renderValue(before[key])}
                      </span>
                      <span aria-hidden="true" className="text-text-subtle">
                        →
                      </span>
                      <span className="rounded bg-mint-soft px-1.5 py-0.5 text-text">
                        {renderValue(after[key])}
                      </span>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {rest ? (
              <pre className="mt-2 max-h-40 overflow-auto rounded-compact bg-surface-sunken p-2 font-mono text-[11px] text-text-muted">
                {JSON.stringify(rest, null, 2)}
              </pre>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}
