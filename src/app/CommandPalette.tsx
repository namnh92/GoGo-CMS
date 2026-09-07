import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '@/shared/i18n/i18n'
import { useSession } from '@/shared/auth/session'
import { queryKeys } from '@/shared/api/queryKeys'
import { fetchPlaces } from '@/features/places/api'
import { Modal } from '@/shared/ui/Overlay'
import { Spinner } from '@/shared/ui/Button'
import { SearchIcon } from '@/shared/ui/icons'
import { cn } from '@/shared/ui/cn'
import { NAV_LEAVES } from './nav'

/**
 * Jump-to anywhere. Lives in `app/` rather than `shared/ui/` because it reads
 * the navigation map and the catalog API — `shared/ui` is the layer that knows
 * about neither, and inverting that dependency to satisfy a folder name would
 * be the wrong trade.
 *
 * The palette never offers a destination the caller's role cannot open: nav
 * entries are filtered by the same `can(...)` the sidebar uses, and place
 * results only appear for a role that may read the catalog. That is a courtesy
 * to the operator, not a permission check — the API decides, as always.
 */
const PLACE_RESULT_LIMIT = 6
const MIN_QUERY_LENGTH = 2
const SEARCH_DEBOUNCE_MS = 200

type PaletteContextValue = { open: () => void }

const PaletteContext = createContext<PaletteContextValue | null>(null)

/**
 * `available` is false when no provider is mounted — a screen rendered on its
 * own in a test, for instance. Callers hide the entry point rather than
 * offering a control that would do nothing.
 */
export function useCommandPalette(): { open: () => void; available: boolean } {
  const value = useContext(PaletteContext)
  return value ? { open: value.open, available: true } : { open: () => {}, available: false }
}

/** `⌘K` on Apple keyboards, `Ctrl K` everywhere else. */
export function usePaletteShortcutLabel(): string {
  const t = useT()
  const isApple =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
  return t(isApple ? 'app.shortcut.cmdK' : 'app.shortcut.ctrlK')
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return
      if (event.key.toLowerCase() !== 'k') return
      event.preventDefault()
      setOpen((current) => !current)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo<PaletteContextValue>(() => ({ open: () => setOpen(true) }), [])

  return (
    <PaletteContext.Provider value={value}>
      {children}
      <CommandPaletteDialog open={open} onClose={() => setOpen(false)} />
    </PaletteContext.Provider>
  )
}

type Result = { key: string; to: string; label: string; hint: string }

function CommandPaletteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const { can } = useSession()
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const optionPrefix = useId()

  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)

  // A fresh palette every time: yesterday's query is never what you want.
  useEffect(() => {
    if (open) return
    setQuery('')
    setDebounced('')
    setActiveIndex(0)
  }, [open])

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [query])

  const canReadPlaces = can('place.read')
  const placeQueryEnabled = open && canReadPlaces && debounced.length >= MIN_QUERY_LENGTH

  const places = useQuery({
    queryKey: queryKeys.places.list({ q: debounced, limit: PLACE_RESULT_LIMIT }),
    // The request is cancelled by the signal as soon as the term moves on.
    queryFn: ({ signal }) => fetchPlaces({ q: debounced, limit: PLACE_RESULT_LIMIT }, signal),
    enabled: placeQueryEnabled,
    staleTime: 30_000,
  })

  const term = debounced.toLocaleLowerCase()

  const navResults = useMemo<Result[]>(() => {
    return NAV_LEAVES.filter((leaf) => can(leaf.permission))
      .map((leaf) => ({
        key: `nav:${leaf.to}`,
        to: leaf.to,
        label: t(leaf.labelKey),
        hint: t('palette.group.navigate'),
      }))
      .filter((result) => (term ? result.label.toLocaleLowerCase().includes(term) : true))
  }, [can, t, term])

  const placeResults = useMemo<Result[]>(() => {
    if (!placeQueryEnabled) return []
    return (places.data?.items ?? []).slice(0, PLACE_RESULT_LIMIT).map((place) => ({
      key: `place:${place.id}`,
      to: `/places/${place.id}`,
      label: place.name,
      hint: t('palette.group.places'),
    }))
  }, [placeQueryEnabled, places.data, t])

  const results = useMemo(() => [...navResults, ...placeResults], [navResults, placeResults])

  useEffect(() => {
    setActiveIndex(0)
  }, [results.length])

  const go = useCallback(
    (result: Result | undefined) => {
      if (!result) return
      onClose()
      navigate(result.to)
    },
    [navigate, onClose],
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((index) => (results.length === 0 ? 0 : (index + 1) % results.length))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) =>
        results.length === 0 ? 0 : (index - 1 + results.length) % results.length,
      )
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setActiveIndex(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setActiveIndex(Math.max(results.length - 1, 0))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      go(results[activeIndex])
    }
  }

  const searching = placeQueryEnabled && places.isFetching
  const noResults = results.length === 0 && !searching

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('palette.title')}
      description={t('palette.hint')}
      initialFocusRef={inputRef}
      bodyClassName="px-0 py-0"
    >
      <div className="border-b border-line px-5 py-3">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              results.length > 0 ? `${optionPrefix}-${activeIndex}` : undefined
            }
            aria-label={t('palette.title')}
            placeholder={t('app.searchPlaceholder')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            className={cn(
              'min-h-11 w-full rounded-compact border border-line-strong bg-surface pr-10 pl-9 text-sm text-text',
              'placeholder:text-text-subtle transition-colors duration-[var(--duration-fast)]',
              'hover:border-neutral-500',
            )}
          />
          <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-subtle">
            <SearchIcon size={15} />
          </span>
          {searching ? (
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-subtle">
              <Spinner />
            </span>
          ) : null}
        </div>
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label={t('palette.title')}
        className="max-h-80 overflow-auto p-2"
      >
        {results.map((result, index) => (
          <li key={result.key}>
            <button
              type="button"
              id={`${optionPrefix}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // Pointer down, not click: the input keeps focus, so the
              // combobox never loses its active descendant mid-selection.
              onMouseDown={(event) => {
                event.preventDefault()
                go(result)
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                'flex min-h-11 w-full items-center justify-between gap-3 rounded-compact px-3 text-left text-[13px]',
                'transition-colors duration-[var(--duration-fast)]',
                index === activeIndex
                  ? 'bg-coral-soft text-coral-ink'
                  : 'text-text hover:bg-surface-sunken',
              )}
            >
              <span className="truncate font-semibold">{result.label}</span>
              <span className="shrink-0 text-[11px] text-text-subtle">{result.hint}</span>
            </button>
          </li>
        ))}
      </ul>

      {searching ? (
        <p role="status" aria-live="polite" className="px-5 pb-4 text-xs text-text-subtle">
          {t('state.loading')}
        </p>
      ) : noResults ? (
        // Two different situations, two different sentences: nothing typed yet
        // is not the same as "we looked and there is nothing".
        <p role="status" aria-live="polite" className="px-5 pb-4 text-xs text-text-subtle">
          {debounced.length > 0 ? t('palette.noResults', { query: debounced }) : t('palette.empty')}
        </p>
      ) : null}
    </Modal>
  )
}
