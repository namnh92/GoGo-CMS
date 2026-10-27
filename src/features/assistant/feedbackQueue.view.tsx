import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useI18n, useLabel, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { formatDateTime } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card } from '@/shared/ui/Card'
import { Badge, StatusBadge } from '@/shared/ui/Badge'
import { Button } from '@/shared/ui/Button'
import { InlineSelect, TextInput } from '@/shared/ui/Field'
import { AsyncBoundary, EmptyState, PermissionDeniedState } from '@/shared/ui/State'
import {
  ASSISTANT_FEEDBACK_REASONS,
  type AssistantSource,
  type CmsAssistantFeedbackItem,
} from '@/shared/api/contracts-assistant'
import { fetchFeedback, type FeedbackFilters } from './api'
import { styles } from './assistant.style'

const PAGE_SIZE = 20

/** A `datetime-local`-free date filter: the day boundaries in local time, sent as ISO. */
function dayStart(value: string): string | undefined {
  return value ? new Date(`${value}T00:00:00`).toISOString() : undefined
}
function dayEnd(value: string): string | undefined {
  return value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined
}

/**
 * GoGo AI · feedback queue (GoGo-CMS#249).
 *
 * What a moderator needs to judge an answer and fix the GoGo guide: the
 * assistant's reply, the sources it cited, the reason code. Nothing about the
 * person who rated it — no user id, their own message, attachments, the
 * place or plan they were looking at, coordinates or email. The API does not
 * send them and this screen has no field that could show them.
 *
 * Contract 2.0.0-alpha.3 (GoGo-BE#713): moderator, ops_admin and super_admin
 * only — editors are refused by the API (`403 ROLE_DENIED`), and the
 * permission check here only decides what to show. Read-only in v1.
 */
export default function FeedbackQueueScreen() {
  const t = useT()
  const { can } = useSession()
  const canRead = can('assistant.feedback')

  const [rating, setRating] = useState('')
  const [reason, setReason] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const [pageIndex, setPageIndex] = useState(0)

  const rangeInvalid = Boolean(from && to && from > to)

  const filters: FeedbackFilters = {
    ...(rating ? { rating: rating as 'up' | 'down' } : {}),
    ...(reason ? { reason } : {}),
    ...(rangeInvalid ? {} : { from: dayStart(from), to: dayEnd(to) }),
    limit: PAGE_SIZE,
    cursor: cursors[pageIndex] ?? null,
  }

  const query = useQuery({
    queryKey: queryKeys.assistant.feedback(filters),
    queryFn: ({ signal }) => fetchFeedback(filters, signal),
    enabled: canRead && !rangeInvalid,
  })

  const resetPaging = () => {
    setCursors([null])
    setPageIndex(0)
  }

  const header = (
    <PageHeader
      breadcrumb={[{ label: t('app.suffix') }, { label: t('nav.group.assistant') }]}
      title={t('assistant.feedback.title')}
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

  const page = query.data
  const nextCursor = page?.nextCursor ?? null
  const filtered = Boolean(rating || reason || from || to)

  return (
    <>
      {header}
      <PageBody>
        <Card>
          {/* Q3/Q10 (owner): the question stays out of v1. Said up front, so a
              reviewer does not mistake "cannot tell" for "irrelevant". */}
          <p className={styles.privacyNote}>
            <span aria-hidden="true">ℹ</span>
            {t('assistant.feedback.questionLimit')}
          </p>
          <p className={styles.privacyNote}>
            <span aria-hidden="true">ℹ</span>
            {t('assistant.feedback.privacy')}
          </p>
          <div className={styles.filterBar}>
            <InlineSelect
              label={t('assistant.feedback.rating')}
              value={rating}
              onChange={(event) => {
                setRating(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('assistant.feedback.ratingAll')}</option>
              <option value="down">{t('assistant.feedback.rating.down')}</option>
              <option value="up">{t('assistant.feedback.rating.up')}</option>
            </InlineSelect>
            <InlineSelect
              label={t('assistant.feedback.reason')}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                resetPaging()
              }}
            >
              <option value="">{t('assistant.feedback.reasonAll')}</option>
              {ASSISTANT_FEEDBACK_REASONS.map((value) => (
                <option key={value} value={value}>
                  {t(`assistant.feedback.reason.${value}` as const)}
                </option>
              ))}
            </InlineSelect>
            <TextInput
              type="date"
              label={t('assistant.feedback.from')}
              value={from}
              onChange={(event) => {
                setFrom(event.target.value)
                resetPaging()
              }}
            />
            <TextInput
              type="date"
              label={t('assistant.feedback.to')}
              value={to}
              error={rangeInvalid ? t('assistant.feedback.rangeInvalid') : undefined}
              onChange={(event) => {
                setTo(event.target.value)
                resetPaging()
              }}
            />
          </div>

          {rangeInvalid ? null : (
            <AsyncBoundary
              status={query.status}
              error={query.error}
              data={page?.items ?? []}
              isEmpty={(items) => items.length === 0}
              onRetry={() => void query.refetch()}
              empty={
                <div className="p-4">
                  <EmptyState
                    title={
                      filtered
                        ? t('assistant.feedback.emptyFiltered')
                        : t('assistant.feedback.empty')
                    }
                    hint={t('assistant.feedback.emptyHint')}
                  />
                </div>
              }
            >
              {(items) => (
                <>
                  <ol className={styles.feedbackList} aria-label={t('assistant.feedback.title')}>
                    {items.map((item) => (
                      <FeedbackCard key={item.id} item={item} />
                    ))}
                  </ol>
                  <div className={styles.pager}>
                    <p className={styles.pagerInfo}>
                      {t('assistant.pageInfo', { page: pageIndex + 1, shown: items.length })}
                    </p>
                    <div className={styles.pagerActions}>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={pageIndex === 0}
                        onClick={() => setPageIndex((index) => Math.max(0, index - 1))}
                      >
                        {t('action.previous')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={nextCursor === null}
                        onClick={() => {
                          setCursors((current) => {
                            const next = current.slice(0, pageIndex + 1)
                            next.push(nextCursor)
                            return next
                          })
                          setPageIndex((index) => index + 1)
                        }}
                      >
                        {t('action.next')}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </AsyncBoundary>
          )}
        </Card>
      </PageBody>
    </>
  )
}

function FeedbackCard({ item }: { item: CmsAssistantFeedbackItem }) {
  const t = useT()
  const label = useLabel()
  const { locale } = useI18n()
  const [expanded, setExpanded] = useState(false)
  const long = item.reply.text.length > 400
  const reply = item.reply

  return (
    <li className={styles.feedbackItem}>
      <div className={styles.feedbackHead}>
        <div className={styles.feedbackBadges}>
          <StatusBadge
            tone={item.rating === 'down' ? 'danger' : 'mint'}
            shape={item.rating === 'down' ? 'alert' : 'check'}
            label={t(`assistant.feedback.rating.${item.rating}` as const)}
          />
          {item.reason ? (
            <Badge tone="lavender">
              {label(`assistant.feedback.reason.${item.reason}`, item.reason)}
            </Badge>
          ) : null}
          {/* `truncated` hit the length ceiling: partial text, not a finished
              answer — worth a second look, so it is not neutral. */}
          <Badge tone={reply.status === 'truncated' ? 'amber' : 'neutral'}>
            {label(`assistant.replyStatus.${reply.status}`, reply.status)}
          </Badge>
          {reply.notice ? (
            <Badge tone="amber">
              {label(`assistant.notice.${reply.notice.kind}`, reply.notice.kind)}
              {reply.notice.reason
                ? ` · ${label(`assistant.noticeReason.${reply.notice.reason}`, reply.notice.reason)}`
                : ''}
            </Badge>
          ) : null}
        </div>
        <p className={styles.feedbackMeta}>
          <time dateTime={item.createdAt}>{formatDateTime(item.createdAt, locale)}</time>
          {' · '}
          {/* Opaque per-conversation token: groups rows, names nobody. */}
          <span title={t('assistant.feedback.conversationRefHint')}>
            {t('assistant.feedback.conversationRef', { ref: item.conversationRef.slice(0, 8) })}
          </span>
        </p>
      </div>

      <p className={`${styles.feedbackText} ${long && !expanded ? styles.feedbackClamp : ''}`}>
        {reply.text || t('assistant.feedback.noText')}
      </p>
      {long ? (
        <Button
          size="sm"
          variant="ghost"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('assistant.feedback.less') : t('assistant.feedback.more')}
        </Button>
      ) : null}

      <div className={styles.sourceList}>
        <p className={styles.factLabel}>{t('assistant.feedback.sources')}</p>
        {reply.sources.length === 0 ? (
          <p className={styles.sourceDesc}>{t('assistant.feedback.noSources')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {reply.sources.map((source) => (
              <SourceRow key={`${source.index}-${source.kind}`} source={source} />
            ))}
          </ul>
        )}
      </div>

      {(reply.cardKinds?.length ?? 0) > 0 ||
      (reply.proposalKinds?.length ?? 0) > 0 ||
      reply.model ? (
        <div className={styles.chips}>
          {(reply.cardKinds ?? []).map((kind) => (
            <Badge key={`card-${kind}`} tone="neutral">
              {t('assistant.feedback.card', { kind })}
            </Badge>
          ))}
          {(reply.proposalKinds ?? []).map((kind) => (
            <Badge key={`proposal-${kind}`} tone="neutral">
              {label(`assistant.proposalKind.${kind}`, kind)}
            </Badge>
          ))}
          {reply.model ? (
            <span className={styles.feedbackMeta}>
              {t('assistant.feedback.model', { model: reply.model })}
            </span>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function SourceRow({ source }: { source: AssistantSource }) {
  const t = useT()
  const { locale } = useI18n()
  if (source.kind === 'place_data') {
    return (
      <li className={styles.sourceItem}>
        <span className={styles.sourceIndex}>[{source.index}]</span>
        <span>
          {t('assistant.feedback.placeData')}
          {source.checkedAt
            ? ` · ${t('assistant.feedback.checked', { at: formatDateTime(source.checkedAt, locale) })}`
            : ''}
        </span>
      </li>
    )
  }
  return (
    <li className={styles.sourceItem}>
      <span className={styles.sourceIndex}>[{source.index}]</span>
      {source.documentId ? (
        <Link className={styles.link} to={`/assistant/documents/${source.documentId}`}>
          {source.title}
        </Link>
      ) : (
        <span>{source.title}</span>
      )}
      {source.description ? <span className={styles.sourceDesc}>{source.description}</span> : null}
    </li>
  )
}
