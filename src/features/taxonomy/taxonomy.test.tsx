import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import TaxonomyScreen from './taxonomy.view'

describe('TaxonomyScreen', () => {
  it('shows usage, which is what makes the never-delete rule checkable', async () => {
    signInAs('editor')
    renderWithProviders(<TaxonomyScreen />)

    expect(await screen.findByText('quiet_peaceful')).toBeInTheDocument()
    expect(screen.getByText('2.814')).toBeInTheDocument()
  })

  it('lists a switched-off key by default — this is where it gets switched back on', async () => {
    signInAs('editor')
    renderWithProviders(<TaxonomyScreen />)

    // Hiding it by default would make a deactivated key unreachable: the public
    // taxonomy endpoint never returns one.
    expect(await screen.findByText('chill_lounge')).toBeInTheDocument()
    expect(screen.getAllByText('Đang tắt').length).toBeGreaterThan(0)
  })

  it('filters down to active keys on request', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)

    await screen.findByText('chill_lounge')
    await user.selectOptions(screen.getByLabelText('Trạng thái'), 'active')
    await waitFor(() => expect(screen.queryByText('chill_lounge')).not.toBeInTheDocument())
    expect(screen.getByText('quiet_peaceful')).toBeInTheDocument()
  })

  it('confirms deactivating a key that places still reference', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)

    await screen.findByText('quiet_peaceful')
    await user.click(screen.getByRole('switch', { name: /quiet_peaceful/ }))

    // 2814 places use it; the dialog says so instead of applying on a click.
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent(/2\.814 địa điểm dùng/)
  })

  it('lets a moderator read the list without offering a write', async () => {
    // Reads are hierarchical (`@RequireRole('editor', 'ops_admin')` + rank), so
    // the screen opens; every control stays off because the write would 403.
    signInAs('moderator')
    renderWithProviders(<TaxonomyScreen />)

    expect(await screen.findByText('quiet_peaceful')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Thêm khoá phân loại' })).toBeDisabled()
  })

  /*
   * GoGo-CMS#267 (GoGo-BE#737): a label is one line of plain text, 1–80
   * characters after normalising. The form says so before sending, and a
   * refusal from the API names the rule instead of "Request validation failed".
   */
  describe('label rule', () => {
    const fillNew = async (user: ReturnType<typeof userEvent.setup>, labelVi: string) => {
      await user.type(await screen.findByLabelText(/^Khoá \(a–z/), 'new_key')
      await user.type(screen.getByLabelText('Nhãn (vi)'), labelVi)
    }

    it('refuses markup or an over-long label on the form, before sending', async () => {
      signInAs('editor')
      const user = userEvent.setup()
      renderWithProviders(<TaxonomyScreen />)
      for (const bad of ['<b>Lãng mạn</b>', 'a'.repeat(81)]) {
        await fillNew(user, bad)
        expect(screen.getByLabelText('Nhãn (vi)')).toHaveAttribute('aria-invalid', 'true')
        expect(screen.getByText(/tối đa 80 ký tự/)).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Thêm khoá phân loại' })).toBeDisabled()
        await user.clear(screen.getByLabelText(/^Khoá \(a–z/))
        await user.clear(screen.getByLabelText('Nhãn (vi)'))
      }
    })

    it('accepts an ordinary label', async () => {
      signInAs('editor')
      const user = userEvent.setup()
      renderWithProviders(<TaxonomyScreen />)
      await fillNew(user, 'Cà phê "đặc sản"')
      expect(screen.getByLabelText('Nhãn (vi)')).not.toHaveAttribute('aria-invalid')
      expect(screen.getByRole('button', { name: 'Thêm khoá phân loại' })).toBeEnabled()
    })

    it('names the rule when the API refuses a label', async () => {
      server.use(
        http.post('*/cms/taxonomies', () =>
          HttpResponse.json(
            {
              code: 'VALIDATION_FAILED',
              message: 'Request validation failed',
              field_errors: [{ field: 'labels.vi', code: 'custom', message: 'x' }],
              request_id: 'req-1',
              retryable: false,
            },
            { status: 400 },
          ),
        ),
      )
      signInAs('editor')
      const user = userEvent.setup()
      renderWithProviders(<TaxonomyScreen />)
      await fillNew(user, 'Lãng mạn')
      await user.click(screen.getByRole('button', { name: 'Thêm khoá phân loại' }))
      expect(await screen.findAllByText(/tối đa 80 ký tự/)).not.toHaveLength(0)
      expect(screen.queryByText('Request validation failed')).not.toBeInTheDocument()
    })
  })
})
