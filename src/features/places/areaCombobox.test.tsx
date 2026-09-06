import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { cmsAreas } from '@/shared/test/fixtures'
import { AreaCombobox } from './areaCombobox'

const LABEL = 'Khu vực khám phá'

/** Controlled the way both real callers control it. */
function Harness({ initial = null }: { initial?: string | null }) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <>
      <AreaCombobox label={LABEL} value={value} onChange={setValue} />
      <output data-testid="stored">{value ?? '(null)'}</output>
    </>
  )
}

function open(initial: string | null = null) {
  signInAs('editor')
  return renderWithProviders(<Harness initial={initial} />)
}

function areasRespond(body: Record<string, unknown>, status = 200) {
  server.use(http.get('/v1/cms/areas', () => HttpResponse.json(body, { status })))
}

async function openPopup(user: ReturnType<typeof userEvent.setup>) {
  const input = await screen.findByRole('combobox', { name: LABEL })
  await user.click(input)
  return input
}

describe('area combobox (CMS-044)', () => {
  it('offers the catalog, with the count that says how big a bucket this is', async () => {
    const user = userEvent.setup()
    open()

    const input = await openPopup(user)
    expect(input).toHaveAttribute('aria-expanded', 'true')

    const listbox = await screen.findByRole('listbox')
    const active = cmsAreas.filter((area) => area.isActive)
    await waitFor(() => expect(within(listbox).getAllByRole('option').length).toBe(active.length))
    // 41 places is a live category; 1 is an editor inventing one.
    expect(within(listbox).getByText(/41 địa điểm/)).toBeInTheDocument()
    // Grouped by city so the city → area relationship is visible.
    expect(within(listbox).getByRole('group', { name: 'TP.HCM' })).toBeInTheDocument()
    expect(within(listbox).getByRole('group', { name: 'Hà Nội' })).toBeInTheDocument()
  })

  it('stores the stable key while searching the Vietnamese label', async () => {
    const user = userEvent.setup()
    open()

    const input = await openPopup(user)
    await user.type(input, 'quan 1')

    // The server does the accent-insensitive matching; "quan 1" finds "Quận 1".
    const option = await screen.findByRole('option', { name: /Quận 1/ })
    await user.click(option)

    expect(screen.getByTestId('stored')).toHaveTextContent('hcm_q1')
    // The box reads the human label, not the key it stored.
    expect(input).toHaveValue('Quận 1, TP.HCM')
  })

  it('is operable from the keyboard alone', async () => {
    const user = userEvent.setup()
    open()

    const input = await screen.findByRole('combobox', { name: LABEL })
    input.focus()
    // Waits for the first page so Down has something to move over.
    await screen.findByRole('option', { name: /Quận 1/ })

    await user.keyboard('{ArrowDown}')
    const first = screen.getAllByRole('option')[0]!
    expect(input).toHaveAttribute('aria-activedescendant', first.id)

    await user.keyboard('{End}')
    const last = screen.getAllByRole('option').at(-1)!
    expect(input).toHaveAttribute('aria-activedescendant', last.id)

    await user.keyboard('{Home}')
    expect(input).toHaveAttribute('aria-activedescendant', first.id)

    await user.keyboard('{ArrowDown}{Enter}')
    expect(screen.getByTestId('stored')).toHaveTextContent('hcm_q3')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes on Escape without choosing anything', async () => {
    const user = userEvent.setup()
    open()

    await openPopup(user)
    await screen.findByRole('option', { name: /Quận 1/ })
    await user.keyboard('{ArrowDown}{Escape}')

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(screen.getByTestId('stored')).toHaveTextContent('(null)')
  })

  it('says "loading" while the catalog is in flight', async () => {
    server.use(
      http.get('/v1/cms/areas', async () => {
        await delay('infinite')
        return HttpResponse.json({ items: [] })
      }),
    )
    const user = userEvent.setup()
    open()

    await openPopup(user)
    expect(await screen.findByText('Đang tải danh mục…')).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('tells an empty catalog apart from a failed call', async () => {
    areasRespond({ items: [] })
    const user = userEvent.setup()
    open()

    await openPopup(user)

    // "Danh mục rỗng" is a fact about the catalog…
    expect(await screen.findByText('Danh mục khu vực chưa có dòng nào.')).toBeInTheDocument()
    expect(screen.queryByText('Không tải được danh mục')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
  })

  it('offers a retry when the call failed, and recovers on it', async () => {
    let attempts = 0
    server.use(
      http.get('/v1/cms/areas', () => {
        attempts += 1
        if (attempts === 1) {
          return HttpResponse.json(
            {
              code: 'INTERNAL',
              message: 'boom',
              field_errors: [],
              request_id: 'req-areas',
              retryable: true,
            },
            { status: 500 },
          )
        }
        return HttpResponse.json({ items: cmsAreas.filter((area) => area.isActive) })
      }),
    )
    const user = userEvent.setup()
    open()

    await openPopup(user)

    // …and this one is a fact about the request. Different words, on purpose.
    expect(await screen.findByText('Không tải được danh mục')).toBeInTheDocument()
    expect(screen.queryByText('Danh mục khu vực chưa có dòng nào.')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByRole('option', { name: /Quận 1/ })).toBeInTheDocument()
    expect(screen.queryByText('Không tải được danh mục')).not.toBeInTheDocument()
  })

  it('names a 403 as a permission problem, with no retry to hammer', async () => {
    areasRespond(
      {
        code: 'FORBIDDEN',
        message: 'nope',
        field_errors: [],
        request_id: 'req-403',
        retryable: false,
      },
      403,
    )
    const user = userEvent.setup()
    open()

    await openPopup(user)

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument()
    expect(screen.queryByText('Không tải được danh mục')).not.toBeInTheDocument()
  })

  it('still shows a retired key the place already holds', async () => {
    const user = userEvent.setup()
    // `hcm_q10` is inactive: absent from the choices, present on the place.
    open('hcm_q10')

    const input = await screen.findByRole('combobox', { name: LABEL })
    await waitFor(() => expect(input).toHaveValue('Quận 10, TP.HCM · đã ngừng'))

    await user.click(input)
    const option = await screen.findByRole('option', { name: /Quận 10/ })
    expect(option).toHaveAttribute('aria-selected', 'true')
  })

  it('still shows a key the catalog has never heard of', async () => {
    const user = userEvent.setup()
    // `places.area_key` is not a foreign key, so this is a real row.
    open('hcm_phunhuan')

    const input = await screen.findByRole('combobox', { name: LABEL })
    // The key is the only label that exists; nothing is invented for it.
    await waitFor(() => expect(input).toHaveValue('hcm_phunhuan · ngoài danh mục'))

    await user.click(input)
    const option = await screen.findByRole('option', { name: /hcm_phunhuan/ })
    expect(within(option).getByText(/không có trong danh mục khu vực/)).toBeInTheDocument()
  })

  it('clears the value, which is what sends null to the server', async () => {
    const user = userEvent.setup()
    open('hcm_q3')

    await screen.findByRole('combobox', { name: LABEL })
    await user.click(screen.getByRole('button', { name: 'Xoá lựa chọn' }))

    expect(screen.getByTestId('stored')).toHaveTextContent('(null)')
  })
})
