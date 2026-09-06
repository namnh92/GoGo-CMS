import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useI18n, useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { formatNumber } from '@/shared/format'
import { Combobox, type ComboboxOption, type ComboboxStatus } from '@/shared/ui/Combobox'
import { useErrorMessage } from '@/shared/ui/State'
import { toApiError } from '@/shared/api/errors'
import type { CmsArea } from '@/shared/api/contracts'
import { fetchAreas } from './api'

/** Long enough that typing a district name is one request, not eight. */
const SEARCH_DEBOUNCE_MS = 250

function useDebounced(value: string, delay = SEARCH_DEBOUNCE_MS): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Accent-insensitive comparison, for matching a typed city to a catalog one. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .trim()
    .toLowerCase()
}

export type AreaComboboxProps = {
  label: string
  labelHidden?: boolean
  hint?: ReactNode
  error?: string
  disabled?: boolean
  placeholder?: string
  value: string | null
  onChange: (value: string | null) => void
  /**
   * The administrative city currently in the form. Areas filed under it sort
   * to the top — but it is **not** sent as a server filter: `city` is free
   * text an editor may have typed differently from the catalog, and a filter
   * on a typo would hide the very rows the list exists to offer.
   */
  preferCity?: string
  className?: string
  inputClassName?: string
  id?: string
}

/**
 * CMS-044 — the picker for `areaKey`.
 *
 * `areaKey` is the **discovery area**, the vocabulary `service_areas` owns and
 * `cmsListAreas` exposes. It is not a taxonomy: there is no `area` taxonomy
 * kind, and the hint this control replaces told editors to pick one anyway.
 * It is not the address either — that is `city`/`district`, which are separate
 * free-text fields on the same form.
 */
export function AreaCombobox({
  label,
  labelHidden,
  hint,
  error,
  disabled,
  placeholder,
  value,
  onChange,
  preferCity,
  className,
  inputClassName,
  id,
}: AreaComboboxProps) {
  const t = useT()
  const { locale } = useI18n()
  const describeError = useErrorMessage()
  const [query, setQuery] = useState('')
  const search = useDebounced(query.trim())

  /*
   * The choices. Retired areas are absent by design — an area nobody may file
   * a new place under should not be offered as a new choice.
   */
  const catalogQuery = useQuery({
    queryKey: queryKeys.areas.list({ q: search }),
    queryFn: ({ signal }) => fetchAreas({ q: search || undefined }, signal),
    staleTime: 60_000,
  })

  /*
   * The value this place already holds, resolved separately and with
   * `includeInactive`, because the two questions have different answers: a
   * retired key and a key the catalog never had are both invisible to the list
   * above, and both are values a place is sitting on right now.
   */
  const resolveQuery = useQuery({
    queryKey: queryKeys.areas.list({ includeInactive: true }),
    queryFn: ({ signal }) => fetchAreas({ includeInactive: true }, signal),
    enabled: Boolean(value),
    staleTime: 60_000,
  })

  const held: CmsArea | undefined = useMemo(() => {
    if (!value) return undefined
    const fromCatalog = catalogQuery.data?.find((area) => area.key === value)
    if (fromCatalog) return fromCatalog
    return resolveQuery.data?.find((area) => area.key === value)
  }, [value, catalogQuery.data, resolveQuery.data])

  const describeArea = useCallback(
    (area: CmsArea): ComboboxOption => ({
      value: area.key,
      // An unknown key has no curated name: the key is the only label there is,
      // and making one up would put a display string where data belongs.
      label: area.name ?? area.key,
      meta: [
        area.key,
        // How many places an editor is joining — 40, or a category of one.
        t('areaPicker.placeCount', { count: formatNumber(area.placeCount, locale) }),
        !area.known ? t('areaPicker.unknownHint') : null,
      ]
        .filter(Boolean)
        .join(' · '),
      group: area.city ?? t('areaPicker.noCity'),
      badge: !area.known
        ? t('areaPicker.unknownBadge')
        : !area.isActive
          ? t('areaPicker.retiredBadge')
          : undefined,
    }),
    [t, locale],
  )

  const options = useMemo(() => {
    const rows = [...(catalogQuery.data ?? [])]
    // The held value always renders, even when the catalog does not list it.
    if (held && !rows.some((area) => area.key === held.key)) rows.unshift(held)
    const preferred = preferCity ? fold(preferCity) : null
    const ranked = rows
      .map((area, index) => ({ area, index }))
      .sort((a, b) => {
        const aCity = preferred !== null && fold(a.area.city ?? '') === preferred ? 0 : 1
        const bCity = preferred !== null && fold(b.area.city ?? '') === preferred ? 0 : 1
        if (aCity !== bCity) return aCity - bCity
        return a.index - b.index
      })
    return ranked.map(({ area }) => describeArea(area))
  }, [catalogQuery.data, held, preferCity, describeArea])

  const apiError = catalogQuery.error ? toApiError(catalogQuery.error) : null
  const status: ComboboxStatus = catalogQuery.isPending
    ? 'pending'
    : apiError
      ? apiError.isForbidden
        ? 'denied'
        : 'error'
      : 'success'

  /*
   * The label a closed field shows. A key nobody can resolve still renders —
   * as itself, plus the reason it has no name — because the alternative is a
   * picker that silently blanks the value it was opened to display.
   */
  const valueLabel = value
    ? held?.name
      ? held.known && held.isActive
        ? held.name
        : `${held.name} · ${held.known ? t('areaPicker.retiredBadge') : t('areaPicker.unknownBadge')}`
      : resolveQuery.isPending
        ? value
        : `${value} · ${t('areaPicker.unknownBadge')}`
    : undefined

  return (
    <Combobox
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      error={error}
      disabled={disabled}
      placeholder={placeholder ?? t('areaPicker.placeholder')}
      value={value}
      valueLabel={valueLabel}
      onChange={onChange}
      query={query}
      onQueryChange={setQuery}
      options={options}
      status={status}
      errorMessage={apiError ? describeError(apiError) : undefined}
      onRetry={() => void catalogQuery.refetch()}
      emptyLabel={t('areaPicker.empty')}
      noMatchLabel={t('areaPicker.noMatch', { query: query.trim() })}
      className={className}
      inputClassName={inputClassName}
      id={id}
    />
  )
}
