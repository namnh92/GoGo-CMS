import { fireEvent, screen, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'

/**
 * GoGo-BE#280 — fill the three evidence boxes for one contact field, found by
 * the group the editor sees ("Nguồn của Điện thoại"). `datetime-local` is set
 * with a change event because jsdom does not type into it key by key.
 */
export async function giveEvidence(
  user: ReturnType<typeof userEvent.setup>,
  fieldLabel: string,
  evidence: { sourceType?: string; sourceReference?: string; collectedAt?: string } = {},
  container: HTMLElement = document.body,
) {
  const group = within(
    await within(container).findByRole('group', { name: `Nguồn của ${fieldLabel}` }),
  )
  await user.selectOptions(group.getByLabelText('Loại nguồn'), evidence.sourceType ?? 'editorial')
  await user.type(
    group.getByLabelText('Tham chiếu nguồn'),
    evidence.sourceReference ?? 'Gọi chủ quán ngày 30/09',
  )
  fireEvent.change(group.getByLabelText('Thu thập lúc'), {
    target: { value: evidence.collectedAt ?? '2026-09-30T09:00' },
  })
  return group
}

/** True while the evidence boxes for a field are on screen. */
export function evidenceGroup(fieldLabel: string, container: HTMLElement = document.body) {
  return within(container).queryByRole('group', { name: `Nguồn của ${fieldLabel}` })
}

export { screen }
