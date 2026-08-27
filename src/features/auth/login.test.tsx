import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/shared/test/render'
import LoginScreen from './login.view'

describe('CMS sign-in', () => {
  it('asks for the TOTP code when the API answers MFA_REQUIRED', async () => {
    const user = userEvent.setup()
    renderWithProviders(<LoginScreen />)

    await user.type(screen.getByLabelText(/Email công việc/), 'ops@gogo.vn')
    await user.type(screen.getByLabelText(/Mật khẩu/), 'correct-horse-battery')
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/mã xác thực/i)
  })

  it('states that no token is kept in localStorage', () => {
    renderWithProviders(<LoginScreen />)
    expect(screen.getByText(/HttpOnly/)).toBeInTheDocument()
  })
})
