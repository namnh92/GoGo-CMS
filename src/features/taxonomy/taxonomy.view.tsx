import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatNumber } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Select, TextInput, Toggle } from '@/shared/ui/Field'
import { DataTable } from '@/shared/ui/DataTable'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { PlusIcon } from '@/shared/ui/icons'
import type { Taxonomy, TaxonomyKind } from '@/shared/api/contracts'
import { addSynonym, createTaxonomy, fetchTaxonomies, updateTaxonomy } from './api'
import { styles } from './taxonomy.style'

const KINDS: TaxonomyKind[] = [
  'mood',
  'category',
  'setting',
  'dietary',
  'accessibility',
  'spending_style',
  'suitability',
]

export default function TaxonomyScreen() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [kind, setKind] = useState<TaxonomyKind>('mood')
  const [draft, setDraft] = useState({ key: '', labelVi: '', labelEn: '' })
  const [synonymDraft, setSynonymDraft] = useState<{ taxonomyId: string; term: string }>({
    taxonomyId: '',
    term: '',
  })

  const canManage = can('taxonomy.manage')

  const query = useQuery({
    queryKey: queryKeys.taxonomies.all,
    queryFn: ({ signal }) => fetchTaxonomies(signal),
  })

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: queryKeys.taxonomies.all })

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      updateTaxonomy(id, { isActive }),
    onSuccess: invalidate,
    onError: (error) => toast.error(describeError(error)),
  })

  const create = useMutation({
    mutationFn: () =>
      createTaxonomy({
        kind,
        key: draft.key,
        // vi is the source label; en is stored alongside, never instead.
        labels: { vi: draft.labelVi, ...(draft.labelEn ? { en: draft.labelEn } : {}) },
      }),
    onSuccess: () => {
      setDraft({ key: '', labelVi: '', labelEn: '' })
      toast.success(t('taxonomy.add'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const synonym = useMutation({
    mutationFn: () => addSynonym(synonymDraft.taxonomyId, synonymDraft.term, locale),
    onSuccess: () => {
      setSynonymDraft({ taxonomyId: '', term: '' })
      toast.success(t('taxonomy.addSynonym'))
      invalidate()
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const all = useMemo(() => query.data?.items ?? [], [query.data])
  const rows = useMemo(() => all.filter((item) => item.kind === kind), [all, kind])
  const countByKind = useMemo(() => {
    const counts = new Map<TaxonomyKind, number>()
    for (const item of all) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1)
    return counts
  }, [all])

  const columns = useMemo<ColumnDef<Taxonomy, unknown>[]>(
    () => [
      {
        id: 'key',
        header: () => t('taxonomy.col.key'),
        cell: ({ row }) => <span className={styles.key}>{row.original.key}</span>,
      },
      {
        id: 'labelVi',
        header: () => t('taxonomy.col.labelVi'),
        cell: ({ row }) => <span className={styles.label}>{row.original.labels.vi ?? '—'}</span>,
      },
      {
        id: 'labelEn',
        header: () => t('taxonomy.col.labelEn'),
        cell: ({ row }) => (
          <span className="text-[13px] text-text-muted">{row.original.labels.en ?? '—'}</span>
        ),
      },
      {
        id: 'order',
        header: () => t('taxonomy.col.order'),
        cell: ({ row }) => (
          <span className="tabular-nums text-[13px] text-text-muted">{row.original.sortOrder}</span>
        ),
      },
      {
        id: 'usage',
        header: () => t('taxonomy.col.usage'),
        cell: ({ row }) => (
          <span className={styles.usage}>{formatNumber(row.original.usageCount, locale)}</span>
        ),
      },
      {
        id: 'active',
        header: () => t('taxonomy.col.active'),
        cell: ({ row }) => (
          <Toggle
            label={`${row.original.key} ${t('taxonomy.col.active')}`}
            checked={row.original.isActive}
            disabled={!canManage || !online}
            onChange={(checked) => toggleActive.mutate({ id: row.original.id, isActive: checked })}
          />
        ),
        enableSorting: false,
      },
      {
        id: 'synonyms',
        header: () => t('taxonomy.synonyms'),
        cell: ({ row }) => (
          <div className="flex max-w-[16rem] flex-wrap gap-1">
            {row.original.synonyms.slice(0, 4).map((item) => (
              <span key={`${item.term}-${item.locale}`} className={styles.synonymTerm}>
                {item.term}
              </span>
            ))}
            {row.original.synonyms.length === 0 ? (
              <span className="text-[11px] text-text-subtle">—</span>
            ) : null}
          </div>
        ),
        enableSorting: false,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('places.col.actions')}</span>,
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              size="sm"
              variant="ghost"
              disabled={!canManage}
              onClick={() => setSynonymDraft({ taxonomyId: row.original.id, term: '' })}
            >
              {t('taxonomy.addSynonym')}
            </Button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    [t, locale, canManage, online, toggleActive],
  )

  if (!canManage) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('taxonomy.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const selectedSynonymTarget = all.find((item) => item.id === synonymDraft.taxonomyId)

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('taxonomy.breadcrumb') }]}
        title={t('taxonomy.title')}
      />
      <PageBody>
        <div className={styles.layout}>
          <nav className={styles.nav} aria-label={t('taxonomy.focus')}>
            <p className={styles.navTitle}>{t('taxonomy.focus')}</p>
            <div className="flex flex-col gap-0.5">
              {KINDS.map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-current={kind === item ? 'true' : undefined}
                  onClick={() => setKind(item)}
                  className={`${styles.navItem} ${kind === item ? styles.navActive : styles.navIdle}`}
                >
                  <span className="truncate">{t(`taxonomyKind.${item}` as const)}</span>
                  <span className={styles.navCount}>{countByKind.get(item) ?? 0}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className={styles.content}>
            <Card>
              <CardHeader
                title={t(`taxonomyKind.${kind}` as const)}
                hint={t('taxonomy.synonymsHint')}
              />
              <AsyncBoundary
                status={query.status}
                error={query.error}
                data={rows}
                isEmpty={(items) => items.length === 0}
                onRetry={() => void query.refetch()}
                empty={<EmptyState />}
              >
                {(items) => (
                  <DataTable
                    data={items}
                    columns={columns}
                    getRowId={(item) => item.id}
                    caption={t('taxonomy.title')}
                  />
                )}
              </AsyncBoundary>
            </Card>

            <Card>
              <CardHeader
                title={t('taxonomy.add')}
                hint={t('taxonomy.deleteBlocked', { count: 0 })}
              />
              <CardBody className="flex flex-col gap-3">
                <div className={styles.addRow}>
                  <Select
                    label={t('taxonomy.newKind')}
                    value={kind}
                    onChange={(event) => setKind(event.target.value as TaxonomyKind)}
                  >
                    {KINDS.map((item) => (
                      <option key={item} value={item}>
                        {t(`taxonomyKind.${item}` as const)}
                      </option>
                    ))}
                  </Select>
                  <TextInput
                    label={t('taxonomy.newKey')}
                    value={draft.key}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, key: event.target.value }))
                    }
                  />
                  <TextInput
                    label={t('taxonomy.col.labelVi')}
                    value={draft.labelVi}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, labelVi: event.target.value }))
                    }
                  />
                  <TextInput
                    label={t('taxonomy.col.labelEn')}
                    value={draft.labelEn}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, labelEn: event.target.value }))
                    }
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<PlusIcon size={14} />}
                    disabled={
                      !online || !/^[a-z0-9_]{2,40}$/.test(draft.key) || draft.labelVi.trim() === ''
                    }
                    loading={create.isPending}
                    onClick={() => create.mutate()}
                  >
                    {t('taxonomy.add')}
                  </Button>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardHeader title={t('taxonomy.synonyms')} hint={t('taxonomy.synonymsHint')} />
              <CardBody className="flex flex-col gap-3">
                {rows.flatMap((item) =>
                  item.synonyms.map((entry) => (
                    <div
                      key={`${item.id}-${entry.term}-${entry.locale}`}
                      className={styles.synonymRow}
                    >
                      <span className={styles.synonymTerm}>{entry.term}</span>
                      <span className={styles.arrow} aria-hidden="true">
                        →
                      </span>
                      <span className="text-[12px] font-semibold text-text">
                        {item.labels[locale] ?? item.key}
                      </span>
                      <span className="ml-auto font-mono text-[10px] text-text-subtle">
                        {entry.locale}
                      </span>
                    </div>
                  )),
                )}
                <div className="grid gap-3 md:grid-cols-3">
                  <Select
                    label={t('taxonomy.col.key')}
                    value={synonymDraft.taxonomyId}
                    onChange={(event) =>
                      setSynonymDraft((current) => ({ ...current, taxonomyId: event.target.value }))
                    }
                  >
                    <option value="">—</option>
                    {rows.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.labels[locale] ?? item.key}
                      </option>
                    ))}
                  </Select>
                  <TextInput
                    label={t('taxonomy.synonymTerm')}
                    value={synonymDraft.term}
                    onChange={(event) =>
                      setSynonymDraft((current) => ({ ...current, term: event.target.value }))
                    }
                  />
                  <div className="flex items-end">
                    <Button
                      variant="secondary"
                      disabled={
                        !online || !synonymDraft.taxonomyId || synonymDraft.term.trim() === ''
                      }
                      loading={synonym.isPending}
                      onClick={() => synonym.mutate()}
                    >
                      {t('taxonomy.addSynonym')}
                    </Button>
                  </div>
                </div>
                {selectedSynonymTarget && selectedSynonymTarget.usageCount > 0 ? (
                  <p className={styles.blocked}>
                    <span aria-hidden="true">ℹ</span>
                    {t('taxonomy.deleteBlocked', { count: selectedSynonymTarget.usageCount })}
                  </p>
                ) : null}
              </CardBody>
            </Card>
          </div>
        </div>
      </PageBody>
    </>
  )
}
