import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import { collectionListSchema, type CollectionStatus } from '@/shared/api/contracts'

export function fetchCollections(status: CollectionStatus | undefined, signal?: AbortSignal) {
  return apiFetchParsed(collectionListSchema, '/cms/collections', { query: { status }, signal })
}

export function createCollection(input: {
  slug: string
  title: string
  locale?: string
  description?: string
  startsAt?: string
  endsAt?: string
}) {
  return apiFetch('/cms/collections', { method: 'POST', body: input })
}

export function setCollectionStatus(id: string, status: CollectionStatus) {
  return apiFetch(`/cms/collections/${id}/status`, { method: 'PATCH', body: { status } })
}

/** Replaces the ordered list wholesale — max 100 places. */
export function setCollectionItems(id: string, placeIds: string[]) {
  return apiFetch(`/cms/collections/${id}/items`, { method: 'PUT', body: { placeIds } })
}
