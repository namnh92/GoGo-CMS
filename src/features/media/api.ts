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

/**
 * The same PUT, reporting how far it has got.
 *
 * `fetch` cannot say — a request body is not observable — so this is the one
 * place the console uses `XMLHttpRequest`: a queue of large photos with a bar
 * that only ever reads 0% or 100% tells an editor nothing about whether to
 * wait. Everything else about the request is identical to `putUploadBytes`,
 * including sending no credentials: the signature IS the authorization.
 *
 * `onProgress` is best-effort. A transport that reports no upload events
 * (some proxies, and the mock in tests) simply never calls it, and the caller
 * falls back to its stage-based estimate rather than freezing at zero.
 */
export function putUploadBytesTracked(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', uploadUrl, true)
    // Must match what the URL was signed for, or storage rejects the PUT.
    request.setRequestHeader('Content-Type', contentType)
    request.withCredentials = false

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total === 0) return
      onProgress?.(Math.min(1, event.loaded / event.total))
    }
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress?.(1)
        resolve()
        return
      }
      reject(new Error(`upload failed with ${request.status}`))
    }
    request.onerror = () => reject(new Error('upload failed: network unreachable'))
    request.onabort = () => reject(new DOMException('upload aborted', 'AbortError'))
    signal?.addEventListener('abort', () => request.abort(), { once: true })

    request.send(file)
  })
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
