import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import PlaceListScreen from './placeList.view'

/**
 * The `screen × role × state` matrix has to actually render — a selector that
 * swaps a query param without changing the output is a bug (quality-gates.md).
 *
 * Since GoGo-BE#144 reads are hierarchical: every staff role can open the
 * catalog, and the difference between them shows up in the actions.
 */
describe('place list, by role', () => {
  it('renders the catalog for an editor with writing enabled', async () => {
    signInAs('editor')
    renderWithProviders(<PlaceListScreen />)

    expect(await screen.findByText('Chào Bạn Cafe & Space')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thêm địa điểm/ })).toBeEnabled()
  })

  it('lets a moderator read the catalog but not change it', async () => {
    signInAs('moderator')
    renderWithProviders(<PlaceListScreen />)

    // Reading is allowed now — this used to be a permission-denied screen.
    expect(await screen.findByText('Chào Bạn Cafe & Space')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thêm địa điểm/ })).toBeDisabled()
  })

  it('lets an ops admin read the catalog but not edit places', async () => {
    signInAs('ops_admin')
    renderWithProviders(<PlaceListScreen />)

    await waitFor(() => expect(screen.getByText('Chào Bạn Cafe & Space')).toBeInTheDocument())
    // ops_admin publishes imports that create places, and still cannot edit one.
    expect(screen.getByRole('button', { name: /Thêm địa điểm/ })).toBeDisabled()
    for (const button of screen.getAllByRole('button', { name: 'Sửa' })) {
      expect(button).toBeDisabled()
    }
  })

  it('applies the server-side filters the contract exposes', async () => {
    signInAs('editor')
    renderWithProviders(<PlaceListScreen />)

    await screen.findByText('Chào Bạn Cafe & Space')
    expect(screen.getByLabelText('Mã khu vực')).toBeInTheDocument()
    expect(screen.getByLabelText('Khoá nhóm')).toBeInTheDocument()
    expect(screen.getByLabelText('Nguồn dữ liệu')).toBeInTheDocument()
    expect(screen.getByLabelText('Sắp xếp')).toBeInTheDocument()
  })
})
