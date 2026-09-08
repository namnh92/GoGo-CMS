import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { queryKeys } from '@/shared/api/queryKeys'
import { Combobox, type ComboboxOption, type ComboboxStatus } from '@/shared/ui/Combobox'
import { useErrorMessage } from '@/shared/ui/State'
import { toApiError } from '@/shared/api/errors'
import type { AdministrativeUnitDto } from '@/shared/api/contracts-administrative'
import { fetchCommunes, fetchProvinces, searchAdministrativeUnits } from './api'

/** Long enough that typing a commune name is one request, not eight. */
const SEARCH_DEBOUNCE_MS = 250

/** Below this a search is not a search — it would return most of the dataset. */
const MIN_SEARCH_LENGTH = 2

function useDebounced(value: string, delay = SEARCH_DEBOUNCE_MS): string {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export type AdministrativeLevel = 'PROVINCE' | 'COMMUNE'

export type AdministrativeUnitComboboxProps = {
  level: AdministrativeLevel
  /** Required for `COMMUNE`: the province whose units are on offer. */
  provinceCode?: string | null
  value: string | null
  onChange: (code: string | null) => void
  label: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  disabled?: boolean
  /** The stored code's name, when the caller already knows it (edit forms). */
  knownName?: string | null
  id?: string
  className?: string
}

/**
 * ADM-105 — the picker for one of Vietnam's two current administrative levels.
 *
 * It replaces a `<select>` of pre-rendered `<option>`s, which could not do this
 * job for two reasons. A province has hundreds of communes, so the list has to
 * be searched rather than scrolled; and the list is fetched, so it has a
 * loading, an empty, an error and a permission-denied state that a `<select>`
 * has nowhere to put. The empty dropdown an editor saw when `limit=500` was
 * answering 400 is exactly that missing state — it read as "this province has
 * no communes", which is a far more believable lie than "the request was
 * malformed".
 *
 * Two rules the component exists to hold, both inherited from the reviewer's
 * selector and now shared with the place forms:
 *
 * - **The commune list is fetched for the chosen province**, so a commune from
 *   another province cannot be offered, let alone submitted.
 * - **Display text is never the identifier.** The code the API returned is what
 *   gets stored; nothing here reconstructs one from a name or a list position.
 *
 * Typing searches on the server. GoGo-BE normalises Vietnamese the way the
 * catalogue does, so "ba dinh" finds "Phường Ba Đình"; a client-side
 * `includes()` over accented strings would not.
 */
export function AdministrativeUnitCombobox({
  level,
  provinceCode,
  value,
  onChange,
  label,
  hint,
  error,
  required,
  disabled,
  knownName,
  id,
  className,
}: AdministrativeUnitComboboxProps) {
  const t = useT()
  const describeError = useErrorMessage()
  const [query, setQuery] = useState('')
  const search = useDebounced(query.trim())
  const searching = search.length >= MIN_SEARCH_LENGTH

  const needsProvince = level === 'COMMUNE' && !provinceCode

  /*
   * The full list, paged all the way through. It is the default view and the
   * fallback for a search that finds nothing, and it is cached per province.
   */
  const listQuery = useQuery({
    queryKey:
      level === 'PROVINCE'
        ? queryKeys.administrativeProvinces()
        : queryKeys.administrativeCommunes(provinceCode ?? ''),
    queryFn: ({ signal }) =>
      level === 'PROVINCE' ? fetchProvinces(signal) : fetchCommunes(provinceCode!, signal),
    enabled: !needsProvince,
    staleTime: 5 * 60_000,
  })

  const searchQuery = useQuery({
    queryKey: queryKeys.administrativeUnitSearch(level, provinceCode ?? '', search),
    queryFn: ({ signal }) =>
      searchAdministrativeUnits(
        {
          query: search,
          // A commune search is narrowed to the chosen province; a province
          // search is not narrowed at all.
          ...(level === 'COMMUNE' && provinceCode ? { provinceCode } : {}),
        },
        signal,
      ),
    enabled: searching && !needsProvince,
    staleTime: 5 * 60_000,
  })

  const active = searching ? searchQuery : listQuery

  const units: AdministrativeUnitDto[] = useMemo(() => {
    const rows = active.data?.items ?? []
    // The search endpoint answers across levels, so a province name typed into
    // a commune box would otherwise offer the province itself as a choice.
    return rows.filter((unit) => unit.level === level && unit.isCurrent)
  }, [active.data, level])

  const options: ComboboxOption[] = useMemo(
    () =>
      units.map((unit) => ({
        value: unit.code,
        label: unit.fullName,
        // The code is shown, not hidden: it is what gets stored, and an editor
        // reporting a wrong mapping needs to be able to quote it.
        meta: unit.code,
      })),
    [units],
  )

  /*
   * What the closed field reads. The list is the first answer; a stored code the
   * list does not carry falls back to the name the caller already had, and then
   * to the code itself — a picker that silently blanked the value it was opened
   * to display would be the worst of the three.
   */
  const valueLabel = value
    ? (units.find((unit) => unit.code === value)?.fullName ??
      listQuery.data?.items.find((unit) => unit.code === value)?.fullName ??
      knownName ??
      value)
    : undefined

  const apiError = active.error ? toApiError(active.error) : null
  const status: ComboboxStatus = needsProvince
    ? 'success'
    : active.isPending
      ? 'pending'
      : apiError
        ? apiError.isForbidden
          ? 'denied'
          : 'error'
        : 'success'

  return (
    <Combobox
      label={label}
      hint={hint ?? (needsProvince ? t('unitPicker.chooseProvinceFirst') : undefined)}
      error={error}
      required={required}
      disabled={disabled || needsProvince}
      placeholder={
        level === 'PROVINCE'
          ? t('unitPicker.provincePlaceholder')
          : t('unitPicker.communePlaceholder')
      }
      value={value}
      valueLabel={valueLabel}
      onChange={onChange}
      query={query}
      onQueryChange={setQuery}
      options={options}
      status={status}
      errorMessage={apiError ? describeError(apiError) : undefined}
      onRetry={() => void active.refetch()}
      emptyLabel={
        level === 'PROVINCE' ? t('unitPicker.provinceEmpty') : t('unitPicker.communeEmpty')
      }
      noMatchLabel={t('unitPicker.noMatch', { query: query.trim() })}
      id={id}
      className={className}
    />
  )
}

/**
 * The display name of one province code, from the same list the picker uses.
 *
 * A convenience for callers that need the *name* for something other than the
 * picker — the discovery-area list groups by city, and the province is the
 * nearest thing GoGo has to one. It shares the query key, so it costs nothing
 * beyond the fetch the picker already made.
 */
export function useProvinceName(provinceCode: string | null | undefined): string | null {
  const provinces = useQuery({
    queryKey: queryKeys.administrativeProvinces(),
    queryFn: ({ signal }) => fetchProvinces(signal),
    enabled: Boolean(provinceCode),
    staleTime: 5 * 60_000,
  })
  if (!provinceCode) return null
  return provinces.data?.items.find((unit) => unit.code === provinceCode)?.fullName ?? null
}
