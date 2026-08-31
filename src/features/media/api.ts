import { apiFetchParsed } from '@/shared/api/client'
import {
  cmsUploadSchema,
  type CmsUpload,
  type CmsUploadContentType,
  type CmsUploadPurpose,
} from '@/shared/api/contracts'

/**
 * Authorize an upload. `contentLength` is declared up front so an oversized
 * file is refused before a URL exists, rather than after the bytes have
 * crossed the network.
 */
export function authorizeUpload(input: {
  purpose: CmsUploadPurpose
  contentType: CmsUploadContentType
  contentLength: number
}): Promise<CmsUpload> {
  return apiFetchParsed(cmsUploadSchema, '/cms/uploads', { method: 'POST', body: input })
}

/**
 * PUT the bytes straight to storage.
 *
 * Deliberately not `apiFetch`: `uploadUrl` is an absolute, presigned storage
 * URL, and sending the session cookie, the CSRF header or a bearer token to a
 * third-party host would leak credentials the storage never needs. The
 * signature IS the authorization. `credentials: 'omit'` says so explicitly
 * rather than relying on the URL being cross-origin.
 */
export async function putUploadBytes(
  uploadUrl: string,
  file: File,
  contentType: string,
): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    credentials: 'omit',
    // Must match what the URL was signed for, or storage rejects the PUT.
    headers: { 'Content-Type': contentType },
  })
  if (!response.ok) throw new Error(`upload failed with ${response.status}`)
}

export type UploadedImage = { key: string; readUrl: string | null }

/** Authorize, then send. The key is what a resource stores; the bytes are not. */
export async function uploadImage(
  file: File,
  purpose: CmsUploadPurpose,
  contentType: CmsUploadContentType,
): Promise<UploadedImage> {
  const authorized = await authorizeUpload({
    purpose,
    contentType,
    contentLength: file.size,
  })
  await putUploadBytes(authorized.uploadUrl, file, authorized.contentType)
  return { key: authorized.key, readUrl: authorized.readUrl }
}
