import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { server } from '@/shared/test/server'
import { configReadiness } from '@/shared/test/fixtures'
import ConfigReadinessScreen from './configReadiness.view'

const BASE = '*/v1'
const URL = `${BASE}/cms/ops/config-readiness`

function Routed() {
  return (
    <Routes>
      <Route path="/config-readiness" element={<ConfigReadinessScreen />} />
    </Routes>
  )
}

const render = () => renderWithProviders(<Routed />, { route: '/config-readiness' })

describe('environment config readiness (GoGo-CMS#264)', () => {
  it('is closed to a role below ops_admin and never asks the API', async () => {
    const calls = { n: 0 }
    server.use(
      http.get(URL, () => {
        calls.n += 1
        return HttpResponse.json(configReadiness)
      }),
    )
    signInAs('moderator')
    render()
    expect(screen.getByText(/ops_admin/)).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.n).toBe(0)
  })

  it('renders a 403 as permission-denied and does not retry it', async () => {
    const calls = { n: 0 }
    server.use(
      http.get(URL, () => {
        calls.n += 1
        return HttpResponse.json(
          {
            code: 'FORBIDDEN',
            message: 'no',
            field_errors: [],
            request_id: 'r1',
            retryable: false,
          },
          { status: 403 },
        )
      }),
    )
    signInAs('ops_admin')
    render()
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.n).toBe(1)
  })

  it('shows a loading state before the snapshot arrives', () => {
    signInAs('ops_admin')
    render()
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
  })

  it('shows the capability with its verdict, counts and the snapshot label', async () => {
    signInAs('ops_admin')
    render()
    const row = (await screen.findByRole('rowheader', { name: 'places-google' })).closest('tr')!
    expect(within(row).getByText('Đang bật')).toBeInTheDocument()
    // SSM: the verdict and the rows that block it; process: absence.
    expect(within(row).getByText('Chưa sẵn sàng')).toBeInTheDocument()
    expect(within(row).getByText('1 dòng chặn')).toBeInTheDocument()
    expect(within(row).getByText('1/2')).toBeInTheDocument()
    expect(within(row).getByText('Thiếu')).toBeInTheDocument()
    expect(within(row).getByText('1 thiếu')).toBeInTheDocument()
    expect(screen.getByText('Môi trường dev')).toBeInTheDocument()
    expect(screen.getByText('abc1234-998-1')).toBeInTheDocument()
    expect(screen.getByText(/không phải trạng thái trực tiếp/)).toBeInTheDocument()
    // Matching deploy ids: no mismatch banner.
    expect(screen.queryByText(/deploy_id khác nhau/)).not.toBeInTheDocument()
  })

  it('does not call a stored key that fails validation missing', async () => {
    // ssm_missing is the rows that keep the capability from OK — a wrong type
    // or tag on a stored key counts — not only the absent ones.
    server.use(
      http.get(URL, () =>
        HttpResponse.json({
          ...configReadiness,
          capabilities: [
            {
              ...configReadiness.capabilities[0]!,
              ssm_verdict: 'FAIL',
              ssm_missing: ['/gogo/dev/api/maps-server-key'],
              ssm_present: { present: 2, total: 2 },
              process_ready: true,
              process_missing: [],
            },
          ],
        }),
      ),
    )
    signInAs('ops_admin')
    render()
    const row = (await screen.findByRole('rowheader', { name: 'places-google' })).closest('tr')!
    expect(within(row).getByText('2/2')).toBeInTheDocument()
    expect(within(row).getByText('Chưa sẵn sàng')).toBeInTheDocument()
    expect(within(row).getByText('1 dòng chặn')).toBeInTheDocument()
    expect(within(row).queryByText(/thiếu/i)).not.toBeInTheDocument()
  })

  it('expands a capability into row chips with text, unknown findings by code', async () => {
    signInAs('ops_admin')
    render()
    const row = (await screen.findByRole('rowheader', { name: 'places-google' })).closest('tr')!
    const toggle = within(row).getByRole('button', { name: 'Xem 2 dòng' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    const detail = screen.getByRole('table', { name: 'Các khoá của tính năng' })
    const google = within(detail).getByText('GOOGLE_PLACES_API_KEY').closest('tr')!
    expect(within(google).getByText('Không có trong SSM')).toBeInTheDocument()
    expect(within(google).getByText('Đã khai báo, chưa lưu')).toBeInTheDocument()
    expect(within(google).getByText('Tiến trình không có')).toBeInTheDocument()

    const maps = within(detail).getByText('MAPS_SERVER_KEY').closest('tr')!
    expect(within(maps).getByText('Có trong SSM')).toBeInTheDocument()
    expect(within(maps).getByText('Thiếu tag infra-readable')).toBeInTheDocument()
    expect(within(maps).getByText('future-class')).toBeInTheDocument()
    expect(within(maps).getByText('Biến máy chủ')).toBeInTheDocument()
  })

  it('puts rows with no capability under shared infrastructure', async () => {
    signInAs('ops_admin')
    render()
    const row = (await screen.findByRole('rowheader', { name: 'Hạ tầng chung' })).closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: 'Xem 1 dòng' }))
    expect(screen.getByText('/gogo/dev/api/database-url')).toBeInTheDocument()
  })

  it('warns when the snapshot is not the running deploy', async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.json({
          ...configReadiness,
          infra: { ...configReadiness.infra!, process_deploy_id: 'other', deploy_match: false },
        }),
      ),
    )
    signInAs('super_admin')
    render()
    expect(await screen.findByText(/deploy_id khác nhau/)).toBeInTheDocument()
  })

  it('says why there is no snapshot and still lists the process variables', async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.json({ ...configReadiness, infra: null, reason: 'missing', capabilities: [] }),
      ),
    )
    signInAs('ops_admin')
    render()
    expect(await screen.findByText('Chưa có ảnh chụp SSM')).toBeInTheDocument()
    expect(screen.getByText(/chưa được deploy kèm readiness/)).toBeInTheDocument()
    const card = screen
      .getByRole('heading', { name: 'Biến của tiến trình API' })
      .closest('section')!
    expect(within(card).getByText('2/3')).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Xem 3 dòng' }))
    const absent = within(card).getByText('GOOGLE_PLACES_API_KEY').closest('tr')!
    expect(within(absent).getByText('Tiến trình không có')).toBeInTheDocument()
    expect(within(absent).getByText('Tuỳ chọn')).toBeInTheDocument()
    const cookie = within(card).getByText('COOKIE_SECURE').closest('tr')!
    expect(within(cookie).getByText('Tuỳ điều kiện')).toBeInTheDocument()
  })

  it('shows an error with a retry for a failure that is not a 403', async () => {
    server.use(
      http.get(URL, () =>
        HttpResponse.json(
          {
            code: 'INTERNAL',
            message: 'boom',
            field_errors: [],
            request_id: 'r2',
            retryable: true,
          },
          { status: 500 },
        ),
      ),
    )
    signInAs('ops_admin')
    render()
    expect(
      await screen.findByRole('button', { name: /Thử lại/ }, { timeout: 5000 }),
    ).toBeInTheDocument()
  })

  it('offers no control but the expand toggles', async () => {
    // Keys are written with put.sh by the owner; a button here would do nothing.
    signInAs('ops_admin')
    render()
    await screen.findByRole('rowheader', { name: 'places-google' })
    const buttons = screen.getAllByRole('button').filter((b) => !b.closest('header'))
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) expect(button).toHaveAttribute('aria-expanded')
  })

  it('never puts anything but names on the page', async () => {
    signInAs('ops_admin')
    render()
    await screen.findByRole('rowheader', { name: 'places-google' })
    for (const row of screen
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('aria-expanded'))) {
      if (row.getAttribute('aria-expanded') === 'false') await userEvent.click(row)
    }
    // The response has no value field to leak; this pins that the page does
    // not invent one (a length, a prefix) from what it has either.
    expect(document.body.textContent).not.toMatch(/\*{3}|value|giá trị:/i)
  })

  it('gives each process card its own controlled region, in English too', async () => {
    // Both English titles are 21 characters; an id derived from the title
    // collided and left aria-controls pointing at two panels.
    window.localStorage.setItem('gogo.cms.locale', 'en')
    try {
      signInAs('ops_admin')
      render()
      const process = (
        await screen.findByRole('heading', { name: 'API process variables' })
      ).closest('section')!
      const dynamic = screen
        .getByRole('heading', { name: 'Export keys (dynamic)' })
        .closest('section')!
      const a = within(process).getByRole('button', { name: 'Show 3 rows' })
      const b = within(dynamic).getByRole('button', { name: 'Show 1 rows' })
      await userEvent.click(a)
      await userEvent.click(b)
      const idA = a.getAttribute('aria-controls')!
      const idB = b.getAttribute('aria-controls')!
      expect(idA).not.toBe(idB)
      expect(document.querySelectorAll(`[id="${idA}"]`)).toHaveLength(1)
      expect(document.querySelectorAll(`[id="${idB}"]`)).toHaveLength(1)
      expect(process.querySelector(`[id="${idA}"]`)).not.toBeNull()
      expect(dynamic.querySelector(`[id="${idB}"]`)).not.toBeNull()
    } finally {
      window.localStorage.removeItem('gogo.cms.locale')
    }
  })
})
