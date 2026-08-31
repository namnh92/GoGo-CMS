import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { Stepper } from './Stepper'

const STEPS = [
  { id: 'source', label: 'Chọn nguồn' },
  { id: 'mapping', label: 'Ánh xạ cột' },
  { id: 'review', label: 'Chạy thử và xác nhận' },
]

describe('Stepper (CMS-019)', () => {
  it('marks exactly one step as current, and does it in the accessibility tree', () => {
    render(<Stepper steps={STEPS} current="mapping" />)

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items.filter((item) => item.getAttribute('aria-current') === 'step')).toHaveLength(1)
    expect(screen.getByText('Ánh xạ cột').closest('li')).toHaveAttribute('aria-current', 'step')
  })

  it('keeps the label as the only readable content — number and tick are decoration', () => {
    render(<Stepper steps={STEPS} current="review" />)

    const done = screen.getByText('Chọn nguồn').closest('li')!
    // The tick is hidden from assistive tech, so a step is never announced as
    // the meaningless "✓ Chọn nguồn".
    expect(within(done).getByText('✓')).toHaveAttribute('aria-hidden', 'true')
    expect(done).not.toHaveAttribute('aria-current')
  })

  it('handles a longer flow than the one it was extracted from', () => {
    const long = Array.from({ length: 7 }, (_, index) => ({
      id: `s${index}`,
      label: `Bước ${index + 1}`,
    }))
    render(<Stepper steps={long} current="s6" />)

    expect(screen.getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByText('Bước 7').closest('li')).toHaveAttribute('aria-current', 'step')
  })
})
