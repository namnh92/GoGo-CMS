import type { ImportRowStatus } from './contracts-import'
import type { PlaceStatus, TaxonomyKind } from './contracts'

/** Single registry so invalidation after a mutation is never guesswork. */
export const queryKeys = {
  session: ['session'] as const,

  opsKpis: ['ops', 'kpis'] as const,

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
  },

  moderation: {
    all: ['moderation'] as const,
    queue: (limit: number) => ['moderation', 'queue', limit] as const,
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

  ranking: {
    configs: ['ranking', 'configs'] as const,
    flags: ['ranking', 'flags'] as const,
  },
} as const
