import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime } from '@/shared/format'
import { ApiError } from '@/shared/api/errors'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { TextArea, TextInput } from '@/shared/ui/Field'
import { Tabs } from '@/shared/ui/Tabs'
import { ConfirmDialog, type ChangeLine } from '@/shared/ui/Overlay'
import { AuditTrail } from '@/shared/ui/AuditTrail'
import { UnsavedChangesGuard } from '@/shared/ui/UnsavedChangesGuard'
import {
  AsyncBoundary,
  ErrorState,
  LoadingState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import { fetchAudit } from '@/features/audit/api'
import type {
  CmsAssistantDocumentDetail,
  CmsAssistantVersion,
  CmsAssistantVersionSummary,
} from '@/shared/api/contracts-assistant'
import type { MessageKey } from '@/shared/i18n/vi'
import {
  ASSISTANT_AUDIT_RESOURCE,
  fetchDocument,
  fetchVersion,
  publishVersion,
  unpublishDocument,
  updateDraft,
} from './api'
import { MarkdownPreview } from './markdownPreview'
import { DocumentVersions } from './documentVersions'
import { DocumentStatusBadge, VersionDiff } from './assistantParts'
import { useActorName } from './useActorName'
import { diffLines } from './textDiff'
import { styles } from './assistant.style'

type Tab = 'edit' | 'versions' | 'audit'
type Draft = { title: string; description: string; body: string }

/**
 * Refusals that mean "the document moved under you": the screen refetches and
 * says why, instead of retrying against a state the operator has not read.
 */
const REFRESH_AND_EXPLAIN: Record<string, MessageKey> = {
  VERSION_ALREADY_PUBLISHED: 'error.VERSION_ALREADY_PUBLISHED',
  DOCUMENT_NOT_PUBLISHED: 'error.DOCUMENT_NOT_PUBLISHED',
  VERSION_NOT_FOUND: 'error.VERSION_NOT_FOUND',
}

function editableOf(detail: CmsAssistantDocumentDetail): Draft {
  const source = detail.draft ?? detail.published
  return {
    title: source?.title ?? detail.document.title,
    description: source?.description ?? '',
    body: source?.body ?? '',
  }
}

/** A publish (or rollback) about to happen, with the full target version. */
type PublishPlan = { target: CmsAssistantVersion; rollback: boolean }

/**
 * One GoGo guide document: edit the draft, read the history, publish or
 * withdraw it (GoGo-CMS#249).
 *
 * Writes go to the draft only — a published version is immutable, so what the
 * assistant cited yesterday can always be read back. Publishing changes what
 * GoGo AI tells every user, so it is `ops_admin` only and always shows what
 * changes first.
 */
export default function DocumentDetailScreen() {
  const t = useT()
  const { locale } = useI18n()
  const { id = '' } = useParams()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()
  const actorName = useActorName()

  const canRead = can('assistant.read')
  const canDraft = can('assistant.draft')
  const canPublish = can('assistant.publish')
  const canAudit = can('audit.read')

  const [tab, setTab] = useState<Tab>('edit')
  const [mode, setMode] = useState<'write' | 'preview'>('write')

  const query = useQuery({
    queryKey: queryKeys.assistant.document(id),
    queryFn: ({ signal }) => fetchDocument(id, signal),
    enabled: canRead && Boolean(id),
  })
  const detail = query.data

  const audit = useQuery({
    queryKey: queryKeys.assistant.audit(id),
    queryFn: ({ signal }) =>
      fetchAudit({ resourceType: ASSISTANT_AUDIT_RESOURCE, resourceId: id, limit: 50 }, signal),
    enabled: canRead && canAudit && Boolean(id) && tab === 'audit',
  })

  // ── Draft editing ────────────────────────────────────────────────────────
  const [form, setForm] = useState<Draft>({ title: '', description: '', body: '' })
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  /** The colleague's draft that beat this save, kept so the editor can compare. */
  const [conflict, setConflict] = useState<CmsAssistantVersion | null>(null)
  /** What the form was loaded from — the baseline "unsaved" is measured against. */
  const [lastBase, setLastBase] = useState<Draft | null>(null)

  const base = useMemo(() => (detail ? editableOf(detail) : null), [detail])
  // Identity of what the form was loaded from: a refetch after someone else's
  // save must not silently replace what this editor is typing.
  const baseKey = detail
    ? `${detail.draft?.id ?? detail.published?.id ?? 'none'}:${detail.draft?.revision ?? 0}`
    : null

  useEffect(() => {
    if (!detail || !base || baseKey === loadedFrom) return
    if (loadedFrom !== null && isDirty(form, lastBase)) return
    setForm(base)
    setLastBase(base)
    setLoadedFrom(baseKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseKey])

  const dirty = isDirty(form, lastBase)

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: queryKeys.assistant.all })

  const save = useMutation({
    mutationFn: (input: { baseRevision: number; patch: Partial<Draft> }) =>
      updateDraft(id, { baseRevision: input.baseRevision, ...input.patch }),
    onSuccess: (next) => {
      toast.success(t('assistant.saved'))
      setConflict(null)
      const loaded = editableOf(next)
      queryClient.setQueryData(queryKeys.assistant.document(id), next)
      setForm(loaded)
      setLastBase(loaded)
      setLoadedFrom(
        `${next.draft?.id ?? next.published?.id ?? 'none'}:${next.draft?.revision ?? 0}`,
      )
      invalidate()
    },
    onError: async (error) => {
      if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
        // Read the draft that won, keep what this editor typed, and show both.
        const fresh = await queryClient.fetchQuery({
          queryKey: queryKeys.assistant.document(id),
          queryFn: ({ signal }) => fetchDocument(id, signal),
        })
        setConflict(fresh.draft)
        return
      }
      toast.error(describeError(error))
    },
  })

  const validate = (): boolean => {
    const next: typeof errors = {}
    if (form.title.trim().length === 0) next.title = t('assistant.error.title')
    if (form.body.trim().length === 0) next.body = t('assistant.error.body')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  /** `against` is what the server holds now: only fields that differ are sent. */
  const submitSave = (baseRevision: number, against: Draft | null) => {
    if (!validate()) return
    save.mutate({ baseRevision, patch: changedFields(form, against) })
  }

  // ── Publish / unpublish ──────────────────────────────────────────────────
  const [plan, setPlan] = useState<PublishPlan | null>(null)
  const [publishReason, setPublishReason] = useState('')
  const [unpublishOpen, setUnpublishOpen] = useState(false)
  const [unpublishReason, setUnpublishReason] = useState('')
  const [loadingPlan, setLoadingPlan] = useState(false)

  const onTransitionError = (error: unknown) => {
    const explained = error instanceof ApiError ? REFRESH_AND_EXPLAIN[error.code] : undefined
    setPlan(null)
    setUnpublishOpen(false)
    invalidate()
    toast.error(explained ? t(explained) : describeError(error))
  }

  const publish = useMutation({
    mutationFn: (input: { versionId: string; reason: string }) => publishVersion(id, input),
    onSuccess: (next) => {
      const number = next.published?.number ?? plan?.target.number ?? 0
      toast.success(t('assistant.published', { number }))
      setPlan(null)
      setPublishReason('')
      queryClient.setQueryData(queryKeys.assistant.document(id), next)
      invalidate()
    },
    onError: onTransitionError,
  })

  const unpublish = useMutation({
    mutationFn: (reason: string) => unpublishDocument(id, reason),
    onSuccess: (next) => {
      toast.success(t('assistant.unpublished'))
      setUnpublishOpen(false)
      setUnpublishReason('')
      queryClient.setQueryData(queryKeys.assistant.document(id), next)
      invalidate()
    },
    onError: onTransitionError,
  })

  const openRollback = async (version: CmsAssistantVersionSummary) => {
    setLoadingPlan(true)
    try {
      const target = await queryClient.fetchQuery({
        queryKey: queryKeys.assistant.version(id, version.id),
        queryFn: ({ signal }) => fetchVersion(id, version.id, signal),
      })
      setPlan({ target, rollback: true })
    } catch (error) {
      toast.error(describeError(error))
    } finally {
      setLoadingPlan(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────
  const title = detail?.document.title ?? t('assistant.doc.title')
  const header = (
    <PageHeader
      breadcrumb={[
        { label: t('app.suffix') },
        { label: t('assistant.docs.title'), to: '/assistant/documents' },
        { label: detail?.document.slug ?? '…' },
      ]}
      title={title}
    />
  )

  if (!canRead) {
    return (
      <>
        {header}
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const writeDisabled = !canDraft || !online
  const published = detail?.published ?? null
  const draft = detail?.draft ?? null

  const publishChanges = (target: CmsAssistantVersion): ChangeLine[] => {
    const body = diffLines(published?.body ?? '', target.body)
    return [
      {
        label: t('assistant.col.status'),
        from: detail ? t(`assistant.status.${detail.document.status}` as const) : undefined,
        to: t('assistant.status.published'),
      },
      {
        label: t('assistant.confirm.liveVersion'),
        from: published
          ? t('assistant.versionNumber', { number: published.number })
          : t('assistant.noPublished'),
        to: t('assistant.versionNumber', { number: target.number }),
      },
      {
        label: t('assistant.field.body'),
        to: t('assistant.diff.summary', { added: body.added, removed: body.removed }),
        note: t('assistant.confirm.publishEffect'),
      },
    ]
  }

  return (
    <>
      {header}
      <PageBody>
        <AsyncBoundary
          status={query.status}
          error={query.error}
          data={detail}
          onRetry={() => void query.refetch()}
        >
          {(doc) => (
            <>
              <UnsavedChangesGuard
                when={dirty}
                pending={[t('assistant.unsavedDraft', { title: form.title || doc.document.slug })]}
              />
              <Card>
                <div className={styles.headerMeta}>
                  <DocumentStatusBadge status={doc.document.status} />
                  <span className="font-mono">{doc.document.slug}</span>
                  <span>·</span>
                  <span>{t(`assistant.locale.${doc.document.locale}` as const)}</span>
                  <span>·</span>
                  <span>
                    {t('assistant.updatedAt', {
                      at: formatDateTime(doc.document.updatedAt, locale),
                    })}
                  </span>
                </div>
                <Tabs<Tab>
                  label={t('assistant.doc.tabs')}
                  value={tab}
                  onChange={setTab}
                  items={[
                    { id: 'edit', label: t('assistant.tab.edit') },
                    { id: 'versions', label: t('assistant.tab.versions') },
                    { id: 'audit', label: t('assistant.tab.audit') },
                  ]}
                />
              </Card>

              {tab === 'edit' ? (
                <div className={styles.layout}>
                  <div className={styles.main}>
                    {conflict ? (
                      <Card>
                        <CardHeader
                          title={t('assistant.conflict.title')}
                          hint={t('assistant.conflict.hint', {
                            who: actorName(conflict.createdBy),
                            revision: conflict.revision ?? 0,
                          })}
                        />
                        <div className={styles.stack}>
                          <p className={styles.warn}>
                            <span aria-hidden="true">⚠</span>
                            {t('assistant.conflict.body')}
                          </p>
                          <VersionDiff before={conflict} after={form} />
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button
                              variant="secondary"
                              onClick={() => {
                                const loaded = {
                                  title: conflict.title,
                                  description: conflict.description,
                                  body: conflict.body,
                                }
                                setForm(loaded)
                                setLastBase(loaded)
                                setConflict(null)
                              }}
                            >
                              {t('assistant.conflict.takeTheirs')}
                            </Button>
                            <Button
                              variant="danger"
                              loading={save.isPending}
                              disabled={writeDisabled}
                              onClick={() => submitSave(conflict.revision ?? 0, conflict)}
                            >
                              {t('assistant.conflict.keepMine')}
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ) : null}

                    <Card>
                      <CardHeader
                        title={
                          draft
                            ? t('assistant.editor.draftTitle', {
                                number: draft.number,
                                revision: draft.revision ?? 0,
                              })
                            : t('assistant.editor.noDraftTitle')
                        }
                        hint={
                          draft
                            ? t('assistant.editor.draftHint')
                            : t('assistant.editor.noDraftHint')
                        }
                      />
                      <form
                        className={`${styles.formGrid} px-5 py-4`}
                        onSubmit={(event) => event.preventDefault()}
                        noValidate
                      >
                        <div className={styles.formFull}>
                          <TextInput
                            label={t('assistant.field.title')}
                            required
                            hint={t('assistant.field.titleHint')}
                            error={errors.title}
                            value={form.title}
                            maxLength={120}
                            readOnly={writeDisabled}
                            onChange={(event) =>
                              setForm((f) => ({ ...f, title: event.target.value }))
                            }
                          />
                        </div>
                        <div className={styles.formFull}>
                          <TextInput
                            label={t('assistant.field.description')}
                            hint={t('assistant.field.descriptionHint')}
                            value={form.description}
                            maxLength={300}
                            readOnly={writeDisabled}
                            onChange={(event) =>
                              setForm((f) => ({ ...f, description: event.target.value }))
                            }
                          />
                        </div>
                        <div className={styles.formFull}>
                          <Tabs<'write' | 'preview'>
                            className={styles.editorTabs}
                            label={t('assistant.editor.modeLabel')}
                            value={mode}
                            onChange={setMode}
                            items={[
                              { id: 'write', label: t('assistant.editor.write') },
                              { id: 'preview', label: t('assistant.editor.preview') },
                            ]}
                          />
                          {mode === 'write' ? (
                            <TextArea
                              label={t('assistant.field.body')}
                              required
                              hint={t('assistant.field.bodyHint')}
                              error={errors.body}
                              rows={18}
                              className="font-mono"
                              value={form.body}
                              maxLength={100000}
                              readOnly={writeDisabled}
                              onChange={(event) =>
                                setForm((f) => ({ ...f, body: event.target.value }))
                              }
                            />
                          ) : (
                            <section
                              aria-label={t('assistant.editor.preview')}
                              className={styles.previewPane}
                            >
                              <MarkdownPreview
                                source={form.body}
                                emptyLabel={t('assistant.editor.previewEmpty')}
                              />
                            </section>
                          )}
                          <p className={styles.counter}>
                            {t('assistant.editor.count', { count: form.body.length })}
                          </p>
                        </div>
                      </form>
                      {canDraft ? (
                        <div className={styles.actions}>
                          {dirty ? (
                            <span className={styles.counter} role="status">
                              {t('assistant.editor.unsaved')}
                            </span>
                          ) : null}
                          <Button
                            variant="secondary"
                            disabled={!dirty || save.isPending}
                            onClick={() => {
                              if (lastBase) setForm(lastBase)
                              setErrors({})
                            }}
                          >
                            {t('assistant.editor.discard')}
                          </Button>
                          <Button
                            variant="primary"
                            loading={save.isPending}
                            disabled={!dirty || !online}
                            onClick={() => submitSave(draft?.revision ?? 0, lastBase)}
                          >
                            {t('action.saveDraft')}
                          </Button>
                        </div>
                      ) : (
                        <p className={`${styles.note} mx-5 mb-4`}>
                          <span aria-hidden="true">ℹ</span>
                          {t('assistant.editor.readOnly')}
                        </p>
                      )}
                    </Card>
                  </div>

                  <div className={styles.side}>
                    <Card>
                      <CardHeader
                        title={t('assistant.release.title')}
                        hint={t('assistant.release.hint')}
                      />
                      <div className={styles.facts}>
                        <div>
                          <p className={styles.factLabel}>{t('assistant.release.live')}</p>
                          {published ? (
                            <>
                              <p className={styles.factValue}>
                                {t('assistant.versionNumber', { number: published.number })} ·{' '}
                                {published.title}
                              </p>
                              <p className={styles.factSub}>
                                {t('assistant.versions.published', {
                                  who: actorName(published.publishedBy),
                                  at: published.publishedAt
                                    ? formatDateTime(published.publishedAt, locale)
                                    : '—',
                                })}
                              </p>
                            </>
                          ) : (
                            <p className={styles.factValue}>{t('assistant.noPublished')}</p>
                          )}
                        </div>
                        <div>
                          <p className={styles.factLabel}>{t('assistant.release.draft')}</p>
                          {draft ? (
                            <>
                              <p className={styles.factValue}>
                                {t('assistant.versionNumber', { number: draft.number })} ·{' '}
                                {t('assistant.revision', { revision: draft.revision ?? 0 })}
                              </p>
                              <p className={styles.factSub}>
                                {t('assistant.versions.created', {
                                  who: actorName(draft.createdBy),
                                  at: formatDateTime(draft.createdAt, locale),
                                })}
                              </p>
                            </>
                          ) : (
                            <p className={styles.factValue}>{t('assistant.release.noDraft')}</p>
                          )}
                        </div>
                      </div>
                      {canPublish ? (
                        <div className={styles.stack}>
                          {dirty ? (
                            <p className={styles.warn}>
                              <span aria-hidden="true">⚠</span>
                              {t('assistant.release.saveFirst')}
                            </p>
                          ) : null}
                          <Button
                            variant="primary"
                            disabled={!draft || dirty || !online}
                            onClick={() => draft && setPlan({ target: draft, rollback: false })}
                          >
                            {draft
                              ? t('assistant.release.publish', { number: draft.number })
                              : t('assistant.release.publishNone')}
                          </Button>
                          <Button
                            variant="danger"
                            disabled={!published || !online}
                            onClick={() => setUnpublishOpen(true)}
                          >
                            {t('assistant.release.unpublish')}
                          </Button>
                        </div>
                      ) : (
                        <p className={`${styles.note} mx-5 mb-4`}>
                          <span aria-hidden="true">ℹ</span>
                          {t('assistant.release.opsOnly')}
                        </p>
                      )}
                    </Card>
                  </div>
                </div>
              ) : null}

              {tab === 'versions' ? (
                <Card>
                  <CardHeader
                    title={t('assistant.versions.title')}
                    hint={t('assistant.versions.hint')}
                  />
                  {loadingPlan ? <LoadingState /> : null}
                  <DocumentVersions
                    detail={doc}
                    canPublish={canPublish}
                    online={online}
                    onRollback={(version) => void openRollback(version)}
                  />
                </Card>
              ) : null}

              {tab === 'audit' ? (
                <Card>
                  <CardHeader title={t('assistant.audit.title')} hint={t('assistant.audit.hint')} />
                  <div className="p-5">
                    {canAudit ? (
                      audit.status === 'error' ? (
                        <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
                      ) : audit.data ? (
                        <AuditTrail entries={audit.data.items} />
                      ) : (
                        <LoadingState />
                      )
                    ) : (
                      <PermissionDeniedState />
                    )}
                  </div>
                </Card>
              ) : null}
            </>
          )}
        </AsyncBoundary>
      </PageBody>

      {/* Publish / rollback: the dialog says which version goes live, what
          it replaces, and shows the diff — never a bare "are you sure". */}
      <ConfirmDialog
        open={plan !== null}
        onClose={() => {
          setPlan(null)
          setPublishReason('')
        }}
        title={
          plan?.rollback
            ? t('assistant.confirm.rollbackTitle', { number: plan.target.number })
            : t('assistant.confirm.publishTitle', { number: plan?.target.number ?? 0 })
        }
        description={t('assistant.confirm.publishBody')}
        changes={plan ? publishChanges(plan.target) : []}
        confirmLabel={
          plan?.rollback
            ? t('assistant.confirm.rollbackCta', { number: plan.target.number })
            : t('assistant.confirm.publishCta', { number: plan?.target.number ?? 0 })
        }
        tone="primary"
        irreversible={false}
        loading={publish.isPending}
        confirmDisabled={!online}
        onConfirm={() =>
          plan && publish.mutate({ versionId: plan.target.id, reason: publishReason })
        }
      >
        {plan ? (
          <>
            <VersionDiff before={published} after={plan.target} />
            <TextArea
              label={t('assistant.confirm.reason')}
              hint={t('assistant.confirm.reasonOptional')}
              rows={2}
              maxLength={500}
              value={publishReason}
              onChange={(event) => setPublishReason(event.target.value)}
            />
          </>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={unpublishOpen}
        onClose={() => {
          setUnpublishOpen(false)
          setUnpublishReason('')
        }}
        title={t('assistant.confirm.unpublishTitle')}
        description={t('assistant.confirm.unpublishBody')}
        changes={[
          {
            label: t('assistant.col.status'),
            from: t('assistant.status.published'),
            to: t('assistant.status.unpublished'),
          },
          {
            label: t('assistant.confirm.liveVersion'),
            from: published
              ? t('assistant.versionOption', { number: published.number, title: published.title })
              : undefined,
            to: t('assistant.confirm.noneLive'),
            note: t('assistant.confirm.unpublishEffect'),
          },
        ]}
        confirmLabel={t('assistant.release.unpublish')}
        tone="danger"
        irreversible={false}
        loading={unpublish.isPending}
        confirmDisabled={unpublishReason.trim().length === 0 || !online}
        onConfirm={() => unpublish.mutate(unpublishReason)}
      >
        <TextArea
          label={t('assistant.confirm.reason')}
          required
          hint={t('assistant.confirm.reasonRequired')}
          rows={2}
          maxLength={500}
          value={unpublishReason}
          onChange={(event) => setUnpublishReason(event.target.value)}
        />
      </ConfirmDialog>
    </>
  )
}

function isDirty(form: Draft, base: Draft | null): boolean {
  if (!base) return false
  return (
    form.title !== base.title || form.description !== base.description || form.body !== base.body
  )
}

/** Only the fields that changed — the PATCH leaves the rest alone. */
function changedFields(form: Draft, base: Draft | null): Partial<Draft> {
  const out: Partial<Draft> = {}
  if (!base || form.title !== base.title) out.title = form.title.trim()
  if (!base || form.description !== base.description) out.description = form.description.trim()
  if (!base || form.body !== base.body) out.body = form.body
  return out
}
