import type { ReactNode } from 'react'
import { styles } from './assistant.style'

/**
 * A preview of the guide body, not a Markdown engine.
 *
 * The body is what the assistant grounds on; it is never rendered to users
 * as-is, so the preview only has to show the editor the structure they wrote:
 * headings, paragraphs, lists, code, emphasis. It builds React elements —
 * never `innerHTML` — so nothing typed into a document can run in the console.
 * Links are shown as text with their target, because a click from a preview
 * pane into an arbitrary URL is not something an editor needs.
 */

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*\s][^*]*\*|_[^_\s][^_]*_|\[[^\]]+\]\([^)\s]+\))/g

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = []
  let last = 0
  let index = 0
  for (const match of text.matchAll(INLINE)) {
    const token = match[0]
    const at = match.index ?? 0
    if (at > last) parts.push(text.slice(last, at))
    const key = `${keyPrefix}-${index++}`
    if (token.startsWith('`')) {
      parts.push(
        <code key={key} className={styles.mdCode}>
          {token.slice(1, -1)}
        </code>,
      )
    } else if (token.startsWith('**')) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
      parts.push(
        <span key={key} className={styles.mdLink}>
          {link?.[1]} <span className={styles.mdLinkTarget}>({link?.[2]})</span>
        </span>,
      )
    } else {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>)
    }
    last = at + token.length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'code'; text: string }

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
    paragraph = []
    if (list) blocks.push({ kind: 'list', ...list })
    list = null
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!
    if (line.trimStart().startsWith('```')) {
      flush()
      const code: string[] = []
      i += 1
      while (i < lines.length && !lines[i]!.trimStart().startsWith('```')) {
        code.push(lines[i]!)
        i += 1
      }
      blocks.push({ kind: 'code', text: code.join('\n') })
      continue
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      const level = Math.min(3, heading[1]!.length) as 1 | 2 | 3
      blocks.push({ kind: 'heading', level, text: heading[2]!.trim() })
      continue
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || numbered) {
      const ordered = Boolean(numbered)
      if (paragraph.length > 0) {
        blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
        paragraph = []
      }
      if (list && list.ordered !== ordered) {
        blocks.push({ kind: 'list', ...list })
        list = null
      }
      list ??= { ordered, items: [] }
      list.items.push((bullet ?? numbered)![1]!)
      continue
    }
    if (line.trim() === '') {
      flush()
      continue
    }
    if (list) {
      blocks.push({ kind: 'list', ...list })
      list = null
    }
    paragraph.push(line.trim())
  }
  flush()
  return blocks
}

export function MarkdownPreview({ source, emptyLabel }: { source: string; emptyLabel: string }) {
  const blocks = parseBlocks(source)
  if (blocks.length === 0) return <p className={styles.mdEmpty}>{emptyLabel}</p>
  return (
    <div className={styles.md}>
      {blocks.map((block, index) => {
        const key = `b-${index}`
        switch (block.kind) {
          case 'heading': {
            // One level below the page's own headings, so the outline holds.
            const Tag = (['h3', 'h4', 'h5'] as const)[block.level - 1]!
            return (
              <Tag key={key} className={styles.mdHeading[block.level]}>
                {inline(block.text, key)}
              </Tag>
            )
          }
          case 'list': {
            const Tag = block.ordered ? 'ol' : 'ul'
            return (
              <Tag key={key} className={block.ordered ? styles.mdOl : styles.mdUl}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{inline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </Tag>
            )
          }
          case 'code':
            return (
              <pre key={key} className={styles.mdPre}>
                {block.text}
              </pre>
            )
          default:
            return (
              <p key={key} className={styles.mdP}>
                {inline(block.text, key)}
              </p>
            )
        }
      })}
    </div>
  )
}
