import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import SearchQualityScreen from './searchQuality.view'

describe('SearchQualityScreen', () => {
  it('never shows the zero-result rate without its denominator', async () => {
    signInAs('ops_admin')
    renderWithProviders(<SearchQualityScreen />)

    expect(await screen.findByText('2,2%')).toBeInTheDocument()
    // "412 zero-results" says nothing without "out of 18,402 searches".
    expect(screen.getByText(/412 \/ 18\.402/)).toBeInTheDocument()
  })

  it('counts the rare queries it refuses to name', async () => {
    signInAs('ops_admin')
    renderWithProviders(<SearchQualityScreen />)

    // Dropping them would report a lower failure rate than the real one.
    expect(await screen.findByText(/214 truy vấn · 486 lượt tìm/)).toBeInTheDocument()
  })

  it('promises no per-request drill-down, because there is no such log', async () => {
    signInAs('ops_admin')
    renderWithProviders(<SearchQualityScreen />)

    expect(await screen.findByText(/Không có log từng request/)).toBeInTheDocument()
  })

  it('is closed to an editor', async () => {
    signInAs('editor')
    renderWithProviders(<SearchQualityScreen />)
    expect(await screen.findByText('Không đủ quyền')).toBeInTheDocument()
  })
})
