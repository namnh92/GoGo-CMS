import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import { taxonomyListSchema, type TaxonomyKind } from '@/shared/api/contracts'

/**
 * `cmsListTaxonomies`. Unfiltered it returns inactive keys too — the console is
 * the only place a switched-off key can be found and switched back on, so the
 * default must not hide it. The public `GET /taxonomies` is not a substitute:
 * it returns neither the inactive keys nor `usageCount`.
 */
export function fetchTaxonomies(
  filters: { kind?: TaxonomyKind; isActive?: boolean } = {},
  signal?: AbortSignal,
) {
  return apiFetchParsed(taxonomyListSchema, '/cms/taxonomies', {
    query: { kind: filters.kind, isActive: filters.isActive },
    signal,
  })
}

export function createTaxonomy(input: {
  kind: TaxonomyKind
  key: string
  labels: Record<string, string>
  sortOrder?: number
}) {
  return apiFetch('/cms/taxonomies', { method: 'POST', body: input })
}

export function updateTaxonomy(
  id: string,
  input: { labels?: Record<string, string>; sortOrder?: number; isActive?: boolean },
) {
  return apiFetch(`/cms/taxonomies/${id}`, { method: 'PATCH', body: input })
}

export function addSynonym(id: string, term: string, locale = 'vi') {
  return apiFetch(`/cms/taxonomies/${id}/synonyms`, { method: 'POST', body: { term, locale } })
}
