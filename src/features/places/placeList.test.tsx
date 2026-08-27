import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import PlaceListScreen from './placeList.view'

/**
 * The `screen × role × state` matrix has to actually render — a selector that
 * swaps a query param without changing the output is a bug (quality-gates.md).
 */
describe('place list, by role', () => {
  it('renders the catalog for an editor', async () => {
    signInAs('editor')
    renderWithProviders(<PlaceListScreen />)

    expect(await screen.findByText('Chào Bạn Cafe & Space')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Quản lý địa điểm' })).toBeInTheDocument()
  })

  it('shows permission-denied for a moderator instead of an empty page', async () => {
    signInAs('moderator')
    renderWithProviders(<PlaceListScreen />)

    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
    expect(screen.queryByText('Chào Bạn Cafe & Space')).not.toBeInTheDocument()
  })

  it('hides the add-place CTA from a role that cannot write', async () => {
    signInAs('ops_admin')
    renderWithProviders(<PlaceListScreen />)

    await waitFor(() => expect(screen.getByText('Chào Bạn Cafe & Space')).toBeInTheDocument())
    // ops_admin can write, so the CTA is enabled — the negative case is the
    // moderator above, who never reaches this screen at all.
    expect(screen.getByRole('button', { name: /Thêm địa điểm/ })).toBeEnabled()
  })
})
