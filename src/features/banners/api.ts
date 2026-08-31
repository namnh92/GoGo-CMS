import { apiFetch, apiFetchParsed } from '@/shared/api/client'
import {
  cmsBannerPageSchema,
  cmsBannerSchema,
  type BannerDestination,
  type BannerEffectiveStatus,
  type BannerPlacement,
  type BannerStatus,
  type CmsBanner,
  type CmsBannerPage,
  type ContentAudience,
} from '@/shared/api/contracts'

/** Every parameter `GET /cms/banners` accepts (GoGo-BE#224). */
export type BannerFilters = {
  placement?: BannerPlacement
  /** Accepts `expired`, which the server computes rather than stores. */
  status?: BannerEffectiveStatus
  audience?: ContentAudience
  q?: string
  limit?: number
  cursor?: string | null
}

export function fetchBanners(filters: BannerFilters, signal?: AbortSignal): Promise<CmsBannerPage> {
  return apiFetchParsed(cmsBannerPageSchema, '/cms/banners', {
    query: {
      placement: filters.placement,
      status: filters.status,
      audience: filters.audience,
      q: filters.q || undefined,
      limit: filters.limit ?? 25,
      // Keyset: `priority` is editable, so a row whose priority changed
      // mid-traversal would jump pages under an offset.
      cursor: filters.cursor ?? undefined,
    },
    signal,
  })
}

export function fetchBanner(id: string, signal?: AbortSignal): Promise<CmsBanner> {
  return apiFetchParsed(cmsBannerSchema, `/cms/banners/${id}`, { signal })
}

/** Exactly the fields `CmsBannerCreate` declares. */
export type CreateBannerInput = {
  name: string
  /** From `POST /cms/uploads`, purpose `banner_image`. A banner is an image. */
  imageKey: string
  placement: BannerPlacement
  title?: string
  subtitle?: string
  ctaLabel?: string
  destinationType?: BannerDestination
  /** Required unless `destinationType` is `none`, which takes nothing. */
  destinationValue?: string
  audience?: ContentAudience
  startsAt?: string
  endsAt?: string
  priority?: number
}

export function createBanner(input: CreateBannerInput): Promise<CmsBanner> {
  return apiFetchParsed(cmsBannerSchema, '/cms/banners', { method: 'POST', body: input })
}

/** Omitted fields are left alone. */
export type UpdateBannerInput = Partial<CreateBannerInput>

export function updateBanner(id: string, input: UpdateBannerInput): Promise<CmsBanner> {
  return apiFetchParsed(cmsBannerSchema, `/cms/banners/${id}`, { method: 'PATCH', body: input })
}

/**
 * Takes only the statuses a person controls — `expired` is not one of them.
 * Scheduling needs a start time, and publishing a banner whose window has
 * already closed is refused rather than producing something the very next read
 * reports as expired.
 */
export function setBannerStatus(id: string, status: BannerStatus) {
  return apiFetch(`/cms/banners/${id}/status`, { method: 'PATCH', body: { status } })
}
