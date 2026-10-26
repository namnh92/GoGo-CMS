import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { AppShell } from '@/app/AppShell'
import type { AdminRole } from '@/shared/api/contracts'
import { diffLines, withContext } from './textDiff'

describe('GoGo AI navigation, rendered per role (CMS#249)', () => {
  it.each<[AdminRole, { docs: boolean; feedback: boolean; kill: boolean }]>([
    ['editor', { docs: true, feedback: true, kill: false }],
    ['moderator', { docs: true, feedback: true, kill: false }],
    ['ops_admin', { docs: true, feedback: true, kill: true }],
    ['super_admin', { docs: true, feedback: true, kill: true }],
  ])('%s sees the entries its role can open', async (role, expected) => {
    signInAs(role)
    renderWithProviders(<AppShell />)

    expect(await screen.findByRole('button', { name: 'GoGo AI' })).toBeInTheDocument()
    const has = (name: string) => screen.queryByRole('link', { name }) !== null
    expect(has('Tài liệu nguồn (GoGo guide)')).toBe(expected.docs)
    expect(has('Phản hồi câu trả lời')).toBe(expected.feedback)
    expect(has('Công tắc tắt trợ lý')).toBe(expected.kill)
  })
})

describe('line diff', () => {
  it('finds added and removed lines around a common head and tail', () => {
    const diff = diffLines('a\nb\nc\nd', 'a\nB\nc\nd\ne')
    expect(diff.tooLarge).toBe(false)
    if (diff.tooLarge) return
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(1)
    expect(diff.lines.map((l) => `${l.kind[0]}${l.text}`)).toEqual([
      'sa',
      'rb',
      'aB',
      'sc',
      'sd',
      'ae',
    ])
  })

  it('reports nothing for identical text and counts an empty side', () => {
    expect(diffLines('x\ny', 'x\ny')).toMatchObject({ added: 0, removed: 0 })
    expect(diffLines('', 'x\ny')).toMatchObject({ added: 2, removed: 0 })
  })

  it('refuses a quadratic blow-up rather than freezing the tab', () => {
    const big = Array.from({ length: 2500 }, (_, i) => `a${i}`).join('\n')
    const other = Array.from({ length: 2500 }, (_, i) => `b${i}`).join('\n')
    expect(diffLines(big, other)).toMatchObject({ tooLarge: true, added: 2500, removed: 2500 })
  })

  it('collapses long unchanged runs to a count', () => {
    const before = Array.from({ length: 20 }, (_, i) => `l${i}`).join('\n')
    const after = before.replace('l10', 'L10')
    const diff = diffLines(before, after)
    if (diff.tooLarge) throw new Error('unexpected')
    const rows = withContext(diff.lines, 1)
    expect(rows[0]).toEqual({ kind: 'skip', count: 9 })
    expect(rows.at(-1)).toEqual({ kind: 'skip', count: 8 })
  })
})
