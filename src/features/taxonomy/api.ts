import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import { taxonomyListSchema, type TaxonomyKind } from '@/shared/api/contracts'

/**
 * ⚠ Not yet in openapi/gogo.v1.yaml. The public `GET /taxonomies` is not a
 * substitute: the CMS needs usage counts and deactivated keys too.
 */
export function fetchTaxonomies(signal?: AbortSignal) {
  return apiFetchParsed(taxonomyListSchema, '/cms/taxonomies', { signal })
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
