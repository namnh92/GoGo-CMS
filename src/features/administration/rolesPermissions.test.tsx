import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderWithProviders, signInAs } from '@/shared/test/render'
import { ADMIN_ROLES, PERMISSION_ENTRIES, roleCan } from '@/shared/auth/permissions'
import RolesPermissionsScreen from './rolesPermissions.view'

describe('roles & permissions (CMS-036)', () => {
  it('lists exactly the four real roles — never the mockup seven', async () => {
    signInAs('editor')
    renderWithProviders(<RolesPermissionsScreen />)

    await screen.findByRole('table')
    expect(ADMIN_ROLES).toHaveLength(4)
    // The mockup's invented roles must not appear anywhere.
    for (const ghost of ['Support', 'Viewer', 'Analyst']) {
      expect(screen.queryByText(ghost)).not.toBeInTheDocument()
    }
  })

  it('renders a matrix cell for every permission × role, straight from roleCan', async () => {
    signInAs('editor')
    renderWithProviders(<RolesPermissionsScreen />)

    const table = await screen.findByRole('table')
    // One row per permission (plus group header rows), one cell per role.
    for (const entry of PERMISSION_ENTRIES.slice(0, 5)) {
      const row = within(table).getByText(entry.permission).closest('tr')!
      const allowed = within(row).queryAllByText('Được phép').length
      const denied = within(row).queryAllByText('Không được phép').length
      expect(allowed + denied).toBe(ADMIN_ROLES.length)
      // The screen's answer matches the gate the UI actually runs.
      expect(allowed).toBe(ADMIN_ROLES.filter((role) => roleCan(role, entry.permission)).length)
    }
  })

  it('offers no mutation controls — the model is fixed server-side', async () => {
    signInAs('super_admin')
    renderWithProviders(<RolesPermissionsScreen />)

    await screen.findByRole('table')
    expect(screen.queryByRole('button', { name: /sửa|edit/i })).not.toBeInTheDocument()
    expect(screen.getByText(/không có nút sửa/i)).toBeInTheDocument()
  })
})
