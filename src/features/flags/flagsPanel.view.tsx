import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime } from '@/shared/format'
import { Card, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { InlineSelect, TextArea, TextInput, Toggle } from '@/shared/ui/Field'
import { AsyncBoundary, EmptyState, useErrorMessage } from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import {
  flagEnvironmentSchema,
  flagPlatformSchema,
  type FeatureFlag,
  type FeatureFlagDefinition,
  type FlagEnvironment,
  type FlagPlatform,
} from '@/shared/api/contracts'
import { fetchFlagCatalog, fetchFlagOverrides, setFlag } from './api'
import { formatFlagValue, parseFlagValue, resolveOverride } from './flagValue'
import { styles } from './flagsPanel.style'

/**
 * App configuration, typed.
 *
 * Driven by two endpoints on purpose: the **catalog** says which keys exist and
 * what each falls back to, the **override list** says what is currently stored.
 * Reading only the overrides would hide every key nobody has configured yet,
 * and would leave "not configured" and "configured to a falsy value" looking
 * identical — which is exactly what the catalog's `defaultValue` prevents.
 */
export function FlagsPanel() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const [environment, setEnvironment] = useState<FlagEnvironment>('all')
  const [platform, setPlatform] = useState<FlagPlatform>('all')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})

  const canRead = can('flag.read')
  const canManage = can('flag.manage')

  const catalogQuery = useQuery({
    queryKey: queryKeys.flags.catalog,
    queryFn: ({ signal }) => fetchFlagCatalog(signal),
    enabled: canRead,
    staleTime: 60_000,
  })

  const overridesQuery = useQuery({
    queryKey: queryKeys.flags.overrides({ environment, platform }),
    queryFn: ({ signal }) => fetchFlagOverrides({ environment, platform }, signal),
    enabled: canRead,
  })

  // A different scope is a different set of stored values; half-typed edits
  // from the previous one would be applied to the wrong row.
  useEffect(() => {
    setDrafts({})
    setErrors({})
  }, [environment, platform])

  const overrides = useMemo(() => overridesQuery.data ?? [], [overridesQuery.data])

  const save = useMutation({
    mutationFn: setFlag,
    onSuccess: (_result, variables) => {
      toast.success(t('flags.saved', { key: variables.key }))
      setDrafts((current) => {
        const next = { ...current }
        delete next[variables.key]
        return next
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.flags.all })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  /** Scope actually written: `all/all` means "omit and write the unscoped row". */
  const writeScope = {
    ...(environment === 'all' ? {} : { environment }),
    ...(platform === 'all' ? {} : { platform }),
  }

  const renderRow = (definition: FeatureFlagDefinition) => {
    const override = resolveOverride(overrides, definition.key, environment, platform)
    const configured = override !== undefined
    const exactScope =
      configured && override.environment === environment && override.platform === platform
    // A key that refuses per-platform overrides cannot be edited in a
    // platform-scoped view — the server would reject the write, so the console
    // does not offer it.
    const platformBlocked = !definition.platformScoped && platform !== 'all'
    const pending = save.isPending && save.variables?.key === definition.key
    const disabled = !canManage || !online || platformBlocked

    const currentValue = configured ? (override.value ?? override.payload) : undefined
    const draft = drafts[definition.key]
    const draftValue = draft ?? formatFlagValue(currentValue, definition.valueType)

    const commit = (enabled: boolean, rawValue?: string) => {
      if (definition.valueType === 'boolean') {
        save.mutate({ key: definition.key, enabled, ...writeScope })
        return
      }
      const parsed = parseFlagValue(rawValue ?? draftValue, definition.valueType)
      if (!parsed.ok) {
        setErrors((current) => ({
          ...current,
          [definition.key]: t(`flags.error.${parsed.error}` as const),
        }))
        return
      }
      setErrors((current) => {
        const next = { ...current }
        delete next[definition.key]
        return next
      })
      save.mutate({ key: definition.key, enabled, value: parsed.value, ...writeScope })
    }

    return (
      <div key={definition.key} className={styles.row}>
        <div className={styles.head}>
          <div className="min-w-0">
            <p className={styles.key}>{definition.key}</p>
            <p className={styles.desc}>{definition.description}</p>
            <div className={styles.badges}>
              <Badge tone="lavender">{t(`flags.type.${definition.valueType}` as const)}</Badge>
              {configured ? (
                <Badge tone="mint">
                  {exactScope
                    ? t('flags.scope.exact')
                    : t('flags.scope.inherited', {
                        environment: t(`flags.env.${override.environment}` as const),
                        platform: t(`flags.platform.${override.platform}` as const),
                      })}
                </Badge>
              ) : (
                // Not the same as "off": nothing is stored, so the backend uses
                // the registry default.
                <Badge tone="neutral">{t('flags.notConfigured')}</Badge>
              )}
              {!definition.platformScoped ? (
                <Badge tone="neutral">{t('flags.notPlatformScoped')}</Badge>
              ) : null}
            </div>
            <p className={styles.meta}>
              {t('flags.fallback')}:{' '}
              <span className={styles.fallback}>
                {formatFlagValue(definition.defaultValue, definition.valueType) ||
                  t('flags.emptyString')}
              </span>
              {configured ? (
                <>
                  {' · '}
                  {override.updatedBy?.displayName ?? override.updatedBy?.id ?? '—'}
                  {' · '}
                  {formatDateTime(override.updatedAt, locale)}
                </>
              ) : null}
            </p>
            {platformBlocked ? (
              <p className={styles.orphan}>
                <span aria-hidden="true">ℹ</span>
                {t('flags.platformBlocked')}
              </p>
            ) : null}
          </div>

          <div className={styles.actions}>
            <Toggle
              label={t('flags.toggleLabel', { key: definition.key })}
              checked={configured ? override.enabled : false}
              disabled={disabled || pending}
              onChange={(enabled) => commit(enabled)}
            />
          </div>
        </div>

        {definition.valueType !== 'boolean' ? (
          <div className={styles.editor}>
            {definition.valueType === 'json' ? (
              <TextArea
                label={t('flags.value')}
                rows={4}
                className={styles.jsonField}
                value={draftValue}
                disabled={disabled}
                error={errors[definition.key]}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [definition.key]: event.target.value }))
                }
              />
            ) : (
              <TextInput
                label={t('flags.value')}
                className={styles.valueField}
                inputMode={definition.valueType === 'number' ? 'decimal' : undefined}
                placeholder={
                  definition.valueType === 'version' ? '1.2.3' : t('flags.valuePlaceholder')
                }
                value={draftValue}
                disabled={disabled}
                error={errors[definition.key]}
                onChange={(event) =>
                  setDrafts((current) => ({ ...current, [definition.key]: event.target.value }))
                }
              />
            )}
            <Button
              size="sm"
              variant="primary"
              // `loading` also sets `disabled`, so one click cannot write twice.
              loading={pending}
              disabled={disabled}
              onClick={() => commit(true, draftValue)}
            >
              {t('flags.save')}
            </Button>
          </div>
        ) : null}
      </div>
    )
  }

  if (!canRead) return null

  // Rows whose key left the registry: nothing reads them any more, and the
  // catalog cannot describe them, so they are listed apart rather than mixed
  // in with keys that still mean something.
  const orphans = overrides.filter((row) => !row.known)

  return (
    <>
      <Card>
        <CardHeader title={t('flags.title')} hint={t('flags.hint')} />
        <div className={styles.scopeBar}>
          <InlineSelect
            label={t('flags.environment')}
            value={environment}
            onChange={(event) => setEnvironment(event.target.value as FlagEnvironment)}
          >
            {flagEnvironmentSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`flags.env.${value}` as const)}
              </option>
            ))}
          </InlineSelect>
          <InlineSelect
            label={t('flags.platform')}
            value={platform}
            onChange={(event) => setPlatform(event.target.value as FlagPlatform)}
          >
            {flagPlatformSchema.options.map((value) => (
              <option key={value} value={value}>
                {t(`flags.platform.${value}` as const)}
              </option>
            ))}
          </InlineSelect>
          <p className={styles.scopeNote}>{t('flags.scopeNote')}</p>
        </div>

        <AsyncBoundary
          status={catalogQuery.status}
          error={catalogQuery.error}
          data={catalogQuery.data ?? []}
          isEmpty={(items) => items.length === 0}
          onRetry={() => void catalogQuery.refetch()}
          empty={<EmptyState title={t('flags.empty')} hint={t('flags.emptyHint')} />}
        >
          {(definitions) => <div>{definitions.map(renderRow)}</div>}
        </AsyncBoundary>
      </Card>

      {orphans.length > 0 ? (
        <Card>
          <CardHeader title={t('flags.orphanTitle')} hint={t('flags.orphanHint')} />
          <div>
            {orphans.map((row: FeatureFlag) => (
              <div key={`${row.key}-${row.environment}-${row.platform}`} className={styles.row}>
                <p className={styles.key}>{row.key}</p>
                <p className={styles.meta}>
                  {t(`flags.env.${row.environment}` as const)} ·{' '}
                  {t(`flags.platform.${row.platform}` as const)} ·{' '}
                  {formatDateTime(row.updatedAt, locale)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <p className={styles.secretsNote}>{t('flags.secretsNote')}</p>
    </>
  )
}
