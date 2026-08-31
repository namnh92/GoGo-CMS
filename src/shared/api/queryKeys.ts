import type { ImportRowStatus } from './contracts-import'
import type { PlaceStatus, TaxonomyKind } from './contracts'

/** Single registry so invalidation after a mutation is never guesswork. */
export const queryKeys = {
  session: ['session'] as const,

  opsKpis: ['ops', 'kpis'] as const,

  admins: {
    all: ['admins'] as const,
    list: (filters: Record<string, unknown>) => ['admins', 'list', filters] as const,
  },

  places: {
    all: ['places'] as const,
    list: (filters: { status?: PlaceStatus | 'all'; q?: string; limit?: number }) =>
      ['places', 'list', filters] as const,
    detail: (id: string) => ['places', 'detail', id] as const,
    audit: (id: string) => ['places', 'audit', id] as const,
    stale: (days: number) => ['places', 'stale', days] as const,
    duplicates: ['places', 'duplicates'] as const,
  },

  taxonomies: {
    all: ['taxonomies'] as const,
    byKind: (kind: TaxonomyKind) => ['taxonomies', kind] as const,
  },

  collections: {
    all: ['collections'] as const,
    list: (status?: string) => ['collections', 'list', status ?? 'all'] as const,
    items: (id: string) => ['collections', 'items', id] as const,
  },

  moderation: {
    all: ['moderation'] as const,
    /** `GET /cms/moderation/counts` — backlog totals, independent of page size. */
    counts: ['moderation', 'counts'] as const,
    /** Per-type queues (GoGo-BE#219); filters are part of each key. */
    reports: (filters: Record<string, unknown>) => ['moderation', 'reports', filters] as const,
    checkins: (filters: Record<string, unknown>) => ['moderation', 'checkins', filters] as const,
    community: (filters: Record<string, unknown>) => ['moderation', 'community', filters] as const,
    /** Decisions already recorded against one review, read from the audit log. */
    history: (reviewId: string) => ['moderation', 'history', reviewId] as const,
    /** `GET /cms/moderation/reviews` — filters are part of the key. */
    reviews: (filters: Record<string, unknown>) => ['moderation', 'reviews', filters] as const,
  },

  imports: {
    all: ['imports'] as const,
    list: (offset: number, limit: number) => ['imports', 'list', offset, limit] as const,
    detail: (jobId: string) => ['imports', 'detail', jobId] as const,
    rows: (jobId: string, status: ImportRowStatus | 'all', offset: number) =>
      ['imports', 'rows', jobId, status, offset] as const,
  },

  submissions: {
    all: ['submissions'] as const,
    list: (status: string, cursor?: string) =>
      ['submissions', 'list', status, cursor ?? 'first'] as const,
  },

  flags: {
    all: ['flags'] as const,
    catalog: ['flags', 'catalog'] as const,
    overrides: (scope: Record<string, unknown>) => ['flags', 'overrides', scope] as const,
  },

  ranking: {
    configs: ['ranking', 'configs'] as const,
    flags: ['ranking', 'flags'] as const,
    experiments: ['ranking', 'experiments'] as const,
    evaluation: (id: string, sampleSize: number) =>
      ['ranking', 'evaluation', id, sampleSize] as const,
  },

  audit: {
    all: ['audit'] as const,
    list: (filters: Record<string, unknown>) => ['audit', 'list', filters] as const,
  },

  searchAnalytics: (days: number) => ['search-analytics', days] as const,
} as const
