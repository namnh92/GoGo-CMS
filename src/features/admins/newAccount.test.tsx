import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import NewAccountScreen from './newAccount.view'

async function fillForm(
  user: ReturnType<typeof userEvent.setup>,
  overrides: Partial<{ name: string; email: string; password: string; role: string }> = {},
) {
  await user.type(screen.getByLabelText(/Tên hiển thị/), overrides.name ?? 'Vy Vo')
  await user.type(screen.getByLabelText(/Email công việc/), overrides.email ?? 'vy.vo@gogo.vn')
  await user.type(
    screen.getByLabelText(/Mật khẩu khởi tạo/),
    overrides.password ?? 'correct-horse-battery',
  )
  if (overrides.role) {
    await user.selectOptions(screen.getByLabelText(/^Vai/), overrides.role)
  }
}

describe('NewAccountScreen (CMS-020)', () => {
  it('offers only the four roles the server grants', async () => {
    signInAs('super_admin')
    renderWithProviders(<NewAccountScreen />)

    const select = await screen.findByLabelText(/^Vai/)
    const values = Array.from(select.querySelectorAll('option')).map((o) => o.getAttribute('value'))
    // The design showed seven. The contract enum has four, and the picker is
    // built from that enum so it cannot drift.
    expect(values).toEqual(['editor', 'moderator', 'ops_admin', 'super_admin'])
  })

  it('creates the account and never echoes the password back', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<NewAccountScreen />)

    await screen.findByLabelText(/Tên hiển thị/)
    await fillForm(user)
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))

    // Panel and toast both confirm it, so match all rather than assuming one.
    expect((await screen.findAllByText(/Đã tạo tài khoản cho Vy Vo/)).length).toBeGreaterThan(0)
    // The account list exists now (CMS-021), so the panel points at it.
    expect(screen.getByText(/xuất hiện trong danh sách tài khoản/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xem danh sách tài khoản' })).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('correct-horse-battery')
  })

  it('holds a short password at the form before it reaches the server', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<NewAccountScreen />)

    await screen.findByLabelText(/Tên hiển thị/)
    await fillForm(user, { password: 'short' })
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))

    expect(await screen.findByText('Mật khẩu phải từ 12 ký tự.')).toBeInTheDocument()
    expect(screen.queryByText(/Đã tạo tài khoản/)).not.toBeInTheDocument()
  })

  it("puts the server's field error on the field that caused it", async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<NewAccountScreen />)

    await screen.findByLabelText(/Tên hiển thị/)
    // Seeded as already taken, so the API answers 409 with a field error.
    await fillForm(user, { email: 'ops@gogo.vn' })
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }))

    expect(await screen.findByText('Email này đã có tài khoản.')).toBeInTheDocument()
  })

  it('renders permission-denied for a role that may not create accounts', async () => {
    signInAs('ops_admin')
    renderWithProviders(<NewAccountScreen />)

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Tên hiển thị/)).not.toBeInTheDocument()
  })

  it('cannot be submitted twice from one click', async () => {
    signInAs('super_admin')
    const user = userEvent.setup()
    renderWithProviders(<NewAccountScreen />)

    await screen.findByLabelText(/Tên hiển thị/)
    // A distinct email: the mock keeps created accounts for the file's lifetime,
    // exactly as the server would, so reusing one would answer 409 instead.
    await fillForm(user, { email: 'lan.tran@gogo.vn' })
    const submit = screen.getByRole('button', { name: 'Tạo tài khoản' })
    await user.click(submit)

    // `loading` disables the button, so a double-click cannot create twice, and
    // the form is replaced outright once the account exists.
    await waitFor(() =>
      expect(screen.getByText(/xuất hiện trong danh sách tài khoản/)).toBeInTheDocument(),
    )
    expect(screen.queryByRole('button', { name: 'Tạo tài khoản' })).not.toBeInTheDocument()
    expect(submit).not.toBeInTheDocument()
  })
})
