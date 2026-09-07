import type { MessageKey } from '@/shared/i18n/vi'
import type { AdministrativeCapability } from '@/shared/api/contracts-administrative'

/**
 * CMS #153 — what the capability response means for a person looking at it.
 *
 * Four states, in the order that matters. A missing dataset is the one that
 * stops work: nothing can be approved without one. Missing boundaries degrade
 * the resolver rather than stopping it — it still answers from stored codes and
 * names — so it is a warning, not a failure. Blocked publication is reported
 * separately because it is the consequence an editor actually feels.
 *
 * Nothing here makes the console unavailable. Partial administrative capability
 * is a fact about one feature, and turning it into a global error would take a
 * working CMS away from everyone who is not using that feature.
 */
export type CapabilityNotice = {
  tone: 'danger' | 'amber' | 'mint'
  messageKey: MessageKey
}

export function capabilityNotice(capability: AdministrativeCapability): CapabilityNotice {
  if (capability.dataset.state !== 'AVAILABLE') {
    return { tone: 'danger', messageKey: 'administrative.capability.datasetMissing' }
  }
  if (capability.publication === 'BLOCKED') {
    return { tone: 'danger', messageKey: 'administrative.capability.publicationBlocked' }
  }
  if (capability.boundaries.state !== 'AVAILABLE' || capability.resolver === 'PARTIAL') {
    return { tone: 'amber', messageKey: 'administrative.capability.boundariesMissing' }
  }
  return { tone: 'mint', messageKey: 'administrative.capability.full' }
}
