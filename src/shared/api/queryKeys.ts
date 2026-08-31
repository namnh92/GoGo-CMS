import type { ImportRowStatus } from './contracts-import'
import type { PlaceStatus, TaxonomyKind } from './contracts'

/** Single registry so invalidation after a mutation is never guesswork. */
export const queryKeys = {
  session: ['session'] as const,

  opsKpis: ['ops', 'kpis'] as const,
  opsHealth: ['ops', 'health'] as const,
  opsQueues: ['ops', 'queues'] as const,
  opsCosts: ['ops', 'costs'] as const,

  planTemplates: {
    all: ['plan-templates'] as const,
    list: (filters: Record<string, unknown>) => ['plan-templates', 'list', filters] as const,
    detail: (id: string) => ['plan-templates', 'detail', id] as const,
  },

  recommendations: {
    all: ['recommendations'] as const,
    list: (filters: Record<string, unknown>) => ['recommendations', 'list', filters] as const,
    detail: (id: string) => ['recommendations', 'detail', id] as const,
  },

  campaigns: {
    all: ['campaigns'] as const,
    list: (filters: Record<string, unknown>) => ['campaigns', 'list', filters] as const,
    detail: (id: string) => ['campaigns', 'detail', id] as const,
    estimate: (id: string) => ['campaigns', 'estimate', id] as const,
  },

  banners: {
    all: ['banners'] as const,
    list: (filters: Record<string, unknown>) => ['banners', 'list', filters] as const,
    detail: (id: string) => ['banners', 'detail', id] as const,
  },

  safetyRules: {
    all: ['safety-rules'] as const,
    list: (filters: Record<string, unknown>) => ['safety-rules', 'list', filters] as const,
    detail: (id: string) => ['safety-rules', 'detail', id] as const,
  },

  appUsers: {
    all: ['app-users'] as const,
    list: (filters: Record<string, unknown>) => ['app-users', 'list', filters] as const,
    detail: (id: string) => ['app-users', 'detail', id] as const,
  },
  privacy: {
    all: ['privacy-requests'] as const,
    list: (filters: Record<string, unknown>) => ['privacy-requests', 'list', filters] as const,
    detail: (id: string) => ['privacy-requests', 'detail', id] as const,
  },

  rooms: {
    all: ['cms-rooms'] as const,
    list: (filters: Record<string, unknown>) => ['cms-rooms', 'list', filters] as const,
    guests: (roomId: string) => ['cms-rooms', 'guests', roomId] as const,
  },
  plans: {
    all: ['cms-plans'] as const,
    list: (filters: Record<string, unknown>) => ['cms-plans', 'list', filters] as const,
  },

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
    /** `GET /cms/moderation/reviews/{id}` — the unfiltered deep-link read. */
    review: (id: string) => ['moderation', 'review', id] as const,
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
