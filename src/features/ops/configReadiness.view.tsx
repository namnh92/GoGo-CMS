import { Fragment, useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import type { MessageKey } from '@/shared/i18n/vi'
import { queryKeys } from '@/shared/api/queryKeys'
import { formatDateTime } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { StatusBadge, type Tone, type BadgeShape } from '@/shared/ui/Badge'
import { AsyncBoundary, EmptyState, PermissionDeniedState, TableSkeleton } from '@/shared/ui/State'
import { useSession } from '@/shared/auth/session'
import type {
  ConfigCapability,
  ConfigInfra,
  ConfigInfraRow,
  ConfigReadiness,
  ConfigVariable,
  ReadinessVerdict,
} from '@/shared/api/contracts-config-readiness'
import { fetchConfigReadiness } from './api'
import { styles } from './configReadiness.style'

/**
 * GoGo-CMS#264 (OPS-CMS-002; GoGo-Infra#309 D-10) — "Cấu hình môi trường".
 *
 * One table per environment, by capability: is the feature ready, how many
 * rows keep it from it, and — expanded — each row's state as chips with text,
 * never colour alone. The page reads `/v1/cms/ops/config-readiness` and
 * nothing else: no AWS, no PromQL, and no value of any variable ever reaches
 * it — the response carries names and booleans only.
 *
 * It decides nothing. Every verdict is GoGo-Infra's, copied by GoGo-BE
 * (A-F-11); the page renders `ssm_verdict` and `process_ready` as given and
 * shows `ssm_present` as a count, never as readiness. It is a dated snapshot of
 * one deploy, and says so. There are no action buttons: keys are written with
 * `put.sh` by the owner, and a control that does nothing is worse than none.
 */
export default function ConfigReadinessScreen() {
  const t = useT()
  const { can } = useSession()
  const allowed = can('ops.dashboard')

  const query = useQuery({
    queryKey: queryKeys.opsConfigReadiness,
    queryFn: ({ signal }) => fetchConfigReadiness(signal),
    // A snapshot changes on a deploy, not by the minute.
    staleTime: 60_000,
    enabled: allowed,
  })

  const header = (
    <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('configReadiness.title')} />
  )

  // The nav hides the entry, the server refuses the call (403) — this is
  // neither check, it only keeps the screen from asking.
  if (!allowed) {
    return (
      <>
        {header}
        <PageBody>
          <PermissionDeniedState hint={t('configReadiness.denied')} />
        </PageBody>
      </>
    )
  }

  return (
    <>
      {header}
      <PageBody>
        <p className={styles.note}>{t('configReadiness.subtitle')}</p>
        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={query.data}
          onRetry={() => void query.refetch()}
          loading={
            <Card>
              <CardHeader title={t('configReadiness.capabilities.title')} />
              <TableSkeleton rows={6} cols={6} />
            </Card>
          }
        >
          {(data) => <Readiness data={data} />}
        </AsyncBoundary>
      </PageBody>
    </>
  )
}

function Readiness({ data }: { data: ConfigReadiness }) {
  const t = useT()
  return (
    <div className={styles.stack}>
      {data.infra ? (
        <Environment infra={data.infra} capabilities={data.capabilities} />
      ) : (
        <EmptyState
          title={t('configReadiness.empty.title')}
          hint={t(`configReadiness.reason.${data.reason ?? 'missing'}` as MessageKey)}
        />
      )}
      <ProcessCard title={t('configReadiness.process.title')} variables={data.process} />
      {data.process_dynamic.length > 0 ? (
        <ProcessCard title={t('configReadiness.dynamic.title')} variables={data.process_dynamic} />
      ) : null}
    </div>
  )
}

function Environment({
  infra,
  capabilities,
}: {
  infra: ConfigInfra
  capabilities: ConfigCapability[]
}) {
  const t = useT()
  const { locale } = useI18n()
  const core = infra.rows.filter((r) => r.capabilities.length === 0)
  return (
    <Card>
      <CardHeader
        title={t('configReadiness.env', { env: infra.env })}
        hint={
          <span className={styles.meta}>
            <span>
              {t('configReadiness.snapshot', {
                at: formatDateTime(infra.generated_at, locale),
              })}
            </span>
            <span className={styles.mono}>{infra.deploy_id}</span>
          </span>
        }
      />
      <CardBody className={styles.stack}>
        {infra.deploy_match ? null : (
          <p role="status" className={`${styles.banner} ${styles.bannerWarn}`}>
            {t('configReadiness.deployMismatch')}
          </p>
        )}
        <p className={styles.note}>{t('configReadiness.snapshotNote')}</p>
        <div className={styles.scroller}>
          <table className={styles.table} aria-label={t('configReadiness.capabilities.title')}>
            <thead>
              <tr>
                <th className={styles.th} scope="col">
                  {t('configReadiness.col.capability')}
                </th>
                <th className={styles.th} scope="col">
                  {t('configReadiness.col.status')}
                </th>
                <th className={styles.th} scope="col">
                  {t('configReadiness.col.ssm')}
                </th>
                <th className={styles.thNum} scope="col">
                  {t('configReadiness.col.ssmPresent')}
                </th>
                <th className={styles.th} scope="col">
                  {t('configReadiness.col.process')}
                </th>
                <th className={styles.th} scope="col">
                  <span className="sr-only">{t('configReadiness.col.rows')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {capabilities.map((cap) => (
                <CapabilityRow
                  key={cap.name}
                  cap={cap}
                  rows={infra.rows.filter((r) => r.capabilities.includes(cap.name))}
                />
              ))}
              {core.length > 0 ? <CoreRow rows={core} /> : null}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}

const VERDICT: Record<ReadinessVerdict, { tone: Tone; shape: BadgeShape }> = {
  OK: { tone: 'mint', shape: 'check' },
  FAIL: { tone: 'danger', shape: 'alert' },
  UNKNOWN: { tone: 'amber', shape: 'info' },
}

function CapabilityRow({ cap, rows }: { cap: ConfigCapability; rows: ConfigInfraRow[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const id = `cap-${cap.name}`
  return (
    <Fragment>
      <tr>
        <th scope="row" className={`${styles.td} ${styles.name}`}>
          {cap.name}
        </th>
        <td className={styles.td}>
          <StatusBadge
            tone={cap.status === 'enabled' ? 'lavender' : 'neutral'}
            shape={cap.status === 'enabled' ? 'dot' : 'clock'}
            label={t(`configReadiness.status.${cap.status}`)}
          />
        </td>
        <td className={styles.td}>
          <div className={styles.chips}>
            <StatusBadge
              {...VERDICT[cap.ssm_verdict]}
              label={t(`configReadiness.verdict.${cap.ssm_verdict}`)}
            />
            {cap.ssm_missing.length > 0 ? (
              <span className="text-caption text-text-muted">
                {t('configReadiness.blockingCount', { count: cap.ssm_missing.length })}
              </span>
            ) : null}
          </div>
        </td>
        <td className={styles.tdNum}>
          {t('configReadiness.presentCount', {
            present: cap.ssm_present.present,
            total: cap.ssm_present.total,
          })}
        </td>
        <td className={styles.td}>
          <ProcessReady cap={cap} />
        </td>
        <td className={styles.td}>
          <ExpandToggle
            open={open}
            controls={id}
            count={rows.length}
            onToggle={() => setOpen(!open)}
          />
        </td>
      </tr>
      {open ? <DetailRow id={id} rows={rows} /> : null}
    </Fragment>
  )
}

function CoreRow({ rows }: { rows: ConfigInfraRow[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const id = 'cap-core'
  const failing = rows.filter((r) => r.verdict !== 'OK').length
  return (
    <Fragment>
      <tr>
        <th scope="row" className={`${styles.td} ${styles.name}`}>
          {t('configReadiness.core')}
        </th>
        <td className={styles.td} />
        <td className={styles.td}>
          {failing > 0 ? (
            <span className="text-caption text-text-muted">
              {t('configReadiness.failingRows', { count: failing })}
            </span>
          ) : null}
        </td>
        <td className={styles.tdNum} />
        <td className={styles.td} />
        <td className={styles.td}>
          <ExpandToggle
            open={open}
            controls={id}
            count={rows.length}
            onToggle={() => setOpen(!open)}
          />
        </td>
      </tr>
      {open ? <DetailRow id={id} rows={rows} /> : null}
    </Fragment>
  )
}

function ExpandToggle({
  open,
  controls,
  count,
  onToggle,
}: {
  open: boolean
  controls: string
  count: number
  onToggle: () => void
}) {
  const t = useT()
  return (
    <button
      type="button"
      className={styles.toggle}
      aria-expanded={open}
      aria-controls={controls}
      onClick={onToggle}
    >
      {open ? t('configReadiness.collapse') : t('configReadiness.expand', { count })}
    </button>
  )
}

function ProcessReady({ cap }: { cap: ConfigCapability }) {
  const t = useT()
  if (cap.process_ready === null) {
    return <StatusBadge tone="neutral" shape="info" label={t('configReadiness.process.na')} />
  }
  return (
    <div className={styles.chips}>
      <StatusBadge
        tone={cap.process_ready ? 'mint' : 'amber'}
        shape={cap.process_ready ? 'check' : 'alert'}
        label={t(
          cap.process_ready ? 'configReadiness.process.ready' : 'configReadiness.process.notReady',
        )}
      />
      {cap.process_missing.length > 0 ? (
        <span className="text-caption text-text-muted">
          {t('configReadiness.missingCount', { count: cap.process_missing.length })}
        </span>
      ) : null}
    </div>
  )
}

function DetailRow({ id, rows }: { id: string; rows: ConfigInfraRow[] }) {
  const t = useT()
  return (
    <tr id={id}>
      <td colSpan={6} className={styles.detailCell}>
        <table className={styles.table} aria-label={t('configReadiness.rows.title')}>
          <thead>
            <tr>
              <th className={styles.th} scope="col">
                {t('configReadiness.col.variable')}
              </th>
              <th className={styles.th} scope="col">
                {t('configReadiness.col.ssmState')}
              </th>
              <th className={styles.th} scope="col">
                {t('configReadiness.col.processState')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.path}>
                <th scope="row" className={styles.td}>
                  <span className={styles.name}>{row.env_var ?? '—'}</span>
                  <span className={`block ${styles.mono}`}>{row.path}</span>
                </th>
                <td className={styles.td}>
                  <RowChips row={row} />
                </td>
                <td className={styles.td}>
                  <ProcessChip row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  )
}

/**
 * The row's SSM state as the projection gives it: presence, its lifecycle
 * where that changes the reading (parked, retired, planned), and every
 * finding by name. Each chip carries text and a glyph.
 */
function RowChips({ row }: { row: ConfigInfraRow }) {
  const t = useT()
  const lifecycle =
    row.lifecycle === 'parked' || row.lifecycle === 'retired' || row.lifecycle === 'planned'
      ? row.lifecycle
      : null
  return (
    <div className={styles.chips}>
      <StatusBadge
        tone={row.presence === 'present' ? 'mint' : row.presence === 'absent' ? 'danger' : 'amber'}
        shape={row.presence === 'present' ? 'check' : row.presence === 'absent' ? 'alert' : 'info'}
        label={t(`configReadiness.chip.${row.presence}`)}
      />
      {lifecycle ? (
        <StatusBadge tone="lavender" shape="clock" label={t(`configReadiness.chip.${lifecycle}`)} />
      ) : null}
      {row.findings.map((finding) => (
        <StatusBadge key={finding} tone="amber" shape="alert" label={findingLabel(t, finding)} />
      ))}
    </div>
  )
}

function findingLabel(t: ReturnType<typeof useT>, finding: string): string {
  const key = `configReadiness.finding.${finding}` as MessageKey
  const label = t(key)
  // A finding a newer GoGo-Infra reports and this console has not heard of
  // yet shows by its code rather than not at all.
  return label === key ? finding : label
}

function ProcessChip({ row }: { row: ConfigInfraRow }) {
  const t = useT()
  if (row.applicable === 'host' || row.process_present === null) {
    return <StatusBadge tone="neutral" shape="info" label={t('configReadiness.chip.host')} />
  }
  return (
    <StatusBadge
      tone={row.process_present ? 'mint' : 'amber'}
      shape={row.process_present ? 'check' : 'alert'}
      label={t(
        row.process_present
          ? 'configReadiness.chip.processPresent'
          : 'configReadiness.chip.processAbsent',
      )}
    />
  )
}

function ProcessCard({ title, variables }: { title: string; variables: ConfigVariable[] }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const present = variables.filter((v) => v.present).length
  const absent = variables.filter((v) => !v.present)
  const id = useId()
  return (
    <Card>
      <CardHeader
        title={title}
        hint={t('configReadiness.presentCount', { present, total: variables.length })}
        actions={
          <ExpandToggle
            open={open}
            controls={id}
            count={variables.length}
            onToggle={() => setOpen(!open)}
          />
        }
      />
      <CardBody>
        <p className={styles.note}>{t('configReadiness.process.hint')}</p>
        {open ? (
          <div className={styles.scroller} id={id}>
            <table className={styles.table} aria-label={title}>
              <thead>
                <tr>
                  <th className={styles.th} scope="col">
                    {t('configReadiness.col.variable')}
                  </th>
                  <th className={styles.th} scope="col">
                    {t('configReadiness.col.processState')}
                  </th>
                  <th className={styles.th} scope="col">
                    {t('configReadiness.col.requirement')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...absent, ...variables.filter((v) => v.present)].map((v) => (
                  <tr key={v.name}>
                    <th scope="row" className={`${styles.td} ${styles.name}`}>
                      {v.name}
                    </th>
                    <td className={styles.td}>
                      <StatusBadge
                        tone={v.present ? 'mint' : 'neutral'}
                        shape={v.present ? 'check' : 'dot'}
                        label={t(
                          v.present
                            ? 'configReadiness.chip.processPresent'
                            : 'configReadiness.chip.processAbsent',
                        )}
                      />
                    </td>
                    <td className={styles.td}>
                      {t(
                        v.conditional
                          ? 'configReadiness.requirement.conditional'
                          : v.optional
                            ? 'configReadiness.requirement.optional'
                            : 'configReadiness.requirement.required',
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </CardBody>
    </Card>
  )
}
