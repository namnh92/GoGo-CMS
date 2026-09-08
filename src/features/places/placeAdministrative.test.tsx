import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { places } from '@/shared/test/fixtures'
import PlaceEditorScreen from './placeEditor.view'
import PlaceCreateScreen from './placeCreate.view'

/**
 * ADM-106 — the place forms speak the two administrative levels that exist.
 *
 * Vietnam's district tier was dissolved on 2025-07-01. The console offered a
 * free-text "Quận/Huyện" box anyway, which asked an editor to fill in a unit
 * that is gone, and a free-text "Tỉnh/Thành phố" box that could not express the
 * identity anything downstream needs — so every place created by hand was
 * `UNMAPPED` and could not be published, with nothing on screen to say why.
 */

const PLACE = places.find((place) => place.id === 'pl-chao-ban')!

function Routed() {
  return (
    <Routes>
      <Route path="/places/:id" element={<PlaceEditorScreen />} />
    </Routes>
  )
}

function openEditor() {
  signInAs('editor')
  return renderWithProviders(<Routed />, { route: `/places/${PLACE.id}` })
}

function openCreate() {
  signInAs('editor')
  return renderWithProviders(<PlaceCreateScreen />, { route: '/places/new' })
}

/** A PATCH that records the body and answers with the unchanged record. */
function captureSave() {
  const sent: Record<string, unknown>[] = []
  server.use(
    http.patch('/v1/cms/places/:id', async ({ request }) => {
      sent.push((await request.json()) as Record<string, unknown>)
      return HttpResponse.json(PLACE)
    }),
  )
  return sent
}

async function pick(name: RegExp, optionName: RegExp) {
  const input = await screen.findByRole('combobox', { name })
  await userEvent.click(input)
  await userEvent.click(await screen.findByRole('option', { name: optionName }))
  return input
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Lưu thông tin' }))

describe('the address block on the place editor', () => {
  it('preselects the pair the place already claims', async () => {
    openEditor()
    // The stored mapping, not empty boxes: an edit starts from what the place
    // actually claims, and the name is what a person can judge.
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Tỉnh / thành phố' })).toHaveValue(
        'Thành phố Hồ Chí Minh',
      ),
    )
    expect(screen.getByRole('combobox', { name: /Phường \/ xã/ })).toHaveValue('Phường Bến Nghé')
  })

  it('offers no district field anywhere on the form', async () => {
    openEditor()
    await screen.findByLabelText('Điện thoại')
    expect(screen.queryByLabelText(/Quận\/Huyện/)).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /Quận/ })).not.toBeInTheDocument()
  })

  it('sends the codes the API gave, never the display text', async () => {
    const sent = captureSave()
    openEditor()
    await screen.findByLabelText('Điện thoại')

    await pick(/Tỉnh \/ thành phố/, /Hà Nội/)
    await pick(/Phường \/ xã/, /Ba Đình/)
    await save()

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ provinceCode: '01', communeCode: '00163' })
    // Not the label, at either level. A code rebuilt from a name is a different
    // claim, and the server would validate it against the wrong unit.
    expect(JSON.stringify(sent[0])).not.toContain('Thành phố Hà Nội')
  })

  it('clears the commune when the province changes, so no cross-province pair can be sent', async () => {
    const sent = captureSave()
    openEditor()
    await screen.findByLabelText('Điện thoại')

    const commune = screen.getByRole('combobox', { name: /Phường \/ xã/ })
    await pick(/Tỉnh \/ thành phố/, /Hà Nội/)
    // The commune belonged to the previous province's list.
    await waitFor(() => expect(commune).toHaveValue(''))

    // And Hồ Chí Minh's wards are not on offer under Hà Nội.
    await userEvent.click(commune)
    const listbox = await screen.findByRole('listbox', { name: /Phường \/ xã/ })
    await waitFor(() =>
      expect(within(listbox).queryByRole('option', { name: /Bến Nghé/ })).not.toBeInTheDocument(),
    )

    // Saving now would send a province with no commune, which is not an
    // address — the form says so instead of letting the server say it.
    await save()
    expect(await screen.findByText(/Chọn phường \/ xã/)).toBeInTheDocument()
    expect(sent).toHaveLength(0)
  })
})

describe('what the editor is told about the mapping', () => {
  it('shows both levels with their codes, the dataset and the blocker', async () => {
    openEditor()
    const summary = (await screen.findByText('Đơn vị hành chính')).closest('section')!

    // Name and code together: the name is the half a person can judge, the code
    // is the half that gets stored and quoted in a bug report.
    expect(within(summary).getByText('Thành phố Hồ Chí Minh (79)')).toBeInTheDocument()
    expect(within(summary).getByText('Phường Bến Nghé (26734)')).toBeInTheDocument()
    expect(within(summary).getByText(/v5\.0\.0/)).toBeInTheDocument()
  })

  it('never calls an automatic match a verification', async () => {
    openEditor()
    const summary = (await screen.findByText('Đơn vị hành chính')).closest('section')!

    // AUTO_MATCHED is the resolver's answer. Rendering it as "đã xác nhận"
    // would claim something the publish transaction will refuse to act on.
    expect(within(summary).getByText('Máy khớp')).toBeInTheDocument()
    expect(within(summary).queryByText(/xác nhận$/)).not.toBeInTheDocument()
    expect(within(summary).getByText('Chưa thể đăng')).toBeInTheDocument()
    expect(within(summary).getByText(/chưa được người thật xác nhận/)).toBeInTheDocument()
  })

  it('says the district level is gone rather than leaving the address line unexplained', async () => {
    openEditor()
    const summary = (await screen.findByText('Đơn vị hành chính')).closest('section')!
    // The stored free-text address still reads "…, Quận 3, TP.HCM". Saying why
    // beats either rewriting somebody's address or leaving it looking wrong.
    expect(within(summary).getByText(/đã giải thể từ 01\/07\/2025/)).toBeInTheDocument()
  })

  it('says an unmapped place is unmapped instead of showing an empty pair', async () => {
    server.use(
      http.get('/v1/cms/places/:id', () =>
        HttpResponse.json({
          ...PLACE,
          administrative: {
            status: 'UNMAPPED',
            provinceCode: null,
            provinceName: null,
            communeCode: null,
            communeName: null,
            method: null,
            datasetVersion: null,
            activeDatasetVersion: 'v5.0.0+test',
            mappedAt: null,
            approvalBlock: { code: 'MAPPING_UNMAPPED', message: 'no mapping' },
          },
        }),
      ),
    )
    openEditor()
    const summary = (await screen.findByText('Đơn vị hành chính')).closest('section')!
    expect(within(summary).getByText('Chưa xác định được đơn vị hành chính.')).toBeInTheDocument()
    expect(within(summary).getByText(/chưa có ánh xạ hành chính/)).toBeInTheDocument()
  })
})

describe('the create form', () => {
  it('asks for a province and a commune, and for no district at all', async () => {
    openCreate()
    await screen.findByRole('combobox', { name: 'Tỉnh / thành phố' })
    expect(screen.getByRole('combobox', { name: /Phường \/ xã/ })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Quận\/Huyện/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Tỉnh/Thành phố')).not.toBeInTheDocument()
  })

  it('sends the chosen pair as codes', async () => {
    const sent: Record<string, unknown>[] = []
    server.use(
      http.post('/v1/cms/places', async ({ request }) => {
        sent.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ ...PLACE, id: 'created-1' }, { status: 201 })
      }),
    )
    openCreate()

    await userEvent.type(await screen.findByLabelText(/Tên hiển thị/), 'Quán Mới')
    await userEvent.type(screen.getByLabelText(/^Vĩ độ/), '21.0333')
    await userEvent.type(screen.getByLabelText(/^Kinh độ/), '105.8500')
    await pick(/Tỉnh \/ thành phố/, /Hà Nội/)
    await pick(/Phường \/ xã/, /Ba Đình/)
    await userEvent.click(screen.getByRole('button', { name: /Tạo địa điểm/ }))

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({ provinceCode: '01', communeCode: '00163' })
    // The legacy free-text pair is not sent at all — there is nothing to send.
    expect(sent[0]).not.toHaveProperty('city')
    expect(sent[0]).not.toHaveProperty('district')
  })
})
