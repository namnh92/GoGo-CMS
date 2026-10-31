import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { Card, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Select, TextInput } from '@/shared/ui/Field'
import { ErrorState, LoadingState, OfflineState } from '@/shared/ui/State'
import { useOnline } from '@/shared/ui/useOnline'
import {
  assistantLocaleSchema,
  type AssistantLocale,
  type CmsAssistantGuideCoverage,
} from '@/shared/api/contracts-assistant'
import { COVERAGE_QUESTION_MAX, COVERAGE_QUESTION_MIN, fetchGuideCoverage } from './api'
import { styles } from './assistant.style'

const EXCERPT_CHARS = 240

type Asked = { question: string; locale: AssistantLocale }

/**
 * GoGo-CMS#266 / GoGo-BE#736 — "would GoGo AI find an answer to this?".
 *
 * The question runs through the server's own retrieval (published versions
 * only), so the result is what a reply would cite; the console computes no
 * score of its own. An empty result says *why*: nothing is live, or what is
 * live does not answer this wording — two different fixes.
 */
export function GuideCoveragePanel() {
  const t = useT()
  const online = useOnline()
  const [question, setQuestion] = useState('')
  const [locale, setLocale] = useState<AssistantLocale>('vi')
  const [asked, setAsked] = useState<Asked | null>(null)

  const trimmed = question.trim()
  const tooShort = trimmed.length < COVERAGE_QUESTION_MIN

  const query = useQuery({
    queryKey: queryKeys.assistant.coverage(asked?.question ?? '', asked?.locale ?? 'vi'),
    queryFn: ({ signal }) => fetchGuideCoverage(asked!, signal),
    enabled: asked !== null,
    retry: false,
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (tooShort || !online) return
    // The same question again is a fresh check, not the cached answer: a
    // colleague may have published or withdrawn a document since (#269 F-01).
    if (asked?.question === trimmed && asked.locale === locale) void query.refetch()
    else setAsked({ question: trimmed, locale })
  }

  return (
    <Card>
      <CardHeader title={t('assistant.coverage.title')} hint={t('assistant.coverage.hint')} />
      <form className={styles.coverageForm} onSubmit={submit} noValidate>
        <TextInput
          label={t('assistant.coverage.question')}
          placeholder={t('assistant.coverage.placeholder')}
          className={styles.coverageQuestion}
          value={question}
          maxLength={COVERAGE_QUESTION_MAX}
          hint={tooShort && question.length > 0 ? t('assistant.coverage.tooShort') : undefined}
          onChange={(event) => setQuestion(event.target.value)}
        />
        <Select
          label={t('assistant.col.locale')}
          value={locale}
          onChange={(event) => setLocale(assistantLocaleSchema.parse(event.target.value))}
        >
          {assistantLocaleSchema.options.map((value) => (
            <option key={value} value={value}>
              {t(`assistant.locale.${value}` as const)}
            </option>
          ))}
        </Select>
        <Button
          type="submit"
          variant="primary"
          disabled={tooShort || !online}
          loading={query.isFetching}
        >
          {t('assistant.coverage.run')}
        </Button>
      </form>
      <div className={styles.stack} aria-live="polite">
        {!online ? (
          <OfflineState />
        ) : asked === null ? (
          <p className={styles.muted}>{t('assistant.coverage.idle')}</p>
        ) : query.status === 'pending' ? (
          <LoadingState />
        ) : query.status === 'error' ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <CoverageResult result={query.data} />
        )}
      </div>
    </Card>
  )
}

function CoverageResult({ result }: { result: CmsAssistantGuideCoverage }) {
  const t = useT()
  const terms =
    result.terms.length > 0 ? (
      <p className={styles.muted}>
        {t('assistant.coverage.terms')}{' '}
        <span className={styles.sub}>{result.terms.join(', ')}</span>
      </p>
    ) : (
      <p className={styles.muted}>{t('assistant.coverage.noTerms')}</p>
    )

  if (result.outcome === 'hit' && result.sections.length > 0) {
    return (
      <>
        <p className={styles.note} role="status">
          <span aria-hidden="true">✓</span>
          {t('assistant.coverage.hit', { count: result.sections.length })}
        </p>
        {terms}
        <ol className={styles.coverageList}>
          {result.sections.map((section, i) => (
            <li key={`${section.versionId}-${i}`} className={styles.coverageItem}>
              <p className={styles.name}>
                [{i + 1}]{' '}
                <Link className={styles.link} to={`/assistant/documents/${section.documentId}`}>
                  {section.title}
                </Link>
              </p>
              <p className={styles.sub}>
                {section.slug}
                {' · '}
                {section.heading ?? t('assistant.coverage.noHeading')}
                {' · '}
                {t('assistant.coverage.score', { score: section.score })}
              </p>
              <p className={styles.muted}>
                {section.excerpt.length > EXCERPT_CHARS
                  ? `${section.excerpt.slice(0, EXCERPT_CHARS)}…`
                  : section.excerpt}
              </p>
            </li>
          ))}
        </ol>
      </>
    )
  }

  const key =
    result.outcome === 'no_published'
      ? 'assistant.coverage.noPublished'
      : result.outcome === 'no_match'
        ? 'assistant.coverage.noMatch'
        : 'assistant.coverage.unknown'
  return (
    <>
      <p className={styles.warn} role="status">
        <span aria-hidden="true">!</span>
        {t(key)}
      </p>
      {terms}
    </>
  )
}
