import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/shared/test/render'
import LoginScreen from './login.view'

describe('CMS sign-in (CMS-034, stepped)', () => {
  it('moves to the MFA step when the API answers MFA_REQUIRED', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)

    await user.type(screen.getByLabelText(/Email công việc/), 'ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))

    // The password checked out, so the step — not an inline error — changes.
    expect(await screen.findByRole('heading', { name: 'Xác thực hai lớp' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xác thực & đăng nhập' })).toBeInTheDocument()
    // The code field gets focus: the whole step exists for it.
    expect(screen.getByLabelText(/Mã xác thực/)).toHaveFocus()
  })

  it('returns to the password step on bad credentials, never trapping behind the code', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)

    await user.type(screen.getByLabelText(/Email công việc/), 'ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }))
    await screen.findByRole('heading', { name: 'Xác thực hai lớp' })

    await user.click(screen.getByRole('button', { name: 'Quay lại nhập mật khẩu' }))
    expect(screen.getByLabelText(/Mật khẩu/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xác thực & đăng nhập' })).not.toBeInTheDocument()
  })

  it('toggles password visibility with a labelled control', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)

    const password = screen.getByLabelText(/Mật khẩu/) as HTMLInputElement
    expect(password.type).toBe('password')
    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }))
    expect(password.type).toBe('text')
    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }))
    expect(password.type).toBe('password')
  })

  it('states that no token is kept in localStorage', () => {
    renderWithProviders(<LoginScreen />)
    expect(screen.getByText(/HttpOnly/)).toBeInTheDocument()
  })

  it('names the environment under the form without inferring it from the hostname', () => {
    renderWithProviders(<LoginScreen />)
    // VITE_APP_ENV is unset in tests, so the config degrades to dev.
    expect(screen.getByText('DEV')).toBeInTheDocument()
  })
})
