import { useMemo, type ReactNode } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { useT } from '@/shared/i18n/i18n'
import { EmptyState, TableSkeleton } from './State'
import { Button } from './Button'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'
import { cn } from './cn'

export type DataTableProps<T> = {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  getRowId: (row: T) => string
  loading?: boolean
  emptyState?: ReactNode
  onRowClick?: (row: T) => void
  sorting?: SortingState
  onSortingChange?: (next: SortingState) => void
  /** Rows the operator has ticked. Selection lives in the caller. */
  selectedIds?: string[]
  rowTone?: (row: T) => 'default' | 'warning' | 'danger'
  caption?: string
}

export function DataTable<T>({
  data,
  columns,
  getRowId,
  loading,
  emptyState,
  onRowClick,
  sorting,
  onSortingChange,
  selectedIds,
  rowTone,
  caption,
}: DataTableProps<T>) {
  const selected = useMemo(() => new Set(selectedIds ?? []), [selectedIds])

  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: sorting ? { sorting } : {},
    onSortingChange: onSortingChange
      ? (updater) => {
          const next = typeof updater === 'function' ? updater(sorting ?? []) : updater
          onSortingChange(next)
        }
      : undefined,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  })

  if (loading) return <TableSkeleton cols={columns.length} />
  if (data.length === 0) return <>{emptyState ?? <EmptyState />}</>

  return (
    <div className="overflow-x-auto">
      <table className="data-grid w-full border-collapse text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-line text-left">
              {headerGroup.headers.map((header) => {
                const sortDirection = header.column.getIsSorted()
                const sortable = header.column.getCanSort()
                return (
                  <th
                    key={header.id}
                    scope="col"
                    aria-sort={
                      sortDirection === 'asc'
                        ? 'ascending'
                        : sortDirection === 'desc'
                          ? 'descending'
                          : sortable
                            ? 'none'
                            : undefined
                    }
                    className="px-3 py-2.5 text-[11px] font-bold uppercase tracking-wide text-text-subtle first:pl-4 last:pr-4"
                  >
                    {header.isPlaceholder ? null : sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="inline-flex items-center gap-1 uppercase"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <span aria-hidden="true">
                          {sortDirection === 'asc' ? '↑' : sortDirection === 'desc' ? '↓' : '↕'}
                        </span>
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row: Row<T>) => {
            const tone = rowTone?.(row.original) ?? 'default'
            const isSelected = selected.has(row.id)
            return (
              <tr
                key={row.id}
                aria-selected={isSelected || undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={
                  onRowClick
                    ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          onRowClick(row.original)
                        }
                      }
                    : undefined
                }
                className={cn(
                  'border-b border-line last:border-b-0',
                  onRowClick && 'cursor-pointer',
                  isSelected
                    ? 'bg-coral-soft/50'
                    : tone === 'danger'
                      ? 'bg-danger-soft/40'
                      : tone === 'warning'
                        ? 'bg-amber-soft/40'
                        : 'hover:bg-surface-muted',
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5 align-middle first:pl-4 last:pr-4">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({
  offset,
  limit,
  total,
  hasNext,
  onOffsetChange,
  summary,
}: {
  offset: number
  limit: number
  total?: number | null
  hasNext: boolean
  onOffsetChange: (next: number) => void
  summary?: ReactNode
}) {
  const t = useT()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
      <p className="text-xs text-text-subtle">{summary}</p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={offset === 0}
          onClick={() => onOffsetChange(Math.max(0, offset - limit))}
          iconLeft={<ChevronLeftIcon size={14} />}
        >
          {t('action.previous')}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={!hasNext}
          onClick={() => onOffsetChange(offset + limit)}
          iconRight={<ChevronRightIcon size={14} />}
        >
          {t('action.next')}
        </Button>
      </div>
      <span className="sr-only" aria-live="polite">
        {total != null ? `${offset + 1}–${Math.min(offset + limit, total)} / ${total}` : ''}
      </span>
    </div>
  )
}

/** Floating bar that appears once rows are ticked, mirroring the mockup. */
export function BulkActionBar({
  count,
  hint,
  children,
  onClear,
}: {
  count: number
  hint?: string
  children: ReactNode
  onClear: () => void
}) {
  const t = useT()
  if (count === 0) return null
  return (
    <div
      role="region"
      aria-label={hint}
      className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-sheet border border-line-strong bg-surface-inverse px-4 py-3 text-neutral-0 shadow-2xl"
    >
      <span className="rounded-pill bg-coral px-2 py-0.5 text-[11px] font-bold tabular-nums">
        {count}
      </span>
      {hint ? <span className="text-[13px] text-neutral-300">{hint}</span> : null}
      <div className="flex items-center gap-2">{children}</div>
      <button
        type="button"
        onClick={onClear}
        className="ml-1 min-h-11 px-2 text-[13px] font-semibold text-neutral-300 hover:text-neutral-0"
      >
        {t('places.bulk.clear')}
      </button>
    </div>
  )
}
