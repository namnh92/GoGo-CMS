import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '@/shared/api/queryKeys'
import { campaignAudienceSchema, type CampaignAudience } from '@/shared/api/contracts'
import { fetchCampaignCapabilities } from './api'

/**
 * NTF-BE-017: whether `public` reaches devices in this environment. `undefined`
 * unless the latest read answered, so the option stays hidden unless the server
 * said yes: a failed re-read keeps its old data in the cache, and that old yes
 * is no longer one.
 */
export function usePublicAudience(enabled: boolean): boolean | undefined {
  const query = useQuery({
    queryKey: queryKeys.campaigns.capabilities,
    queryFn: ({ signal }) => fetchCampaignCapabilities(signal),
    enabled,
  })
  return query.isError ? undefined : query.data?.publicAudience
}

/**
 * What a composer offers. The value already on the form always stays in the
 * list, disabled when it could not be chosen now: a `<select>` without its
 * value shows the first option while the form still holds the old one, and
 * that is what would be saved and sent.
 */
export function audienceOptions(
  publicAudience: boolean | undefined,
  current: string,
): { value: string; disabled: boolean }[] {
  const offered: string[] = campaignAudienceSchema.options.filter(
    (value: CampaignAudience) => value !== 'public' || publicAudience === true,
  )
  const options = offered.map((value) => ({ value, disabled: false }))
  return offered.includes(current) ? options : [...options, { value: current, disabled: true }]
}
