import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { cmsSafetyRules } from '@/shared/test/fixtures'
import SafetyRuleListScreen from './safetyRuleList.view'
import SafetyRuleDetailScreen from './safetyRuleDetail.view'
import { parseConditions, toDraft } from './conditions'

const active = cmsSafetyRules.filter((rule) => rule.status === 'active').length
/** The fixture that leaves an optional condition unset. */
const spamRule = cmsSafetyRules.find((rule) => rule.id === 'sr-spam-links')!

function Routed() {
  return (
    <Routes>
      <Route path="/safety-rules" element={<SafetyRuleListScreen />} />
      <Route path="/safety-rules/:id" element={<SafetyRuleDetailScreen />} />
    </Routes>
  )
}

describe('safety rule list (CMS-028)', () => {
  it('shows the filtered total, not the page length', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: '/safety-rules' })

    await screen.findByRole('table')
    expect(
      screen.getByText(
        `Trang này ${cmsSafetyRules.length} · tổng ${cmsSafetyRules.length} khớp bộ lọc`,
      ),
    ).toBeInTheDocument()
  })

  it('pushes the status filter to the server', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/safety-rules' })

    await screen.findByRole('table')
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'active')
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`tổng ${active} khớp bộ lọc`))).toBeInTheDocument(),
    )
  })

  it('hides the whole resource from a moderator — reads do not climb here', async () => {
    signInAs('moderator')
    renderWithProviders(<Routed />, { route: '/safety-rules' })

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('offers only the actions the chosen rule type may take', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/safety-rules' })

    await user.click(await screen.findByRole('button', { name: 'Tạo luật' }))
    const drawer = await screen.findByRole('dialog')

    // A rate-limit rule can only block the action; it cannot suspend anyone.
    await user.selectOptions(within(drawer).getByLabelText(/Loại luật/), 'rate_limit')
    const actions = within(drawer).getByLabelText(/^Hành động/) as HTMLSelectElement
    expect(Array.from(actions.options).map((option) => option.value)).toEqual(['block_action'])

    // Its condition fields replace the blocked-words ones entirely.
    expect(within(drawer).getByLabelText(/Số lần tối đa/)).toBeInTheDocument()
    expect(within(drawer).queryByLabelText(/Danh sách từ khoá/)).not.toBeInTheDocument()
  })

  it('refuses automatic suspension below high severity before sending it', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/safety-rules' })

    await user.click(await screen.findByRole('button', { name: 'Tạo luật' }))
    const drawer = await screen.findByRole('dialog')
    await user.selectOptions(within(drawer).getByLabelText(/Loại luật/), 'user_abuse')
    await user.type(within(drawer).getByLabelText(/Tên luật/), 'Khoá tài khoản bị báo cáo')
    await user.type(within(drawer).getByLabelText(/Reason code/), 'repeat_reports_suspend')
    await user.selectOptions(within(drawer).getByLabelText(/^Hành động/), 'suspend_user')
    await user.selectOptions(within(drawer).getByLabelText(/Mức độ/), 'low')
    await user.type(within(drawer).getByLabelText(/Số báo cáo tối đa nhắm vào một người/), '5')
    await user.click(within(drawer).getByRole('button', { name: 'Tạo' }))

    expect(await within(drawer).findByText(/mức độ Cao hoặc Nghiêm trọng/)).toBeInTheDocument()
  })

  it('refuses a reason code the server pattern would reject', async () => {
    signInAs('ops_admin')
    const user = userEvent.setup()
    renderWithProviders(<Routed />, { route: '/safety-rules' })

    await user.click(await screen.findByRole('button', { name: 'Tạo luật' }))
    const drawer = await screen.findByRole('dialog')
    await user.type(within(drawer).getByLabelText(/Tên luật/), 'Chặn từ ngữ mới')
    await user.type(within(drawer).getByLabelText(/Reason code/), 'Không Hợp Lệ!')
    await user.type(within(drawer).getByLabelText(/Danh sách từ khoá/), 'từ xấu')
    await user.click(within(drawer).getByRole('button', { name: 'Tạo' }))

    expect(await within(drawer).findByText(/Reason code phải khớp/)).toBeInTheDocument()
  })
})

describe('safety rule detail (CMS-028)', () => {
  it('shows the rule type as immutable', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/safety-rules/${spamRule.id}` })

    const ruleType = (await screen.findByLabelText(/Loại luật/)) as HTMLInputElement
    expect(ruleType).toBeDisabled()
    expect(ruleType.value).toBe('Spam')
  })

  it('leaves an unset optional condition empty rather than showing the default', async () => {
    signInAs('ops_admin')
    renderWithProviders(<Routed />, { route: `/safety-rules/${spamRule.id}` })

    // The fixture stores no `minAccountAgeHours`; showing the server default
    // there would make "not configured" indistinguishable from "configured to
    // the same number".
    const field = (await screen.findByLabelText(/Tuổi tài khoản tối thiểu/)) as HTMLInputElement
    expect(field.value).toBe('')
    expect((await screen.findByLabelText(/Số link tối đa/)) as HTMLInputElement).toHaveValue('3')
  })

  it('does not offer a rule edit to a role that cannot manage safety', async () => {
    signInAs('editor')
    renderWithProviders(<Routed />, { route: `/safety-rules/${spamRule.id}` })

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
  })
})

describe('condition parsing', () => {
  it('omits an untouched optional field instead of sending a zero', () => {
    const draft = toDraft('spam', { maxLinks: 3 })
    const parsed = parseConditions('spam', draft)

    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.conditions).toEqual({ maxLinks: 3 })
    expect('minAccountAgeHours' in parsed.conditions).toBe(false)
    expect('windowHours' in parsed.conditions).toBe(false)
  })

  it('refuses a spam rule that counts neither links nor duplicates', () => {
    const parsed = parseConditions('spam', toDraft('spam', {}))

    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors.map((error) => error.code)).toContain('spamNeedsOne')
  })

  it('holds every field to the bound the server states', () => {
    const parsed = parseConditions('rate_limit', {
      action: 'checkin_create',
      limit: '0',
      windowSeconds: '3600',
    })

    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.errors).toEqual([{ field: 'limit', code: 'range' }])
  })

  it('keeps a stored boolean distinct from an unset one', () => {
    // `distinctReporters` defaults to true, so a rule that stores `false` must
    // survive the round-trip rather than being re-defaulted on read.
    const draft = toDraft('repeated_reports', { minReports: 3, distinctReporters: false })
    expect(draft.distinctReporters).toBe(false)

    const parsed = parseConditions('repeated_reports', draft)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.conditions.distinctReporters).toBe(false)
  })
})
