import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useT, type MessageKey } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatBytes } from '@/shared/format'
import { useI18n } from '@/shared/i18n/i18n'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardBody, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Select, TextInput } from '@/shared/ui/Field'
import { Stepper } from '@/shared/ui/Stepper'
import { PermissionDeniedState, useErrorMessage } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import {
  MAPPABLE_FIELDS,
  requiredMappableFields,
  type ImportCanonicalField,
  type ImportMode,
} from '@/shared/api/contracts-import'
import { createFileImport, createSheetImport } from './api'
import { guessMapping, readCsvPreview, type CsvPreview } from './csvPreview'
import { buildImportTemplateCsv } from './importTemplate'
import { styles } from './importWizard.style'

type Step = 'source' | 'mapping' | 'review'
type SourceKind = 'file' | 'sheet'

const MODES: ImportMode[] = ['dry_run', 'create_drafts', 'publish_approved']
const STEPS: Step[] = ['source', 'mapping', 'review']

/**
 * PI-CMS-009 — the four fields whose canonical name does not say enough.
 *
 * The wire name stays the option's value; only what an operator reads changes.
 * `city` says it is a search hint because presenting it as an address is what
 * made operators treat it as one; `suitability` says which of the two
 * suitability-shaped columns it is; `note` says it never reaches the place.
 */
const FIELD_LABELS: Partial<Record<ImportCanonicalField, MessageKey>> = {
  city: 'wizard.fieldCityHint',
  google_place_id: 'wizard.field.google_place_id',
  note: 'wizard.field.note',
}

export default function ImportWizardScreen() {
  const t = useT()
  const { locale } = useI18n()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [step, setStep] = useState<Step>('source')
  const [sourceKind, setSourceKind] = useState<SourceKind>('file')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<CsvPreview | null>(null)
  const [mapping, setMapping] = useState<Record<string, ImportCanonicalField>>({})
  const [sheetUrl, setSheetUrl] = useState('')
  const [sheetTabs, setSheetTabs] = useState('')
  const [defaultCity, setDefaultCity] = useState('')
  // dry_run is the default on purpose: choosing a writing mode is deliberate.
  const [mode, setMode] = useState<ImportMode>('dry_run')

  const canPublishMode = can('import.publish')

  const create = useMutation({
    mutationFn: async () => {
      if (sourceKind === 'file') {
        if (!file) throw new Error('no file')
        return createFileImport({ file, mode, defaultCity: defaultCity || undefined, mapping })
      }
      return createSheetImport({
        spreadsheetUrl: sheetUrl,
        sheets: sheetTabs
          .split(',')
          .map((tab) => tab.trim())
          .filter(Boolean),
        mode,
        defaultCity: defaultCity || undefined,
        mapping,
      })
    },
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.imports.all })
      if (job.reused) toast.push({ tone: 'info', message: t('wizard.reused') })
      else toast.success(t('wizard.create'))
      navigate(`/imports/${job.id}`)
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const onPickFile = async (picked: File | null) => {
    setFile(picked)
    setPreview(null)
    setMapping({})
    if (!picked) return
    if (picked.name.toLowerCase().endsWith('.csv')) {
      const parsed = await readCsvPreview(picked)
      setPreview(parsed)
      setMapping(guessMapping(parsed.headers))
    }
  }

  if (!can('import.manage')) {
    return (
      <>
        <PageHeader
          breadcrumb={[{ label: t('imports.breadcrumb'), to: '/imports' }]}
          title={t('wizard.title')}
        />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const mappedFields = new Set(Object.values(mapping))
  // What this particular file must still supply. `category` drops off the list
  // as soon as something identifies the place, because the server derives it
  // from the provider's types then.
  const requiredFields = requiredMappableFields(mappedFields)
  const missingRequired = requiredFields.filter((field) => !mappedFields.has(field))
  // Derived, not supplied — and only worth saying when the operator left the
  // column out, which is the case the wizard used to refuse.
  const categoryDerived = requiredFields.length === 0 && !mappedFields.has('category')

  // Headers the operator left unmapped: their cells are dropped, so say which
  // before the import runs rather than after.
  const unmappedHeaders = (preview?.headers ?? []).filter((header) => !mapping[header])

  // Mapping is only enforceable when the headers are known (CSV preview).
  const mappingBlocked = Boolean(preview) && missingRequired.length > 0
  const sourceReady = sourceKind === 'file' ? file !== null : sheetUrl.trim().length > 0

  /**
   * Built here rather than served from the API: it is a constant, and a route
   * for it would be one more thing that can disagree with `TEMPLATE_COLUMNS`.
   */
  const downloadTemplate = () => {
    const blob = new Blob([buildImportTemplateCsv()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'gogo-place-import-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        breadcrumb={[
          { label: t('app.suffix') },
          { label: t('imports.breadcrumb'), to: '/imports' },
          { label: t('imports.new') },
        ]}
        title={t('wizard.title')}
        showSearch={false}
      />
      <PageBody>
        <Stepper
          steps={STEPS.map((id) => ({ id, label: t(`wizard.step.${id}` as const) }))}
          current={step}
        />

        {step === 'source' ? (
          <Card>
            <CardHeader title={t('wizard.step.source')} hint={t('wizard.fileHint')} />
            <CardBody className="flex flex-col gap-4">
              {/*
                PI-CMS-009 — the template, offered before the file picker rather
                than after it. Every sheet in circulation was copied from a spec
                example written before Place IDs existed, which is how `district`
                kept arriving in files long after the tier was dissolved.
              */}
              <div className={styles.templateRow}>
                <div>
                  <p className={styles.templateTitle}>{t('wizard.template')}</p>
                  <p className={styles.templateHint}>{t('wizard.templateHint')}</p>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={downloadTemplate}>
                  {t('wizard.templateDownload')}
                </Button>
              </div>

              <div className={styles.sourceGrid}>
                <button
                  type="button"
                  onClick={() => setSourceKind('file')}
                  aria-pressed={sourceKind === 'file'}
                  className={`${styles.sourceOption} ${
                    sourceKind === 'file' ? styles.sourceOptionActive : styles.sourceOptionIdle
                  }`}
                >
                  <span className={styles.sourceTitle}>{t('wizard.sourceFile')}</span>
                  <span className={styles.sourceHint}>{t('wizard.fileHint')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSourceKind('sheet')}
                  aria-pressed={sourceKind === 'sheet'}
                  className={`${styles.sourceOption} ${
                    sourceKind === 'sheet' ? styles.sourceOptionActive : styles.sourceOptionIdle
                  }`}
                >
                  <span className={styles.sourceTitle}>{t('wizard.sourceSheet')}</span>
                  <span className={styles.sourceHint}>{t('wizard.sheetUrlHint')}</span>
                </button>
              </div>

              {sourceKind === 'file' ? (
                <div className={styles.dropZone}>
                  <input
                    id="import-file"
                    type="file"
                    accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    className="sr-only"
                    onChange={(event) => void onPickFile(event.target.files?.[0] ?? null)}
                  />
                  <label
                    htmlFor="import-file"
                    className="inline-flex min-h-11 cursor-pointer items-center rounded-compact border border-line-strong bg-surface px-4 text-sm font-semibold text-text"
                  >
                    {t('wizard.filePick')}
                  </label>
                  {file ? (
                    <p className={styles.fileName}>
                      {t('wizard.fileSelected', { name: file.name })} ·{' '}
                      {formatBytes(file.size, locale)}
                    </p>
                  ) : (
                    <p className="text-xs text-text-subtle">{t('wizard.fileHint')}</p>
                  )}
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <TextInput
                    label={t('wizard.sheetUrl')}
                    hint={t('wizard.sheetUrlHint')}
                    required
                    value={sheetUrl}
                    onChange={(event) => setSheetUrl(event.target.value)}
                  />
                  <TextInput
                    label={t('wizard.sheetTabs')}
                    value={sheetTabs}
                    onChange={(event) => setSheetTabs(event.target.value)}
                  />
                </div>
              )}

              <TextInput
                label={t('wizard.defaultCity')}
                // ADM-107 — it is a provider search hint, not an administrative
                // level. GoGo files a place under the province and ward its
                // coordinate falls in; this text only helps find the place.
                hint={t('wizard.defaultCityHint')}
                value={defaultCity}
                onChange={(event) => setDefaultCity(event.target.value)}
                className="max-w-sm"
              />

              <div className={styles.footer}>
                <Button variant="secondary" onClick={() => navigate('/imports')}>
                  {t('action.cancel')}
                </Button>
                <Button
                  variant="primary"
                  disabled={!sourceReady}
                  onClick={() => setStep('mapping')}
                >
                  {t('wizard.continue')}
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}

        {step === 'mapping' ? (
          <Card>
            <CardHeader title={t('wizard.mapping')} hint={t('wizard.mappingHint')} />
            <CardBody className="flex flex-col gap-4">
              {preview ? (
                <div className="overflow-x-auto">
                  <table className={styles.mappingTable}>
                    <thead>
                      <tr>
                        <th className={styles.mappingHeader}>{t('wizard.mapping')}</th>
                        <th className={styles.mappingHeader}>{t('wizard.samplePreview')}</th>
                        <th className={styles.mappingHeader}>{t('placeEditor.taxonomy')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.headers.map((header, columnIndex) => (
                        <tr key={header}>
                          <td className={styles.mappingCell}>
                            <span className="font-mono text-[12px] font-semibold text-text">
                              {header}
                            </span>
                          </td>
                          <td className={styles.mappingCell}>
                            <span className={styles.sample}>
                              {preview.sampleRows
                                .map((row) => row[columnIndex] ?? '')
                                .filter(Boolean)
                                .slice(0, 2)
                                .join(' · ') || '—'}
                            </span>
                          </td>
                          <td className={styles.mappingCell}>
                            <select
                              aria-label={header}
                              className="min-h-11 w-full rounded-compact border border-line-strong bg-surface px-2 text-[13px]"
                              value={mapping[header] ?? ''}
                              onChange={(event) =>
                                setMapping((current) => {
                                  const next = { ...current }
                                  if (event.target.value === '') delete next[header]
                                  else next[header] = event.target.value as ImportCanonicalField
                                  return next
                                })
                              }
                            >
                              <option value="">{t('wizard.mappingIgnore')}</option>
                              {MAPPABLE_FIELDS.map((field) => (
                                <option key={field} value={field}>
                                  {/*
                                    The value stays the canonical wire name —
                                    that is what the server receives. `city` gets
                                    a label saying what it is for: a provider
                                    search hint, not an administrative level.
                                    Presenting it as the latter is what made
                                    operators treat it as the address.
                                  */}
                                  {FIELD_LABELS[field] ? t(FIELD_LABELS[field]!) : field}
                                  {requiredFields.includes(field) ? ' *' : ''}
                                </option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className={styles.warn}>
                  <span aria-hidden="true">ℹ</span>
                  {t('wizard.mappingHint')}
                </p>
              )}

              {/*
                ADM-107 — said once, where an operator looking for the missing
                "Quận/Huyện" choice will read it. The column is still accepted
                and still useful as historical evidence; it is no longer a level
                anything is filed under.
              */}
              <p className={styles.hint}>{t('wizard.districtRetired')}</p>

              {mappingBlocked ? (
                <p role="alert" className={styles.warn}>
                  <span aria-hidden="true">⚠</span>
                  {t('wizard.mappingRequired')}: {missingRequired.join(', ')}
                </p>
              ) : null}

              {categoryDerived ? (
                <p className={styles.note}>
                  <span aria-hidden="true">ℹ</span>
                  {t('wizard.categoryDerived')}
                </p>
              ) : null}

              {preview ? (
                <p className={styles.note}>
                  <span aria-hidden="true">ℹ</span>
                  {t('wizard.rowIdDerived')}
                </p>
              ) : null}

              {unmappedHeaders.length > 0 ? (
                <p className={styles.note}>
                  <span aria-hidden="true">ℹ</span>
                  {t('wizard.unmapped', { headers: unmappedHeaders.join(', ') })}
                </p>
              ) : null}

              <div className={styles.footer}>
                <Button variant="secondary" onClick={() => setStep('source')}>
                  {t('wizard.back')}
                </Button>
                <Button
                  variant="primary"
                  disabled={mappingBlocked}
                  onClick={() => setStep('review')}
                >
                  {t('wizard.continue')}
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}

        {step === 'review' ? (
          <Card>
            <CardHeader title={t('wizard.step.review')} hint={t('wizard.modeHint')} />
            <CardBody className="flex flex-col gap-4">
              <fieldset className={styles.modeGrid}>
                <legend className="mb-2 text-xs font-semibold text-text-muted">
                  {t('wizard.mode')}
                </legend>
                {MODES.map((option) => {
                  const disabled = option === 'publish_approved' && !canPublishMode
                  return (
                    <label
                      key={option}
                      className={`${styles.modeOption} ${
                        mode === option ? styles.sourceOptionActive : styles.sourceOptionIdle
                      } ${disabled ? 'opacity-50' : 'cursor-pointer'}`}
                    >
                      <span className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="import-mode"
                          value={option}
                          checked={mode === option}
                          disabled={disabled}
                          onChange={() => setMode(option)}
                          className="accent-[var(--color-coral)]"
                        />
                        <span className="text-[13px] font-semibold text-text">
                          {t(`importMode.${option}` as const)}
                        </span>
                      </span>
                      <span className="text-xs text-text-muted">
                        {t(`importMode.${option}Hint` as const)}
                      </span>
                    </label>
                  )
                })}
              </fieldset>

              <Select
                label={t('wizard.defaultCity')}
                value={defaultCity}
                onChange={(event) => setDefaultCity(event.target.value)}
                className="max-w-sm"
              >
                <option value="">—</option>
                <option value={defaultCity || 'Hồ Chí Minh'}>{defaultCity || 'Hồ Chí Minh'}</option>
              </Select>

              <dl className="grid gap-2 rounded-compact border border-line bg-surface-muted p-3 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-text-subtle">{t('imports.col.source')}</dt>
                  <dd className="font-semibold text-text">
                    {sourceKind === 'file' ? (file?.name ?? '—') : sheetUrl || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-subtle">{t('imports.col.mode')}</dt>
                  <dd className="font-semibold text-text">{t(`importMode.${mode}` as const)}</dd>
                </div>
              </dl>

              <div className={styles.footer}>
                <Button variant="secondary" onClick={() => setStep('mapping')}>
                  {t('wizard.back')}
                </Button>
                <Button
                  variant="primary"
                  disabled={!sourceReady || !online}
                  loading={create.isPending}
                  onClick={() => create.mutate()}
                >
                  {create.isPending ? t('wizard.creating') : t('wizard.create')}
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}
      </PageBody>
    </>
  )
}
