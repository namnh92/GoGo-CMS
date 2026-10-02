import { screen } from '@testing-library/react'

/**
 * GoGo-BE#440 — every fact the create form sends names its evidence. Tests that
 * are about something else still have to fill those boxes, the same way they
 * fill the name; this is that step, by the label an editor reads.
 */
export const SOURCE_LABEL = {
  name: /^Nguồn của tên/,
  geom: /^Nguồn của toạ độ/,
  addressText: /^Nguồn của địa chỉ/,
  phone: /^Nguồn của số điện thoại/,
  website: /^Nguồn của website/,
  description: /^Nguồn của mô tả/,
  provinceCode: /^Nguồn của tỉnh/,
  communeCode: /^Nguồn của phường/,
  taxonomyIds: /^Nguồn của nhóm địa điểm/,
} as const

/** The boxes a Google attachment's suggestions (units, category) open. */
export const SUGGESTION_SOURCES: SourceBox[] = ['provinceCode', 'communeCode', 'taxonomyIds']

export type SourceBox = keyof typeof SOURCE_LABEL

export const SOURCE_TEXT = 'Đến tận nơi 02/10/2026'

export async function fillSources(
  user: { type: (element: Element, text: string) => Promise<void> },
  boxes: SourceBox[] = ['name', 'geom'],
  text = SOURCE_TEXT,
) {
  for (const box of boxes) {
    await user.type(await screen.findByLabelText(SOURCE_LABEL[box]), text)
  }
}
