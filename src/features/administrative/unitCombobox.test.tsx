import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { AdministrativeUnitCombobox } from './unitCombobox'

/**
 * ADM-105 — the unit pickers, and the request they used to get wrong.
 *
 * `fetchCommunes` sent `limit=500` at an API whose maximum is 200. DEV answered
 * 400 and the reviewer's Phường/Xã box was empty — which reads as "this
 * province has no communes", a far more believable lie than "the request was
 * malformed". Nothing caught it because the fixture was more permissive than
 * the server.
 *
 * So these tests assert against `total` and `nextCursor` from the response
 * rather than against a count written here. Vietnam had 63 provinces and now
 * has 34; a test that knows the number is a test that will be wrong.
 */

const PROVINCE_LABEL = 'Tỉnh / thành'
const COMMUNE_LABEL = 'Phường / xã'

function Harness({
  level,
  provinceCode,
}: {
  level: 'PROVINCE' | 'COMMUNE'
  provinceCode?: string | null
}) {
  const [value, setValue] = useState<string | null>(null)
  return (
    <>
      <AdministrativeUnitCombobox
        level={level}
        {...(provinceCode === undefined ? {} : { provinceCode })}
        label={level === 'PROVINCE' ? PROVINCE_LABEL : COMMUNE_LABEL}
        value={value}
        onChange={setValue}
      />
      <output data-testid="stored">{value ?? '(null)'}</output>
    </>
  )
}

function open(level: 'PROVINCE' | 'COMMUNE', provinceCode?: string | null) {
  signInAs('editor')
  return renderWithProviders(<Harness level={level} provinceCode={provinceCode} />)
}

/** Records every unit request the component makes, and answers nothing itself. */
function watchUnitRequests(): string[] {
  const urls: string[] = []
  server.use(
    http.get('*/v1/administrative/provinces', ({ request }) => {
      urls.push(request.url)
      return undefined
    }),
    http.get('*/v1/administrative/provinces/:code/communes', ({ request }) => {
      urls.push(request.url)
      return undefined
    }),
    http.get('*/v1/administrative/search', ({ request }) => {
      urls.push(request.url)
      return undefined
    }),
  )
  return urls
}

/**
 * A list bigger than one page, served the way the real endpoint serves it: the
 * cursor is the last code returned, and `total` is the whole set.
 */
function pagedUnits(
  path: string,
  count: number,
  level: 'PROVINCE' | 'COMMUNE',
  parentCode: string | null,
) {
  const all = Array.from({ length: count }, (_, index) => {
    const code = String(index + 1).padStart(5, '0')
    return {
      code,
      name: `Đơn vị ${code}`,
      fullName: `Phường Đơn vị ${code}`,
      nameEn: null,
      codeName: null,
      unitType: level === 'PROVINCE' ? 'MUNICIPALITY' : 'WARD',
      level,
      parentCode,
      status: 'ACTIVE',
      effectiveFrom: '2025-07-01',
      effectiveTo: null,
      isCurrent: true,
    }
  })
  server.use(
    http.get(path, ({ request }) => {
      const url = new URL(request.url)
      const limit = Number(url.searchParams.get('limit') ?? '50')
      if (limit > 200) {
        return HttpResponse.json(
          { code: 'VALIDATION_FAILED', message: 'limit must be at most 200' },
          { status: 400 },
        )
      }
      const cursor = url.searchParams.get('cursor')
      const after = cursor ? atob(cursor) : null
      const start = after ? all.findIndex((u) => u.code > after) : 0
      const page = all.slice(start, start + limit)
      const more = start + page.length < all.length
      return HttpResponse.json({
        items: page,
        nextCursor: more ? btoa(page.at(-1)!.code) : null,
        total: all.length,
        datasetVersion: 'v5.0.0+test',
      })
    }),
  )
  return all.length
}

describe('the administrative unit picker', () => {
  it('never asks for more than the API allows', async () => {
    const urls = watchUnitRequests()
    open('PROVINCE')
    await waitFor(() => expect(urls.length).toBeGreaterThan(0))
    for (const url of urls) {
      const limit = Number(new URL(url).searchParams.get('limit'))
      expect(limit).toBeLessThanOrEqual(200)
    }
  })

  it('reaches every province through real pagination', async () => {
    // Deliberately more than one page, and deliberately not a number Vietnam
    // has: the component must not depend on the count fitting.
    const total = pagedUnits('*/v1/administrative/provinces', 250, 'PROVINCE', null)
    open('PROVINCE')

    const input = await screen.findByRole('combobox', { name: PROVINCE_LABEL })
    await userEvent.click(input)
    const listbox = await screen.findByRole('listbox')
    // Asserted against what the server said it had, not against a constant.
    await waitFor(() => expect(within(listbox).getAllByRole('option')).toHaveLength(total))
    // The last page's units are there, which is the half that used to be lost.
    expect(within(listbox).getByRole('option', { name: /00250/ })).toBeInTheDocument()
  })

  it('does not truncate a province with more communes than one page', async () => {
    const total = pagedUnits('*/v1/administrative/provinces/:code/communes', 420, 'COMMUNE', '01')
    open('COMMUNE', '01')

    const input = await screen.findByRole('combobox', { name: COMMUNE_LABEL })
    await userEvent.click(input)
    const listbox = await screen.findByRole('listbox')
    await waitFor(() => expect(within(listbox).getAllByRole('option')).toHaveLength(total))
  })

  it('loads the chosen province’s communes and stores the code, not the label', async () => {
    open('COMMUNE', '01')
    const input = await screen.findByRole('combobox', { name: COMMUNE_LABEL })
    await userEvent.click(input)

    await userEvent.click(await screen.findByRole('option', { name: /Ba Đình/ }))
    expect(screen.getByTestId('stored')).toHaveTextContent('00163')
    expect(input).toHaveValue('Phường Ba Đình')
  })

  it('offers nothing, and asks for nothing, until a province is chosen', async () => {
    const urls = watchUnitRequests()
    open('COMMUNE', null)
    const input = await screen.findByRole('combobox', { name: COMMUNE_LABEL })
    expect(input).toBeDisabled()
    expect(screen.getByText(/Chọn tỉnh \/ thành phố trước/)).toBeInTheDocument()
    expect(urls).toEqual([])
  })

  it('searches on the server, narrowed to the chosen province', async () => {
    const urls = watchUnitRequests()
    open('COMMUNE', '01')
    const input = await screen.findByRole('combobox', { name: COMMUNE_LABEL })
    await userEvent.click(input)
    await userEvent.type(input, 'ngoc ha')

    await waitFor(() => expect(urls.some((u) => u.includes('/administrative/search'))).toBe(true))
    const search = new URL(urls.find((u) => u.includes('/administrative/search'))!)
    expect(search.searchParams.get('query')).toBe('ngoc ha')
    // A commune search is a search inside one province; without this the box
    // would offer wards from every province in the country.
    expect(search.searchParams.get('provinceCode')).toBe('01')

    // The server does the Vietnamese folding, so unaccented input matches.
    await userEvent.click(await screen.findByRole('option', { name: /Ngọc Hà/ }))
    expect(screen.getByTestId('stored')).toHaveTextContent('00166')
  })

  it('never offers a unit from the other level, even when the search returns one', async () => {
    open('COMMUNE', '01')
    const input = await screen.findByRole('combobox', { name: COMMUNE_LABEL })
    await userEvent.click(input)
    // "Hà" matches the province "Thành phố Hà Nội" as well as two wards.
    await userEvent.type(input, 'ha noi')

    const listbox = await screen.findByRole('listbox')
    await waitFor(() =>
      expect(
        within(listbox).queryByRole('option', { name: /Thành phố Hà Nội/ }),
      ).not.toBeInTheDocument(),
    )
  })

  it('says the fetch failed rather than showing an empty list', async () => {
    // The defect this task exists for: a 400 rendered as "no communes here".
    server.use(
      http.get('*/v1/administrative/provinces/:code/communes', () =>
        HttpResponse.json(
          { code: 'VALIDATION_FAILED', message: 'limit must be at most 200' },
          { status: 400 },
        ),
      ),
    )
    open('COMMUNE', '01')
    const input = await screen.findByRole('combobox', { name: COMMUNE_LABEL })
    await userEvent.click(input)

    // The failure is named, and offers the one action that can help. An empty
    // list here would be the component telling the editor a falsehood.
    expect(await screen.findByText(/Không tải được danh mục/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thử lại/ })).toBeInTheDocument()
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })
})
