import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { useSession } from '@/shared/auth/session'
import { useOnline } from '@/shared/ui/useOnline'
import { formatDateTime } from '@/shared/format'
import { PageBody, PageHeader } from '@/app/PageHeader'
import { Card, CardHeader } from '@/shared/ui/Card'
import { Button } from '@/shared/ui/Button'
import { Badge } from '@/shared/ui/Badge'
import { InlineSelect, TextInput, Toggle } from '@/shared/ui/Field'
import { ConfirmDialog } from '@/shared/ui/Overlay'
import {
  AsyncBoundary,
  EmptyState,
  PermissionDeniedState,
  useErrorMessage,
} from '@/shared/ui/State'
import { useToast } from '@/shared/ui/Toast'
import {
  flagEnvironmentSchema,
  flagPlatformSchema,
  type FeatureFlagDefinition,
  type FlagEnvironment,
  type FlagPlatform,
} from '@/shared/api/contracts'
import { fetchFlagCatalog, fetchFlagOverrides, setFlag } from '@/features/flags/api'
import { VERSION_PATTERN, resolveOverride } from '@/features/flags/flagValue'
import { styles } from './appControl.style'

/**
 * Purposed views over the one flag system.
 *
 * The Figma App Control group draws Maintenance, App Version and Kill Switch
 * as separate consoles. In the contract they are all keys of
 * `/cms/feature-flags` — `maintenance_mode`, `minimum_app_version`,
 * `recommended_app_version`, `feature_*` — so this screen is a purposed
 * arrangement of the same reads and writes the generic flags panel uses,
 * never a second store and never a second CRUD.
 *
 * Every section asks the catalog first: a key that is not in it is a value
 * nothing reads, and gets a "no longer served" notice instead of a control
 * that looks live.
 */
const MAINTENANCE_KEY = 'maintenance_mode'
const VERSION_KEYS = ['minimum_app_version', 'recommended_app_version'] as const

export default function AppControlScreen() {
  const t = useT()
  const { locale } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const online = useOnline()
  const describeError = useErrorMessage()

  const canRead = can('flag.read')
  const canManage = can('flag.manage')

  const [environment, setEnvironment] = useState<FlagEnvironment>('all')
  const [platform, setPlatform] = useState<FlagPlatform>('all')
  const [versionDrafts, setVersionDrafts] = useState<Record<string, string>>({})
  const [versionErrors, setVersionErrors] = useState<Record<string, boolean>>({})
  const [confirmMaintenance, setConfirmMaintenance] = useState(false)

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

  // A different scope is a different set of stored values.
  useEffect(() => {
    setVersionDrafts({})
    setVersionErrors({})
  }, [environment, platform])

  const overrides = useMemo(() => overridesQuery.data ?? [], [overridesQuery.data])

  const save = useMutation({
    mutationFn: setFlag,
    onSuccess: (_result, variables) => {
      toast.success(t('appControl.saved', { key: variables.key }))
      setVersionDrafts((current) => {
        const next = { ...current }
        delete next[variables.key]
        return next
      })
      void queryClient.invalidateQueries({ queryKey: queryKeys.flags.all })
    },
    onError: (error) => toast.error(describeError(error)),
  })

  const writeScope = {
    ...(environment === 'all' ? {} : { environment }),
    ...(platform === 'all' ? {} : { platform }),
  }

  if (!canRead) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: t('app.suffix') }]} title={t('appControl.title')} />
        <PageBody>
          <PermissionDeniedState />
        </PageBody>
      </>
    )
  }

  const definitionOf = (key: string): FeatureFlagDefinition | undefined =>
    catalogQuery.data?.find((definition) => definition.key === key)

  const currentValue = (definition: FeatureFlagDefinition): unknown => {
    const override = resolveOverride(overrides, definition.key, environment, platform)
    if (override === undefined) return definition.defaultValue
    return override.value ?? override.payload
  }
  const overrideOf = (key: string) => resolveOverride(overrides, key, environment, platform)

  const scopeLabel = `${t(`flags.env.${environment}` as const)} · ${t(
    `flags.platform.${platform}` as const,
  )}`

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: t('app.suffix') }, { label: t('appControl.breadcrumb') }]}
        title={t('appControl.title')}
      />
      <PageBody>
        <AsyncBoundary
          status={catalogQuery.status}
          error={catalogQuery.error}
          data={catalogQuery.data ?? []}
          isEmpty={(items) => items.length === 0}
          onRetry={() => void catalogQuery.refetch()}
          empty={<EmptyState title={t('flags.empty')} hint={t('flags.emptyHint')} />}
        >
          {(catalog) => {
            const maintenance = definitionOf(MAINTENANCE_KEY)
            const maintenanceOn = maintenance ? currentValue(maintenance) === true : false
            const killSwitches = catalog.filter(
              (definition) =>
                definition.valueType === 'boolean' && definition.key.startsWith('feature_'),
            )

            return (
              <>
                {/* Scope picker — shared by every section below. */}
                <Card>
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
                    <p className={styles.scopeNote}>{t('appControl.scopeNote')}</p>
                  </div>
                </Card>

                {/* Maintenance */}
                <Card>
                  <CardHeader
                    title={t('appControl.maintenance.title')}
                    hint={t('appControl.maintenance.hint')}
                  />
                  <div className={styles.sectionBody}>
                    {maintenance ? (
                      <>
                        <div className={styles.maintRow}>
                          <span className={maintenanceOn ? styles.maintOn : styles.maintOff}>
                            {maintenanceOn
                              ? t('appControl.maintenance.on')
                              : t('appControl.maintenance.off')}
                          </span>
                          <span className={styles.maintScope}>{scopeLabel}</span>
                          <Button
                            variant={maintenanceOn ? 'secondary' : 'danger'}
                            size="sm"
                            loading={save.isPending && save.variables?.key === MAINTENANCE_KEY}
                            disabled={!canManage || !online}
                            onClick={() => {
                              if (maintenanceOn) {
                                // Turning the app back ON needs no ceremony.
                                save.mutate({
                                  key: MAINTENANCE_KEY,
                                  enabled: false,
                                  ...writeScope,
                                })
                              } else {
                                setConfirmMaintenance(true)
                              }
                            }}
                          >
                            {maintenanceOn
                              ? t('appControl.maintenance.disable')
                              : t('appControl.maintenance.enable')}
                          </Button>
                        </div>
                        {maintenanceOn ? (
                          <p className={styles.maintWarn}>
                            <span aria-hidden="true">⚠</span>
                            {t('appControl.maintenance.activeWarn')}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <p className={styles.missing}>
                        <span aria-hidden="true">ℹ</span>
                        {t('appControl.keyGone', { key: MAINTENANCE_KEY })}
                      </p>
                    )}
                  </div>
                </Card>

                {/* App versions */}
                <Card>
                  <CardHeader
                    title={t('appControl.version.title')}
                    hint={t('appControl.version.hint')}
                  />
                  <div className={styles.sectionBody}>
                    {VERSION_KEYS.map((key) => {
                      const definition = definitionOf(key)
                      if (!definition) {
                        return (
                          <p key={key} className={styles.missing}>
                            <span aria-hidden="true">ℹ</span>
                            {t('appControl.keyGone', { key })}
                          </p>
                        )
                      }
                      const override = overrideOf(key)
                      const shown =
                        versionDrafts[key] ??
                        String(currentValue(definition) ?? definition.defaultValue)
                      return (
                        <div key={key} className={styles.versionRow}>
                          <div className={styles.versionKey}>
                            <p className={styles.versionLabel}>
                              {t(`appControl.version.${key}` as const)}
                            </p>
                            <p className={styles.versionDesc}>{definition.description}</p>
                          </div>
                          <TextInput
                            label={t('appControl.version.value')}
                            className={styles.versionField}
                            placeholder="1.2.3"
                            value={shown}
                            disabled={!canManage || !online}
                            error={versionErrors[key] ? t('flags.error.version') : undefined}
                            onChange={(event) =>
                              setVersionDrafts((current) => ({
                                ...current,
                                [key]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="primary"
                            loading={save.isPending && save.variables?.key === key}
                            disabled={!canManage || !online}
                            onClick={() => {
                              const raw = shown.trim()
                              // The same semver shape the server refuses.
                              if (!VERSION_PATTERN.test(raw)) {
                                setVersionErrors((current) => ({ ...current, [key]: true }))
                                return
                              }
                              setVersionErrors((current) => ({ ...current, [key]: false }))
                              save.mutate({ key, enabled: true, value: raw, ...writeScope })
                            }}
                          >
                            {t('flags.save')}
                          </Button>
                          <span className={styles.versionMeta}>
                            {override
                              ? t('appControl.version.overridden', {
                                  at: formatDateTime(override.updatedAt, locale),
                                })
                              : t('appControl.version.default')}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </Card>

                {/* Kill switches */}
                <Card>
                  <CardHeader
                    title={t('appControl.switches.title')}
                    hint={t('appControl.switches.hint')}
                  />
                  <div className={styles.sectionBody}>
                    {killSwitches.length === 0 ? (
                      <p className={styles.note}>{t('appControl.switches.none')}</p>
                    ) : (
                      killSwitches.map((definition) => {
                        const override = overrideOf(definition.key)
                        const on = currentValue(definition) === true
                        const blocked = !definition.platformScoped && platform !== 'all'
                        // Same distinction the flags panel draws: a row from a
                        // wider scope applies here but was not written here.
                        const exactScope =
                          override !== undefined &&
                          override.environment === environment &&
                          override.platform === platform
                        return (
                          <div key={definition.key} className={styles.switchRow}>
                            <div className={styles.switchBody}>
                              <p className={styles.switchKey}>{definition.key}</p>
                              <p className={styles.switchDesc}>{definition.description}</p>
                              <div className={styles.switchMeta}>
                                <span className={styles.badges}>
                                  {override ? (
                                    <Badge tone="mint">
                                      {exactScope
                                        ? t('flags.scope.exact')
                                        : t('flags.scope.inherited', {
                                            environment: t(
                                              `flags.env.${override.environment}` as const,
                                            ),
                                            platform: t(
                                              `flags.platform.${override.platform}` as const,
                                            ),
                                          })}
                                    </Badge>
                                  ) : (
                                    <Badge tone="neutral">{t('flags.notConfigured')}</Badge>
                                  )}
                                  {blocked ? (
                                    <Badge tone="amber">{t('flags.notPlatformScoped')}</Badge>
                                  ) : null}
                                </span>
                              </div>
                            </div>
                            <Toggle
                              label={t('flags.toggleLabel', { key: definition.key })}
                              checked={on}
                              disabled={
                                !canManage ||
                                !online ||
                                blocked ||
                                (save.isPending && save.variables?.key === definition.key)
                              }
                              onChange={(enabled) =>
                                save.mutate({ key: definition.key, enabled, ...writeScope })
                              }
                            />
                          </div>
                        )
                      })
                    )}
                  </div>
                </Card>

                <p className={styles.note}>
                  <span aria-hidden="true">ℹ</span>
                  {t('appControl.sourceNote')}
                </p>
              </>
            )
          }}
        </AsyncBoundary>
      </PageBody>

      {/* Turning maintenance ON takes the app away from everyone in scope —
          the dialog names exactly what is about to happen. */}
      <ConfirmDialog
        open={confirmMaintenance}
        onClose={() => setConfirmMaintenance(false)}
        title={t('appControl.maintenance.confirmTitle')}
        description={t('appControl.maintenance.confirmBody')}
        changes={[
          { label: t('flags.environment'), to: t(`flags.env.${environment}` as const) },
          { label: t('flags.platform'), to: t(`flags.platform.${platform}` as const) },
          {
            label: MAINTENANCE_KEY,
            from: t('appControl.maintenance.off'),
            to: t('appControl.maintenance.on'),
          },
        ]}
        confirmLabel={t('appControl.maintenance.enable')}
        tone="danger"
        loading={save.isPending}
        onConfirm={() => {
          setConfirmMaintenance(false)
          save.mutate({ key: MAINTENANCE_KEY, enabled: true, ...writeScope })
        }}
      />
    </>
  )
}
