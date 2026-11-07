import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { formatDateTime } from '@/shared/format'
import TaxonomyScreen from './taxonomy.view'
import { taxonomyListSchema } from '@/shared/api/contracts'
import { taxonomies } from '@/shared/test/fixtures'

const amenity = {
  ...taxonomies[0]!,
  id: 'amenity-fixture',
  kind: 'amenity',
  key: 'wifi',
  labels: { vi: 'Wi-Fi', en: 'Wi-Fi' },
  isActive: false,
}

describe('amenity taxonomy contract (CMS#273)', () => {
  it('parses the entire mixed list, including an inactive amenity', () => {
    const parsed = taxonomyListSchema.parse([...taxonomies, amenity])
    expect(parsed).toHaveLength(taxonomies.length + 1)
    expect(parsed.at(-1)).toMatchObject({ kind: 'amenity', isActive: false })
  })

  it.each([
    ['vi', 'Tiện ích', 'Nhóm'],
    ['en', 'Amenities', 'Group'],
  ])('renders the %s amenity selector and its rows', async (locale, label, groupLabel) => {
    window.localStorage.setItem('gogo.cms.locale', locale)
    server.use(http.get('*/cms/taxonomies', () => HttpResponse.json([...taxonomies, amenity])))
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)

    expect(await screen.findByText('quiet_peaceful')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText(groupLabel), 'amenity')
    expect(await screen.findByText('wifi')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: label })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: new RegExp(label) })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })
})

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
    expect(
      screen
        .getAllByRole('button', { name: 'Sửa' })
        .every((button) => button.hasAttribute('disabled')),
    ).toBe(true)
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

describe('taxonomy generation (CMS#285)', () => {
  const initial = { version: 41, updatedAt: '2026-11-06T10:00:00.000Z' }
  const changed = { version: 49, updatedAt: '2026-11-07T11:30:00.000Z' }

  it.each([
    ['vi', 'Phiên bản phân loại', 'Thay đổi lần cuối'],
    ['en', 'Taxonomy version', 'Last changed'],
  ])('shows server version and last changed time in %s', async (locale, version, lastChanged) => {
    window.localStorage.setItem('gogo.cms.locale', locale)
    server.use(http.get('*/cms/taxonomies/version', () => HttpResponse.json(initial)))
    signInAs('editor')
    renderWithProviders(<TaxonomyScreen />)
    expect(await screen.findByText('41')).toBeInTheDocument()
    expect(screen.getAllByText(version).length).toBeGreaterThan(0)
    expect(screen.getByText(lastChanged)).toBeInTheDocument()
    expect(document.querySelector('time')).toHaveAttribute('datetime', initial.updatedAt)
    expect(document.querySelector('time')).toHaveTextContent(
      formatDateTime(initial.updatedAt, locale as 'vi' | 'en'),
    )
  })

  it('shows loading, then an independent version error and retry', async () => {
    let release!: () => void
    server.use(
      http.get('*/cms/taxonomies/version', async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return new HttpResponse(null, { status: 503 })
      }),
    )
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)
    await screen.findByText('quiet_peaceful')
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải')
    release()
    const retry = await screen.findByRole('button', { name: 'Thử lại' })
    expect(screen.getByText('quiet_peaceful')).toBeInTheDocument()
    server.use(http.get('*/cms/taxonomies/version', () => HttpResponse.json(initial)))
    await user.click(retry)
    expect(await screen.findByText('41')).toBeInTheDocument()
  })

  it.each(['create', 'label', 'order', 'enable', 'disable', 'synonym'] as const)(
    'uses the %s write response without relying on a version refetch',
    async (operation) => {
      let reads = 0
      server.use(
        http.get('*/cms/taxonomies/version', () => {
          reads++
          return HttpResponse.json(initial)
        }),
      )
      const writes: unknown[] = []
      const respond = async ({ request }: { request: Request }) => {
        writes.push(await request.json())
        return HttpResponse.json(changed)
      }
      server.use(
        http.post('*/cms/taxonomies', respond),
        http.patch('*/cms/taxonomies/:id', respond),
        http.post('*/cms/taxonomies/:id/synonyms', respond),
      )
      signInAs('editor')
      const user = userEvent.setup()
      renderWithProviders(<TaxonomyScreen />)
      await screen.findByText('41')
      await screen.findByText('quiet_peaceful')
      if (operation === 'create') {
        await user.type(screen.getByLabelText(/^Khoá \(a–z/), 'new_key')
        await user.type(screen.getByLabelText('Nhãn (vi)'), 'Mới')
        await user.click(screen.getByRole('button', { name: 'Thêm khoá phân loại' }))
        expect(writes[0]).toMatchObject({ key: 'new_key', labels: { vi: 'Mới' } })
      } else if (operation === 'label' || operation === 'order') {
        await user.click(
          within(screen.getByText('quiet_peaceful').closest('tr')!).getByRole('button', {
            name: 'Sửa',
          }),
        )
        const dialog = within(screen.getByRole('dialog'))
        const field = dialog.getByLabelText(operation === 'label' ? 'Nhãn (vi)' : 'Thứ tự')
        await user.clear(field)
        await user.type(field, operation === 'label' ? 'Yên tĩnh mới' : '7')
        await user.click(dialog.getByRole('button', { name: 'Lưu' }))
        expect(writes[0]).toMatchObject(
          operation === 'label' ? { labels: { vi: 'Yên tĩnh mới' } } : { sortOrder: 7 },
        )
      } else if (operation === 'enable' || operation === 'disable') {
        await user.click(
          screen.getByRole('switch', {
            name: operation === 'enable' ? /chill_lounge/ : /quiet_peaceful/,
          }),
        )
        if (operation === 'disable')
          await user.click(
            within(screen.getByRole('dialog')).getByRole('button', { name: 'Xác nhận' }),
          )
        expect(writes[0]).toMatchObject({ isActive: operation === 'enable' })
      } else {
        await user.click(
          within(screen.getByText('quiet_peaceful').closest('tr')!).getByRole('button', {
            name: 'Thêm từ đồng nghĩa',
          }),
        )
        await user.type(screen.getByLabelText('Từ khoá'), 'thư giãn')
        await user.click(screen.getAllByRole('button', { name: 'Thêm từ đồng nghĩa' }).at(-1)!)
        expect(writes[0]).toMatchObject({ term: 'thư giãn', locale: 'vi' })
      }
      expect(await screen.findByText('49')).toBeInTheDocument()
      expect(document.querySelector('time')).toHaveAttribute('datetime', changed.updatedAt)
      expect(reads).toBe(1)
    },
  )

  it('does not regress when an older write response arrives after a newer one', async () => {
    let release!: () => void
    server.use(
      http.get('*/cms/taxonomies/version', () => HttpResponse.json(initial)),
      http.post('*/cms/taxonomies', async () => {
        await new Promise<void>((resolve) => {
          release = resolve
        })
        return HttpResponse.json({ ...changed, version: 48 })
      }),
      http.patch('*/cms/taxonomies/:id', () => HttpResponse.json(changed)),
    )
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)
    await screen.findByText('41')
    await user.type(screen.getByLabelText(/^Khoá \(a–z/), 'new_key')
    await user.type(screen.getByLabelText('Nhãn (vi)'), 'Mới')
    await user.click(screen.getByRole('button', { name: 'Thêm khoá phân loại' }))
    await waitFor(() => expect(release).toBeTypeOf('function'))
    await user.click(screen.getByRole('switch', { name: /chill_lounge/ }))
    expect(await screen.findByText('49')).toBeInTheDocument()
    release()
    await waitFor(() => expect(screen.getByLabelText(/^Khoá \(a–z/)).toHaveValue(''))
    expect(screen.getByText('49')).toBeInTheDocument()
    expect(document.querySelector('time')).toHaveAttribute('datetime', changed.updatedAt)
  })

  it('does not silently discard an emptied English label in the edit dialog', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)
    await user.click(
      within((await screen.findByText('quiet_peaceful')).closest('tr')!).getByRole('button', {
        name: 'Sửa',
      }),
    )
    const dialog = within(screen.getByRole('dialog'))
    await user.clear(dialog.getByLabelText('Nhãn (en)'))
    expect(dialog.getByLabelText('Nhãn (en)')).toHaveAttribute('aria-invalid', 'true')
    expect(dialog.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('keeps the confirmed generation when a write fails', async () => {
    server.use(
      http.get('*/cms/taxonomies/version', () => HttpResponse.json(initial)),
      http.patch('*/cms/taxonomies/:id', () => new HttpResponse(null, { status: 503 })),
    )
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<TaxonomyScreen />)
    await screen.findByText('41')
    await user.click(await screen.findByRole('switch', { name: /chill_lounge/ }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
    expect(document.querySelector('time')).toHaveAttribute('datetime', initial.updatedAt)
  })
})
