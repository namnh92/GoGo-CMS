import { describe, expect, it } from 'vitest'
import userEvent from '@testing-library/user-event'
import { screen, waitFor, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import CollectionsScreen from './collections.view'

describe('CollectionsScreen', () => {
  it('loads the stored list before offering to replace it', async () => {
    signInAs('editor')
    renderWithProviders(<CollectionsScreen />)

    // `PUT .../items` replaces everything, so an empty editor would be a
    // one-click way to erase a curated collection.
    expect(await screen.findByText('Chào Bạn Cafe & Space')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu danh sách' })).toBeDisabled()
  })

  it('marks a pinned place that has left publication', async () => {
    signInAs('editor')
    renderWithProviders(<CollectionsScreen />)

    await screen.findByText('GoPlay Entertainment')
    expect(screen.getByText('Địa điểm này không còn ở trạng thái xuất bản.')).toBeInTheDocument()
  })

  it('names every place a save would drop', async () => {
    signInAs('editor')
    const user = userEvent.setup()
    renderWithProviders(<CollectionsScreen />)

    await screen.findByText('GoPlay Entertainment')
    await user.click(screen.getAllByRole('button', { name: 'Bỏ khỏi bộ sưu tập' })[1]!)

    const save = screen.getByRole('button', { name: 'Lưu danh sách' })
    await waitFor(() => expect(save).toBeEnabled())
    await user.click(save)

    const dialog = await screen.findByRole('dialog')
    // Removal is the destructive half of a whole-list replace.
    expect(within(dialog).getByText('GoPlay Entertainment')).toBeInTheDocument()
  })
})
