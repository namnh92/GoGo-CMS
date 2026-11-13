import { apiFetch } from '@/shared/api/client'
import type { operations } from '@/shared/api/schema'

export type InviteSettings =
  operations['getCmsRoomInviteSettings']['responses'][200]['content']['application/json']
export type UpdateInviteSettings =
  operations['updateCmsRoomInviteSettings']['requestBody']['content']['application/json']

const PATH = '/cms/settings/room-invites'
export const fetchInviteSettings = (signal?: AbortSignal) =>
  apiFetch<InviteSettings>(PATH, { signal, cache: 'no-store' })

export const updateInviteSettings = (
  body: UpdateInviteSettings,
  ifMatch: string,
  idempotencyKey: string,
  signal?: AbortSignal,
) =>
  apiFetch<InviteSettings>(PATH, {
    method: 'PUT',
    body,
    ifMatch,
    idempotencyKey,
    signal,
    cache: 'no-store',
  })
