import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '@/shared/test/server'
import { signInAs } from '@/shared/test/render'
import { taxonomies } from '@/shared/test/fixtures'
import { addSynonym, createTaxonomy, fetchTaxonomyVersion, updateTaxonomy } from './api'

describe('taxonomy version contract', () => {
  it('reads and parses the generation returned by every write endpoint', async () => {
    signInAs('editor')
    const initial = await fetchTaxonomyVersion()
    const created = await createTaxonomy({ kind: 'mood', key: 'new_key', labels: { vi: 'Mới' } })
    expect(created.version).toBe(initial.version + 1)
    const updated = await updateTaxonomy(taxonomies[0]!.id, { sortOrder: 7 })
    expect(updated.version).toBe(created.version + 1)
    const synonym = await addSynonym(taxonomies[0]!.id, 'thư giãn')
    expect(synonym.version).toBe(updated.version + 1)
    expect(await fetchTaxonomyVersion()).toEqual(synonym)
  })

  it.each([
    {},
    { version: 0, updatedAt: '2026-11-07T00:00:00Z' },
    { version: 1.5, updatedAt: '2026-11-07T00:00:00Z' },
    { version: 2, updatedAt: 'invalid' },
  ])(
    'rejects malformed metadata rather than displaying a fabricated generation: %j',
    async (body) => {
      server.use(http.get('*/cms/taxonomies/version', () => HttpResponse.json(body)))
      await expect(fetchTaxonomyVersion()).rejects.toMatchObject({ code: 'CONTRACT_MISMATCH' })
    },
  )
})
