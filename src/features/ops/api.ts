import { apiFetchParsed } from '@/shared/api/client'
import { opsKpisSchema, type OpsKpis } from '@/shared/api/contracts'

export function fetchOpsKpis(signal?: AbortSignal): Promise<OpsKpis> {
  return apiFetchParsed(opsKpisSchema, '/cms/ops/kpis', { signal })
}
