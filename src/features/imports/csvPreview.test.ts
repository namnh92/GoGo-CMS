import { describe, expect, it } from 'vitest'
import { guessMapping, parseCsvPreview } from './csvPreview'

describe('csv preview', () => {
  it('handles quoted cells containing the delimiter', () => {
    const preview = parseCsvPreview('ten,dia chi\n"Chào Bạn","126 NTMK, Q.3"\n')
    expect(preview.headers).toEqual(['ten', 'dia chi'])
    expect(preview.sampleRows[0]).toEqual(['Chào Bạn', '126 NTMK, Q.3'])
  })

  it('guesses Vietnamese headers onto canonical fields', () => {
    const mapping = guessMapping(['ten quan', 'dia chi', 'link google maps'])
    expect(mapping['ten quan']).toBe('name')
    expect(mapping['dia chi']).toBe('address')
    expect(mapping['link google maps']).toBe('googleMapsUrl')
  })

  it('leaves unknown columns unmapped rather than guessing wildly', () => {
    expect(guessMapping(['cot_la'])).toEqual({})
  })
})
