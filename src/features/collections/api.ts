import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import {
  collectionItemsSchema,
  collectionListSchema,
  type CollectionStatus,
} from '@/shared/api/contracts'

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

/**
 * `cmsListCollectionItems` — the current list, in position order, with each
 * place's status so a curator can see one that has left publication.
 *
 * Read before write is not optional here: `setCollectionItems` replaces the
 * whole list, so writing back a list nobody could read is how a curated
 * collection gets silently erased.
 */
export function fetchCollectionItems(id: string, signal?: AbortSignal) {
  return apiFetchParsed(collectionItemsSchema, `/cms/collections/${id}/items`, { signal })
}

/** Replaces the ordered list wholesale — max 100 places. */
export function setCollectionItems(id: string, placeIds: string[]) {
  return apiFetch(`/cms/collections/${id}/items`, { method: 'PUT', body: { placeIds } })
}
