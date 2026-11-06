import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { useSession } from '@/shared/auth/session'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { formatDateTime } from '@/shared/format'
import { queryKeys } from '@/shared/api/queryKeys'
import { newIdempotencyKey } from '@/shared/api/client'
import { toApiError } from '@/shared/api/errors'
import type { CmsPlaceDetail } from '@/shared/api/contracts'
import type { RequestBody } from '@/shared/api/generated'
import { Badge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { Select, TextArea, TextInput } from '@/shared/ui/Field'
import { ConfirmDialog } from '@/shared/ui/Overlay'
import {
  AsyncBoundary,
  EmptyState,
  ErrorState,
  PermissionDeniedState,
  Skeleton,
} from '@/shared/ui/State'
import { AuditTrail } from '@/shared/ui/AuditTrail'
import { useOnline } from '@/shared/ui/useOnline'
import { useToast } from '@/shared/ui/Toast'
import { fetchPlace, fetchPlaceAudit, setVenueVerification } from './api'
import { styles } from './placeVerification.style'

type Decision = RequestBody<'setVenueVerification'>
type EvidenceType = NonNullable<Decision['evidenceType']>
const EVIDENCE_TYPES: EvidenceType[] = ['site_visit', 'official_registry', 'venue_document']

export default function PlaceVerificationScreen() {
  const { id = '' } = useParams()
  const { can } = useSession()
  const t = useT()
  const place = useQuery({
    queryKey: queryKeys.places.detail(id),
    queryFn: ({ signal }) => fetchPlace(id, signal),
    enabled: Boolean(id) && can('place.read'),
    staleTime: 0,
  })
  return (
    <>
      <PageHeader
        title={t('venueVerification.title')}
        showSearch={false}
        breadcrumb={[
          { label: t('places.breadcrumb'), to: '/places' },
          { label: place.data?.name ?? id, to: `/places/${id}` },
          { label: t('venueVerification.title') },
        ]}
      />
      <PageBody>
        {!can('place.read') ? (
          <PermissionDeniedState />
        ) : (
          <AsyncBoundary
            status={place.status}
            error={place.error}
            data={place.data}
            loading={
              <div role="status" aria-label={t('state.loading')} className={styles.panel}>
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-40 w-full" />
              </div>
            }
            onRetry={() => void place.refetch()}
          >
            {(detail) => (
              <VerificationForm
                key={`${id}:${detail.verification?.etag ?? 'missing'}`}
                detail={detail}
                refreshing={place.isFetching}
                reload={async () => (await place.refetch()).isSuccess}
              />
            )}
          </AsyncBoundary>
        )}
      </PageBody>
    </>
  )
}

function VerificationForm({
  detail,
  refreshing,
  reload,
}: {
  detail: CmsPlaceDetail
  refreshing: boolean
  reload: () => Promise<boolean>
}) {
  const t = useT()
  const { locale } = useI18n()
  const { can } = useSession()
  const online = useOnline()
  const toast = useToast()
  const client = useQueryClient()
  const [evidenceType, setEvidenceType] = useState<EvidenceType>('site_visit')
  const [reference, setReference] = useState('')
  const [reason, setReason] = useState('')
  const [preview, setPreview] = useState<{ body: Decision; etag: string; key: string } | null>(null)
  const [stale, setStale] = useState<'conflict' | 'saved' | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const verification = detail.verification
  const verified = verification?.status === 'verified'
  const audit = useQuery({
    queryKey: queryKeys.places.audit(detail.id),
    queryFn: ({ signal }) => fetchPlaceAudit(detail.id, undefined, signal),
    enabled: auditOpen,
  })
  const mutation = useMutation({
    mutationFn: (decision: NonNullable<typeof preview>) =>
      setVenueVerification(detail.id, decision.body, decision.etag, decision.key),
    onSuccess: async () => {
      setPreview(null)
      setReason('')
      setReference('')
      // A successful write cannot be repeated against the old identity.
      setStale('saved')
      toast.success(t('venueVerification.saved'))
      await client.invalidateQueries({ queryKey: queryKeys.places.all })
    },
    onError: (error) => {
      const status = toApiError(error).status
      if (status === 412 || status === 428) {
        setPreview(null)
        setStale('conflict')
      }
    },
  })
  const forbidden = mutation.isError && toApiError(mutation.error).isForbidden
  const disabled = !online || refreshing || stale !== null || mutation.isPending
  const valid =
    reason.trim().length > 0 &&
    reason.trim().length <= 500 &&
    (verified || (reference.trim().length > 0 && reference.trim().length <= 500))

  async function reloadDetail() {
    if (!(await reload())) return
    setPreview(null)
    setEvidenceType('site_visit')
    setReference('')
    setReason('')
    mutation.reset()
    // Conflict recovery may keep the ETag; a saved write still needs a new revision.
    setStale((current) => (current === 'conflict' ? null : current))
  }

  function review() {
    if (!verification?.etag || disabled || !valid || !can('place.verifyVenue')) return
    mutation.reset()
    setPreview({
      body: verified
        ? { status: 'unverified', reason: reason.trim() }
        : {
            status: 'verified',
            evidenceType,
            evidenceReference: reference.trim(),
            reason: reason.trim(),
          },
      etag: verification.etag,
      key: newIdempotencyKey(),
    })
  }

  if (forbidden) return <PermissionDeniedState />
  return (
    <div className={styles.screen}>
      <section className={styles.panel}>
        <h2 className={styles.title}>{detail.name}</h2>
        <p className={styles.text}>{detail.addressText}</p>
        <dl className={styles.facts}>
          {detail.lat != null && detail.lng != null ? (
            <>
              <dt>{t('venueVerification.coordinates')}</dt>
              <dd>
                {detail.lat}, {detail.lng}
              </dd>
            </>
          ) : null}
        </dl>
        <p className={styles.text}>{t('venueVerification.scope')}</p>
        <Button
          onClick={() => void reloadDetail()}
          disabled={mutation.isPending || refreshing || !online}
        >
          {t('venueVerification.reload')}
        </Button>
        {!verification?.etag ? (
          <EmptyState title={t('venueVerification.unavailable')} hint={null} />
        ) : (
          <>
            <div className={styles.row}>
              <Badge tone={verified ? 'mint' : 'neutral'}>
                {t(`venueVerification.${verification.status}`)}
              </Badge>
              {verification.verifiedAt ? (
                <span className={styles.text}>
                  {formatDateTime(verification.verifiedAt, locale)}
                </span>
              ) : null}
            </div>
            {!online ? (
              <p role="status" className={styles.notice}>
                {t('state.offlineHint')}
              </p>
            ) : null}
            {stale ? (
              <p role="alert" className={styles.notice}>
                {t('venueVerification.stale')}
              </p>
            ) : null}
            {!can('place.verifyVenue') ? (
              <PermissionDeniedState />
            ) : (
              <form
                className={styles.panel}
                onSubmit={(event) => {
                  event.preventDefault()
                  review()
                }}
              >
                {!verified ? (
                  <>
                    <Select
                      label={t('venueVerification.evidenceType')}
                      value={evidenceType}
                      disabled={disabled}
                      onChange={(event) => setEvidenceType(event.target.value as EvidenceType)}
                    >
                      {EVIDENCE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {t(`venueVerification.evidence.${type}`)}
                        </option>
                      ))}
                    </Select>
                    <TextInput
                      label={t('venueVerification.reference')}
                      hint={t('venueVerification.referenceHint')}
                      required
                      maxLength={500}
                      value={reference}
                      disabled={disabled}
                      onChange={(event) => setReference(event.target.value)}
                    />
                  </>
                ) : null}
                <TextArea
                  label={t('venueVerification.reason')}
                  required
                  maxLength={500}
                  value={reason}
                  disabled={disabled}
                  onChange={(event) => setReason(event.target.value)}
                />
                <Button
                  type="submit"
                  variant={verified ? 'danger' : 'primary'}
                  disabled={disabled || !valid}
                >
                  {t(verified ? 'venueVerification.revoke' : 'venueVerification.verify')}
                </Button>
              </form>
            )}
          </>
        )}
      </section>
      {mutation.isError && !preview ? <ErrorState error={mutation.error} /> : null}
      <Button onClick={() => setAuditOpen(!auditOpen)} aria-expanded={auditOpen}>
        {t('action.viewAudit')}
      </Button>
      {auditOpen ? (
        <AsyncBoundary
          status={audit.status}
          error={audit.error}
          data={audit.data?.items}
          onRetry={() => void audit.refetch()}
        >
          {(entries) => <AuditTrail entries={entries} />}
        </AsyncBoundary>
      ) : null}
      <ConfirmDialog
        open={Boolean(preview)}
        onClose={() => {
          if (!mutation.isPending) setPreview(null)
        }}
        title={t(
          preview?.body.status === 'verified'
            ? 'venueVerification.verify'
            : 'venueVerification.revoke',
        )}
        description={t('venueVerification.scope')}
        irreversible={false}
        tone={preview?.body.status === 'verified' ? 'primary' : 'danger'}
        confirmLabel={t('venueVerification.confirm')}
        loading={mutation.isPending}
        confirmDisabled={disabled}
        onConfirm={() => {
          if (preview && !disabled && can('place.verifyVenue')) mutation.mutate(preview)
        }}
        changes={[
          {
            label: detail.name,
            from: t(verified ? 'venueVerification.verified' : 'venueVerification.unverified'),
            to: t(
              preview?.body.status === 'verified'
                ? 'venueVerification.verified'
                : 'venueVerification.unverified',
            ),
          },
          ...(preview?.body.evidenceType
            ? [
                {
                  label: t('venueVerification.evidenceType'),
                  to: t(`venueVerification.evidence.${preview.body.evidenceType}`),
                },
                { label: t('venueVerification.reference'), to: preview.body.evidenceReference },
              ]
            : []),
          { label: t('venueVerification.reason'), to: preview?.body.reason },
        ]}
      >
        {mutation.isError ? (
          <>
            <ErrorState error={mutation.error} />
            <ul>
              {toApiError(mutation.error).fieldErrors.map((error, index) => (
                <li key={index} className={styles.text}>
                  {error.field}: {error.message}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </ConfirmDialog>
    </div>
  )
}
