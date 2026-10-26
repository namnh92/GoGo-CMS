import { http, HttpResponse } from 'msw'
import type { AdminRole, AuditEntry } from '@/shared/api/contracts'
import type {
  CmsAssistantActor,
  CmsAssistantDocument,
  CmsAssistantFeedbackItem,
  CmsAssistantVersion,
  CmsAssistantVersionSummary,
} from '@/shared/api/contracts-assistant'

/**
 * GoGo-CMS#249 — the mock half of the GoGo AI contract (GoGo-BE#713,
 * `2.0.0-alpha.2`). It behaves the way the contract says the server will:
 *
 * - drafts: `editor` / `ops_admin` (and `super_admin`); publish / unpublish:
 *   `ops_admin` only; reads and the feedback queue open to every rank-1 role;
 * - `PATCH` refuses a stale `baseRevision` with `409 REVISION_CONFLICT`;
 * - publish supersedes the previous live version, unpublish withdraws it and
 *   requires a reason; both refuse a state that no longer holds (409);
 * - every write lands in the audit log as `assistant_document.*` with
 *   before/after, the shape `AuditTrail` renders.
 *
 * Built by a factory so it shares the session/role reading and the error
 * envelope of `handlers.ts` without importing it back.
 */

type Actor = { role: AdminRole; displayName: string }
type Deps = {
  base: string
  currentActor: () => Actor
  envelope: (status: number, code: string, message: string) => Response
}

const DOC = {
  voting: '0f6a1e2b-1111-4000-8000-000000000001',
  invite: '0f6a1e2b-1111-4000-8000-000000000002',
  budget: '0f6a1e2b-1111-4000-8000-000000000003',
  freshness: '0f6a1e2b-1111-4000-8000-000000000004',
} as const

const ADMINS: Record<string, CmsAssistantActor> = {
  editor: {
    adminId: 'a0000000-0000-4000-8000-000000000001',
    displayName: 'linh.editor',
    role: 'editor',
  },
  ops: {
    adminId: 'a0000000-0000-4000-8000-000000000002',
    displayName: 'quan.ops',
    role: 'ops_admin',
  },
}

function iso(minutesAgo: number): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

/** Stand-in for SHA-256: stable per body, hex, 64 chars. Good enough for "changed?". */
function fakeSha(body: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < body.length; i += 1) {
    h1 = Math.imul(h1 ^ body.charCodeAt(i), 16777619) >>> 0
    h2 = Math.imul(h2 ^ body.charCodeAt(i), 2246822519) >>> 0
  }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0')).repeat(4)
}

type MockVersion = CmsAssistantVersion
type MockDocument = Omit<CmsAssistantDocument, 'publishedVersion' | 'draftVersion' | 'title'>

const VOTING_V1 = `# Bình chọn trong kế hoạch

Mỗi thành viên bình chọn một lần cho mỗi khung giờ.

- Chủ phòng chốt kế hoạch.
- Kết quả hiện sau khi chốt.`

const VOTING_V2 = `# Bình chọn trong kế hoạch

Mỗi thành viên bình chọn **một lần** cho mỗi lựa chọn.

- Chủ phòng chốt kế hoạch khi đủ phiếu.
- Kết quả hiện ngay cho mọi thành viên.`

const VOTING_V3 = `# Bình chọn trong kế hoạch

Mỗi thành viên bình chọn **một lần** cho mỗi lựa chọn và có thể đổi phiếu trước khi chốt.

- Chủ phòng chốt kế hoạch khi đủ phiếu.
- Kết quả hiện ngay cho mọi thành viên.
- Khách mời chỉ xem, không bình chọn.`

function version(
  documentId: string,
  id: string,
  number: number,
  state: string,
  fields: { title: string; description: string; body: string },
  extra: Partial<MockVersion> = {},
): MockVersion {
  return {
    id,
    documentId,
    number,
    state,
    title: fields.title,
    description: fields.description,
    body: fields.body,
    bodySha256: fakeSha(fields.body),
    revision: state === 'draft' ? 1 : (extra.revision ?? 1),
    createdAt: iso(60 * 24 * (10 - number)),
    createdBy: ADMINS.editor!,
    publishedAt: null,
    publishedBy: null,
    publishReason: null,
    withdrawnAt: null,
    withdrawnBy: null,
    withdrawReason: null,
    ...extra,
  }
}

function seed() {
  const documents: MockDocument[] = [
    {
      id: DOC.voting,
      slug: 'plans.voting',
      locale: 'vi',
      status: 'published',
      createdAt: iso(60 * 24 * 9),
      updatedAt: iso(30),
    },
    {
      id: DOC.invite,
      slug: 'rooms.invite',
      locale: 'vi',
      status: 'published',
      createdAt: iso(60 * 24 * 8),
      updatedAt: iso(60 * 24 * 2),
    },
    {
      id: DOC.budget,
      slug: 'budget.modes',
      locale: 'en',
      status: 'draft',
      createdAt: iso(60 * 5),
      updatedAt: iso(60 * 5),
    },
    {
      id: DOC.freshness,
      slug: 'places.freshness',
      locale: 'vi',
      status: 'unpublished',
      createdAt: iso(60 * 24 * 20),
      updatedAt: iso(60 * 24),
    },
  ]
  const votingTitle = 'GoGo guide · Kế hoạch'
  const versions: MockVersion[] = [
    version(
      DOC.voting,
      '0f6a1e2b-2222-4000-8000-000000000001',
      1,
      'superseded',
      {
        title: votingTitle,
        description: 'Cách bình chọn và chốt kế hoạch.',
        body: VOTING_V1,
      },
      {
        publishedAt: iso(60 * 24 * 8),
        publishedBy: ADMINS.ops!,
        publishReason: 'Bản đầu tiên',
      },
    ),
    version(
      DOC.voting,
      '0f6a1e2b-2222-4000-8000-000000000002',
      2,
      'published',
      {
        title: votingTitle,
        description: 'Cách bình chọn và chốt kế hoạch.',
        body: VOTING_V2,
      },
      {
        publishedAt: iso(60 * 24 * 3),
        publishedBy: ADMINS.ops!,
        publishReason: 'Cập nhật quy tắc hiện kết quả',
      },
    ),
    version(
      DOC.voting,
      '0f6a1e2b-2222-4000-8000-000000000003',
      3,
      'draft',
      {
        title: 'GoGo guide · Kế hoạch nhóm',
        description: 'Cách bình chọn, đổi phiếu và chốt kế hoạch.',
        body: VOTING_V3,
      },
      { revision: 2, createdAt: iso(30) },
    ),
    version(
      DOC.invite,
      '0f6a1e2b-2222-4000-8000-000000000011',
      1,
      'published',
      {
        title: 'GoGo guide · Mời bạn',
        description: 'Mời bạn vào phòng bằng liên kết.',
        body: '# Mời bạn\n\nChia sẻ liên kết mời; liên kết hết hạn sau 7 ngày.',
      },
      { publishedAt: iso(60 * 24 * 2), publishedBy: ADMINS.ops!, publishReason: null },
    ),
    version(
      DOC.budget,
      '0f6a1e2b-2222-4000-8000-000000000021',
      1,
      'draft',
      {
        title: 'GoGo guide · Budget',
        description: 'Total vs per-person budgets.',
        body: '# Budget modes\n\n- **Total**: one amount for the group.\n- **Per person**: each member.',
      },
      { createdAt: iso(60 * 5) },
    ),
    version(
      DOC.freshness,
      '0f6a1e2b-2222-4000-8000-000000000031',
      1,
      'withdrawn',
      {
        title: 'GoGo guide · Độ mới dữ liệu',
        description: 'Ngày kiểm tra địa điểm nghĩa là gì.',
        body: '# Độ mới dữ liệu\n\nMỗi địa điểm ghi ngày kiểm tra lần cuối.',
      },
      {
        publishedAt: iso(60 * 24 * 15),
        publishedBy: ADMINS.ops!,
        withdrawnAt: iso(60 * 24),
        withdrawnBy: ADMINS.ops!,
        withdrawReason: 'Nội dung sai về chu kỳ kiểm tra',
      },
    ),
  ]
  const audit: AuditEntry[] = [
    {
      id: 'audit-asst-seed-1',
      action: 'assistant_document.published',
      actorType: 'admin',
      actorId: ADMINS.ops!.adminId,
      actorRole: 'ops_admin',
      resourceType: 'assistant_document',
      resourceId: DOC.voting,
      occurredAt: iso(60 * 24 * 3),
      diff: {
        before: { status: 'published', publishedVersion: 1 },
        after: { status: 'published', publishedVersion: 2 },
      },
      reason: 'Cập nhật quy tắc hiện kết quả',
      breakGlass: false,
      requestId: 'mock-asst-publish',
      ipAddress: '10.0.0.2',
      authorizationPath: null,
    },
    {
      id: 'audit-asst-seed-2',
      action: 'assistant_document.draft_updated',
      actorType: 'admin',
      actorId: ADMINS.editor!.adminId,
      actorRole: 'editor',
      resourceType: 'assistant_document',
      resourceId: DOC.voting,
      occurredAt: iso(30),
      diff: {
        before: { title: 'GoGo guide · Kế hoạch', revision: 1 },
        after: { title: 'GoGo guide · Kế hoạch nhóm', revision: 2 },
      },
      reason: null,
      breakGlass: false,
      requestId: 'mock-asst-draft',
      ipAddress: '10.0.0.3',
      authorizationPath: null,
    },
  ]
  const feedback: CmsAssistantFeedbackItem[] = [
    {
      id: 'fb000000-0000-4000-8000-000000000001',
      rating: 'down',
      reason: 'outdated',
      createdAt: iso(45),
      conversationRef: 'c9f1a2b3d4e5f6a7',
      reply: {
        status: 'complete',
        text: 'Kết quả bình chọn chỉ hiện sau khi chủ phòng chốt kế hoạch [1].',
        sources: [
          {
            index: 1,
            kind: 'guide_document',
            documentId: DOC.voting,
            versionId: '0f6a1e2b-2222-4000-8000-000000000001',
            slug: 'plans.voting',
            title: 'GoGo guide · Kế hoạch',
            description: 'Cách bình chọn và chốt kế hoạch.',
          },
        ],
        cardKinds: [],
        proposalKinds: [],
        model: 'model-a',
      },
    },
    {
      id: 'fb000000-0000-4000-8000-000000000002',
      rating: 'up',
      createdAt: iso(120),
      conversationRef: 'a1b2c3d4e5f60718',
      reply: {
        status: 'complete',
        text: 'Quán này mở đến 22:00 [1]. Mình có thể tạo phòng cho tối thứ Sáu nếu bạn muốn.',
        sources: [
          {
            index: 1,
            kind: 'place_data',
            title: 'GoGo place data',
            checkedAt: iso(60 * 24 * 6),
          },
        ],
        cardKinds: ['place'],
        proposalKinds: ['create_room'],
        model: 'model-a',
      },
    },
    {
      id: 'fb000000-0000-4000-8000-000000000003',
      rating: 'down',
      reason: 'not_helpful',
      createdAt: iso(60 * 26),
      conversationRef: 'ffeeddccbbaa9988',
      reply: {
        status: 'fallback',
        text: 'GoGo chưa có thông tin về câu hỏi này.',
        sources: [],
        notice: { kind: 'fallback', reason: 'timeout', copyKey: 'assistant.notice.fallback' },
        model: 'model-a',
      },
    },
  ]
  return { documents, versions, audit, feedback }
}

let state = seed()

/** Back to the fixtures — for suites that write. */
export function resetAssistantMock(): void {
  state = seed()
}

/** Audit entries the assistant mock wrote, newest first (read by `GET /cms/audit`). */
export function assistantAudit(): AuditEntry[] {
  return state.audit
}

export const assistantFixtureIds = DOC

/**
 * Test seam: a colleague saves the draft in another tab, so the next `PATCH`
 * from the screen under test carries a stale `baseRevision`.
 */
export function simulateColleagueEdit(documentId: string, body: string): void {
  const draft = state.versions.find((v) => v.documentId === documentId && v.state === 'draft')
  if (!draft) return
  draft.body = body
  draft.bodySha256 = fakeSha(body)
  draft.revision = (draft.revision ?? 0) + 1
  draft.createdBy = ADMINS.ops!
}

/** Test seam: empties the feedback queue / document list for the empty state. */
export function clearAssistantMock(what: 'documents' | 'feedback'): void {
  if (what === 'documents') {
    state.documents = []
    state.versions = []
  } else {
    state.feedback = []
  }
}

function summary(v: MockVersion): CmsAssistantVersionSummary {
  const rest: Partial<MockVersion> = { ...v }
  delete rest.documentId
  delete rest.description
  delete rest.body
  return rest as CmsAssistantVersionSummary
}

function present(doc: MockDocument): CmsAssistantDocument {
  const versions = state.versions.filter((v) => v.documentId === doc.id)
  const published = versions.find((v) => v.state === 'published') ?? null
  const draft = versions.find((v) => v.state === 'draft') ?? null
  return {
    ...doc,
    title: (published ?? draft ?? versions[versions.length - 1])?.title ?? doc.slug,
    publishedVersion: published ? summary(published) : null,
    draftVersion: draft ? summary(draft) : null,
  }
}

function detailOf(doc: MockDocument) {
  const versions = state.versions.filter((v) => v.documentId === doc.id)
  return {
    document: present(doc),
    draft: versions.find((v) => v.state === 'draft') ?? null,
    published: versions.find((v) => v.state === 'published') ?? null,
  }
}

function actorOf(actor: Actor): CmsAssistantActor {
  return {
    adminId: `a-mock-${actor.role}`,
    displayName: actor.displayName,
    role: actor.role,
  }
}

const SLUG = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/

export function createAssistantHandlers({ base, currentActor, envelope }: Deps) {
  const canDraft = () => ['editor', 'ops_admin', 'super_admin'].includes(currentActor().role)
  const canPublish = () => ['ops_admin', 'super_admin'].includes(currentActor().role)

  const record = (
    action: string,
    resourceId: string,
    diff: unknown,
    reason: string | null = null,
  ) => {
    const actor = currentActor()
    state.audit.unshift({
      id: `audit-asst-${state.audit.length + 1}-${Date.now()}`,
      action: `assistant_document.${action}`,
      actorType: 'admin',
      actorId: `a-mock-${actor.role}`,
      actorRole: actor.role,
      resourceType: 'assistant_document',
      resourceId,
      occurredAt: new Date().toISOString(),
      diff,
      reason,
      breakGlass: false,
      requestId: `mock-asst-${action}`,
      ipAddress: '10.0.0.1',
      authorizationPath: null,
    })
  }

  const findDoc = (id: unknown) => state.documents.find((doc) => doc.id === id)

  return [
    http.get(`${base}/cms/assistant/documents`, ({ request }) => {
      const url = new URL(request.url)
      const status = url.searchParams.get('status')
      const locale = url.searchParams.get('locale')
      const q = url.searchParams.get('q')
      const limit = Number(url.searchParams.get('limit') ?? 50)
      const cursor = url.searchParams.get('cursor')
      if (q !== null && (q.length < 2 || q.length > 100)) {
        return envelope(400, 'VALIDATION_FAILED', 'q must be 2–100 characters')
      }
      let items = state.documents.map(present)
      if (status) items = items.filter((doc) => doc.status === status)
      if (locale) items = items.filter((doc) => doc.locale === locale)
      if (q) {
        const needle = q.toLowerCase()
        items = items.filter(
          (doc) => doc.slug.includes(needle) || doc.title.toLowerCase().includes(needle),
        )
      }
      items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      const start = cursor ? items.findIndex((doc) => doc.id === cursor) + 1 : 0
      const page = items.slice(start, start + limit)
      const last = page[page.length - 1]
      return HttpResponse.json({
        items: page,
        nextCursor: start + limit < items.length && last ? last.id : null,
      })
    }),

    http.post(`${base}/cms/assistant/documents`, async ({ request }) => {
      if (!canDraft()) return envelope(403, 'FORBIDDEN', 'drafts are editor or ops_admin')
      const body = (await request.json()) as Record<string, string>
      if (!SLUG.test(body.slug ?? '') || !body.title?.trim() || !body.body?.trim()) {
        return envelope(400, 'VALIDATION_FAILED', 'slug, title and body are required')
      }
      if (state.documents.some((doc) => doc.slug === body.slug && doc.locale === body.locale)) {
        return envelope(409, 'DOCUMENT_SLUG_TAKEN', 'a document with that slug and locale exists')
      }
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      const doc: MockDocument = {
        id,
        slug: body.slug!,
        locale: body.locale === 'en' ? 'en' : 'vi',
        status: 'draft',
        createdAt: now,
        updatedAt: now,
      }
      state.documents.push(doc)
      state.versions.push(
        version(
          id,
          crypto.randomUUID(),
          1,
          'draft',
          {
            title: body.title!,
            description: body.description ?? '',
            body: body.body!,
          },
          { createdAt: now, createdBy: actorOf(currentActor()) },
        ),
      )
      record('created', id, { before: null, after: { slug: doc.slug, title: body.title } })
      return HttpResponse.json(present(doc), { status: 201 })
    }),

    http.get(`${base}/cms/assistant/documents/:id`, ({ params }) => {
      const doc = findDoc(params.id)
      if (!doc) return envelope(404, 'NOT_FOUND', 'document not found')
      return HttpResponse.json(detailOf(doc))
    }),

    http.patch(`${base}/cms/assistant/documents/:id`, async ({ params, request }) => {
      if (!canDraft()) return envelope(403, 'FORBIDDEN', 'drafts are editor or ops_admin')
      const doc = findDoc(params.id)
      if (!doc) return envelope(404, 'NOT_FOUND', 'document not found')
      const body = (await request.json()) as {
        baseRevision?: number
        title?: string
        description?: string
        body?: string
      }
      if (typeof body.baseRevision !== 'number') {
        return envelope(400, 'VALIDATION_FAILED', 'baseRevision is required')
      }
      if (body.title !== undefined && body.title.trim() === '') {
        return envelope(400, 'VALIDATION_FAILED', 'title must not be empty')
      }
      const versions = state.versions.filter((v) => v.documentId === doc.id)
      let draft = versions.find((v) => v.state === 'draft')
      const current = draft?.revision ?? 0
      if (body.baseRevision !== current) {
        return envelope(409, 'REVISION_CONFLICT', 'the draft changed since baseRevision')
      }
      const actor = actorOf(currentActor())
      if (!draft) {
        const from = versions.find((v) => v.state === 'published') ?? versions[versions.length - 1]
        draft = version(
          doc.id,
          crypto.randomUUID(),
          Math.max(0, ...versions.map((v) => v.number)) + 1,
          'draft',
          {
            title: from?.title ?? doc.slug,
            description: from?.description ?? '',
            body: from?.body ?? '',
          },
          { createdAt: new Date().toISOString(), createdBy: actor, revision: 0 },
        )
        draft.revision = 0
        state.versions.push(draft)
      }
      const before = {
        title: draft.title,
        description: draft.description,
        bodySha256: draft.bodySha256,
      }
      if (body.title !== undefined) draft.title = body.title
      if (body.description !== undefined) draft.description = body.description
      if (body.body !== undefined) {
        draft.body = body.body
        draft.bodySha256 = fakeSha(body.body)
      }
      draft.revision = (draft.revision ?? 0) + 1
      draft.createdBy = actor
      doc.updatedAt = new Date().toISOString()
      record('draft_updated', doc.id, {
        before: { ...before, revision: current },
        after: {
          title: draft.title,
          description: draft.description,
          bodySha256: draft.bodySha256,
          revision: draft.revision,
        },
      })
      return HttpResponse.json(detailOf(doc))
    }),

    http.post(`${base}/cms/assistant/documents/:id/publish`, async ({ params, request }) => {
      if (!canPublish()) return envelope(403, 'FORBIDDEN', 'publishing is ops_admin only')
      const doc = findDoc(params.id)
      if (!doc) return envelope(404, 'NOT_FOUND', 'document not found')
      const body = (await request.json()) as { versionId?: string; reason?: string }
      const target = state.versions.find((v) => v.documentId === doc.id && v.id === body.versionId)
      if (!target) return envelope(404, 'VERSION_NOT_FOUND', 'version is not one of this document')
      if (target.state === 'published') {
        return envelope(409, 'VERSION_ALREADY_PUBLISHED', 'already published')
      }
      const previous = state.versions.find(
        (v) => v.documentId === doc.id && v.state === 'published',
      )
      if (previous) previous.state = 'superseded'
      const now = new Date().toISOString()
      target.state = 'published'
      target.publishedAt = now
      target.publishedBy = actorOf(currentActor())
      target.publishReason = body.reason ?? null
      const beforeStatus = doc.status
      doc.status = 'published'
      doc.updatedAt = now
      record(
        'published',
        doc.id,
        {
          before: { status: beforeStatus, publishedVersion: previous?.number ?? null },
          after: { status: 'published', publishedVersion: target.number },
        },
        body.reason ?? null,
      )
      return HttpResponse.json(detailOf(doc))
    }),

    http.post(`${base}/cms/assistant/documents/:id/unpublish`, async ({ params, request }) => {
      if (!canPublish()) return envelope(403, 'FORBIDDEN', 'unpublishing is ops_admin only')
      const doc = findDoc(params.id)
      if (!doc) return envelope(404, 'NOT_FOUND', 'document not found')
      const body = (await request.json()) as { reason?: string }
      if (!body.reason?.trim()) return envelope(400, 'VALIDATION_FAILED', 'reason is required')
      const live = state.versions.find((v) => v.documentId === doc.id && v.state === 'published')
      if (!live) return envelope(409, 'DOCUMENT_NOT_PUBLISHED', 'nothing is published')
      const now = new Date().toISOString()
      live.state = 'withdrawn'
      live.withdrawnAt = now
      live.withdrawnBy = actorOf(currentActor())
      live.withdrawReason = body.reason
      doc.status = 'unpublished'
      doc.updatedAt = now
      record(
        'unpublished',
        doc.id,
        {
          before: { status: 'published', publishedVersion: live.number },
          after: { status: 'unpublished', publishedVersion: null },
        },
        body.reason,
      )
      return HttpResponse.json(detailOf(doc))
    }),

    http.get(`${base}/cms/assistant/documents/:id/versions`, ({ params }) => {
      const doc = findDoc(params.id)
      if (!doc) return envelope(404, 'NOT_FOUND', 'document not found')
      const items = state.versions
        .filter((v) => v.documentId === doc.id)
        .sort((a, b) => b.number - a.number)
        .map(summary)
      return HttpResponse.json({ items, nextCursor: null })
    }),

    http.get(`${base}/cms/assistant/documents/:id/versions/:versionId`, ({ params }) => {
      const found = state.versions.find(
        (v) => v.documentId === params.id && v.id === params.versionId,
      )
      if (!found) return envelope(404, 'NOT_FOUND', 'version not found')
      return HttpResponse.json(found)
    }),

    http.get(`${base}/cms/assistant/feedback`, ({ request }) => {
      const url = new URL(request.url)
      const rating = url.searchParams.get('rating')
      const reason = url.searchParams.get('reason')
      const from = url.searchParams.get('from')
      const to = url.searchParams.get('to')
      const limit = Number(url.searchParams.get('limit') ?? 50)
      const cursor = url.searchParams.get('cursor')
      let items = [...state.feedback].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      if (rating) items = items.filter((item) => item.rating === rating)
      if (reason) items = items.filter((item) => item.reason === reason)
      if (from) items = items.filter((item) => item.createdAt >= from)
      if (to) items = items.filter((item) => item.createdAt <= to)
      const start = cursor ? items.findIndex((item) => item.id === cursor) + 1 : 0
      const page = items.slice(start, start + limit)
      const last = page[page.length - 1]
      return HttpResponse.json({
        items: page,
        nextCursor: start + limit < items.length && last ? last.id : null,
      })
    }),
  ]
}
