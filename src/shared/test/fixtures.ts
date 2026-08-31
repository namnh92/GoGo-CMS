import type {
  AuditEntry,
  Collection,
  CollectionItem,
  CmsPlaceDetail,
  Experiment,
  FeatureFlag,
  OpsKpis,
  RankingConfig,
  RankingEvaluation,
  SearchAnalytics,
  Taxonomy,
  FeatureFlagDefinition,
  CmsModerationReport,
  CmsModerationCheckin,
  CmsCommunityPlace,
} from '@/shared/api/contracts'
import type { ImportJob, ImportRow } from '@/shared/api/contracts-import'

/**
 * Dev/test fixtures. Vietnamese content on purpose — vi is the product
 * default and the layout has to survive real diacritics and real name length.
 * No real personal data: authors are pseudonymous handles.
 */

const now = Date.UTC(2026, 7, 27, 9, 0, 0)
const iso = (offsetMinutes: number) => new Date(now - offsetMinutes * 60_000).toISOString()

export const taxonomies: Taxonomy[] = [
  {
    id: 'tx-mood-quiet',
    kind: 'mood',
    key: 'quiet_peaceful',
    labels: { vi: 'Yên tĩnh', en: 'Quiet & peaceful' },
    sortOrder: 1,
    isActive: true,
    usageCount: 2814,
    synonyms: [
      { id: 'syn-1', term: 'yên lặng', locale: 'vi' },
      { id: 'syn-2', term: 'không ồn ào', locale: 'vi' },
      { id: 'syn-3', term: 'peaceful', locale: 'en' },
    ],
  },
  {
    id: 'tx-mood-energetic',
    kind: 'mood',
    key: 'high_energy',
    labels: { vi: 'Sống động', en: 'Energetic' },
    sortOrder: 2,
    isActive: true,
    usageCount: 1402,
    synonyms: [{ id: 'syn-4', term: 'nhộn nhịp', locale: 'vi' }],
  },
  {
    id: 'tx-mood-chill',
    kind: 'mood',
    key: 'chill_lounge',
    labels: { vi: 'Thư giãn', en: 'Relaxed lounge' },
    sortOrder: 3,
    isActive: false,
    usageCount: 0,
    synonyms: [],
  },
  {
    id: 'tx-cat-cafe',
    kind: 'category',
    key: 'cafe',
    labels: { vi: 'Cà phê', en: 'Cafe' },
    sortOrder: 1,
    isActive: true,
    usageCount: 6120,
    synonyms: [{ id: 'syn-5', term: 'quán cà phê', locale: 'vi' }],
  },
  {
    id: 'tx-cat-street-food',
    kind: 'category',
    key: 'street_food',
    labels: { vi: 'Ăn vặt vỉa hè', en: 'Street food' },
    sortOrder: 2,
    isActive: true,
    usageCount: 3980,
    synonyms: [],
  },
  {
    id: 'tx-set-workfriendly',
    kind: 'setting',
    key: 'work_friendly',
    labels: { vi: 'Ngồi làm việc được', en: 'Work friendly' },
    sortOrder: 1,
    isActive: true,
    usageCount: 1180,
    synonyms: [{ id: 'syn-6', term: 'có ổ cắm', locale: 'vi' }],
  },
  {
    id: 'tx-diet-vegan',
    kind: 'dietary',
    key: 'vegan',
    labels: { vi: 'Thuần chay', en: 'Vegan' },
    sortOrder: 1,
    isActive: true,
    usageCount: 214,
    synonyms: [],
  },
  {
    id: 'tx-acc-wheelchair',
    kind: 'accessibility',
    key: 'wheelchair_access',
    labels: { vi: 'Xe lăn tiếp cận được', en: 'Wheelchair access' },
    sortOrder: 1,
    isActive: true,
    usageCount: 96,
    synonyms: [],
  },
  {
    id: 'tx-spend-mid',
    kind: 'spending_style',
    key: 'mid_range',
    labels: { vi: 'Tầm trung', en: 'Mid range' },
    sortOrder: 2,
    isActive: true,
    usageCount: 4410,
    synonyms: [],
  },
  {
    id: 'tx-suit-couple',
    kind: 'suitability',
    key: 'couple_date',
    labels: { vi: 'Hẹn hò đôi', en: 'Couple date' },
    sortOrder: 1,
    isActive: true,
    usageCount: 5320,
    synonyms: [],
  },
]

/**
 * Catalog rows in the shape `GET /cms/places` actually returns
 * (`CmsPlaceListItem`): lean, no address, no taxonomy, one blended rating.
 */
export const places: CmsPlaceDetail[] = [
  {
    id: 'pl-chao-ban',
    name: 'Chào Bạn Cafe & Space',
    status: 'published',
    areaKey: 'hcm_q3',
    phone: '+84 28 3930 1234',
    website: 'https://chaoban.cafe',
    priceLevel: 2,
    confidence: 0.92,
    freshnessCheckedAt: iso(60 * 48),
    createdAt: iso(60 * 24 * 200),
    updatedAt: iso(120),
    // Everything below only exists on the mocked detail endpoint.
    description: 'Cà phê nhiều cây, ba tầng, phù hợp ngồi làm việc cả buổi.',
    addressText: '126 Nguyễn Thị Minh Khai, Quận 3, TP.HCM',
    lat: 10.7769,
    lng: 106.6953,
    avgVisitMinutes: 90,
    suitability: { couple: 0.9, group: 0.6 },
    isLodging: false,
    curatedRank: 3,
    taxonomyKeys: ['cafe', 'work_friendly', 'quiet_peaceful'],
    taxonomyIds: ['tx-cat-cafe', 'tx-set-workfriendly', 'tx-mood-quiet'],
    ratings: {
      provider: { rating: 4.8, count: 1240 },
      gogo: { rating: 4.9, count: 86 },
    },
    // 0 = Sunday … 6 = Saturday, matching GoGo-BE's `vnDayMinute()`.
    hours: [
      {
        dayOfWeek: 0,
        openMinute: 480,
        closeMinute: 1350,
        isOvernight: false,
        source: 'editor',
        verifiedAt: iso(60 * 24 * 3),
      },
      {
        dayOfWeek: 1,
        openMinute: 420,
        closeMinute: 1350,
        isOvernight: false,
        source: 'editor',
        verifiedAt: iso(60 * 24 * 3),
      },
      {
        dayOfWeek: 2,
        openMinute: 420,
        closeMinute: 1350,
        isOvernight: false,
        source: 'editor',
        verifiedAt: iso(60 * 24 * 3),
      },
      {
        dayOfWeek: 3,
        openMinute: 420,
        closeMinute: 1350,
        isOvernight: false,
        source: 'editor',
        verifiedAt: iso(60 * 24 * 3),
      },
      {
        dayOfWeek: 4,
        openMinute: 420,
        closeMinute: 1350,
        isOvernight: false,
        source: 'editor',
        verifiedAt: iso(60 * 24 * 3),
      },
      {
        dayOfWeek: 5,
        openMinute: 420,
        closeMinute: 1380,
        isOvernight: false,
        source: 'editor',
        verifiedAt: iso(60 * 24 * 3),
      },
      {
        dayOfWeek: 6,
        openMinute: 480,
        closeMinute: 1380,
        isOvernight: false,
        source: 'editor',
        verifiedAt: iso(60 * 24 * 3),
      },
    ],
    prices: [
      {
        id: 'pr-1',
        priceMin: 45_000,
        priceMax: 90_000,
        currency: 'VND',
        unit: 'per_person',
        source: 'editor',
        confidence: 0.9,
        verifiedAt: iso(60 * 24 * 3),
        createdAt: iso(60 * 24 * 3),
      },
    ],
    sources: [
      {
        id: 'src-1',
        provider: 'google_places',
        externalId: 'ChIJ_chao_ban_cafe',
        url: 'https://maps.google.com/?cid=chao-ban',
        attribution: 'Dữ liệu © Google',
        fetchedAt: iso(60 * 48),
      },
      {
        id: 'src-2',
        provider: 'editor',
        externalId: 'manual-2026-08-24',
        url: null,
        attribution: null,
        fetchedAt: iso(60 * 24 * 3),
      },
    ],
    media: [],
  },
  {
    id: 'pl-pho-bat-dan',
    name: 'Phở Bát Đàn',
    status: 'published',
    areaKey: 'hn_hoankiem',
    confidence: 0.78,
    freshnessCheckedAt: iso(60 * 24 * 14),
    createdAt: iso(60 * 24 * 180),
    updatedAt: iso(60 * 26),
    description: 'Phở bò truyền thống, xếp hàng tự bưng.',
    addressText: '49 Bát Đàn, Hoàn Kiếm, Hà Nội',
    lat: 21.0333,
    lng: 105.8452,
    avgVisitMinutes: 40,
    suitability: { couple: 0.9, group: 0.6 },
    isLodging: false,
    curatedRank: null,
    taxonomyKeys: ['street_food'],
    taxonomyIds: ['tx-cat-street-food'],
    ratings: {
      provider: { rating: 4.5, count: 8210 },
      gogo: { rating: 4.7, count: 41 },
    },
    hours: [],
    prices: [],
    sources: [
      {
        id: 'src-3',
        provider: 'google_places',
        externalId: 'ChIJ_pho_bat_dan',
        url: 'https://maps.google.com/?cid=pho-bat-dan',
        attribution: 'Dữ liệu © Google',
        fetchedAt: iso(60 * 24 * 14),
      },
    ],
    media: [],
  },
  {
    id: 'pl-tay-ho-sup',
    name: 'Tây Hồ Sunset SUP Club',
    status: 'review',
    areaKey: 'hn_tayho',
    confidence: 0.44,
    freshnessCheckedAt: null,
    createdAt: iso(60 * 24 * 20),
    updatedAt: iso(60 * 72),
    description: null,
    addressText: '11 Tứ Hoa, Tây Hồ, Hà Nội',
    lat: 21.0705,
    lng: 105.8221,
    avgVisitMinutes: 120,
    suitability: { couple: 0.9, group: 0.6 },
    isLodging: false,
    curatedRank: null,
    taxonomyKeys: ['high_energy'],
    taxonomyIds: ['tx-mood-energetic'],
    ratings: {
      provider: { rating: 4.2, count: 310 },
      gogo: { count: 0 },
    },
    hours: [],
    prices: [],
    sources: [],
    media: [],
  },
  {
    id: 'pl-goplay',
    name: 'GoPlay Entertainment',
    status: 'suspended',
    areaKey: 'hcm_q10',
    confidence: 0.35,
    freshnessCheckedAt: iso(60 * 24 * 120),
    createdAt: iso(60 * 24 * 300),
    updatedAt: iso(60 * 24 * 12),
    description: null,
    addressText: '812 Sư Vạn Hạnh, Quận 10, TP.HCM',
    lat: 10.7712,
    lng: 106.6702,
    avgVisitMinutes: 150,
    suitability: { couple: 0.9, group: 0.6 },
    isLodging: false,
    curatedRank: null,
    taxonomyKeys: ['high_energy'],
    taxonomyIds: ['tx-mood-energetic'],
    ratings: {
      provider: { rating: 4.1, count: 520 },
      gogo: { rating: 3.5, count: 12 },
    },
    hours: [],
    prices: [],
    sources: [],
    media: [],
  },
  {
    id: 'pl-com-tam-ba-ghien',
    name: 'Cơm Tấm Ba Ghiền',
    status: 'community_submitted',
    areaKey: 'hcm_phunhuan',
    confidence: 0.5,
    freshnessCheckedAt: null,
    createdAt: iso(60 * 5),
    updatedAt: iso(60 * 5),
    description: null,
    addressText: '84 Đặng Văn Ngữ, Phú Nhuận, TP.HCM',
    lat: 10.7955,
    lng: 106.6752,
    avgVisitMinutes: 45,
    suitability: { couple: 0.9, group: 0.6 },
    isLodging: false,
    curatedRank: null,
    taxonomyKeys: ['street_food'],
    taxonomyIds: ['tx-cat-street-food'],
    ratings: {
      provider: { rating: 4.4, count: 4100 },
      gogo: { count: 0 },
    },
    hours: [],
    prices: [],
    sources: [],
    media: [],
  },
]

/** Raw rows, exactly as `GET /cms/places/duplicates` returns them. */
export const duplicateRows = [
  {
    place_a: 'pl-chao-ban',
    place_b: 'pl-chao-ban-bistro',
    name_a: 'Chào Bạn Cafe & Space',
    name_b: 'Chào Bạn Bistro & Cafe',
    name_similarity: 0.94,
    distance_m: 38,
  },
]

/** Bare array of headers — the list endpoint returns no items and no cover. */
export const collections: Collection[] = [
  {
    id: 'col-cafe-q3',
    slug: 'top-cafe-song-ao-q3',
    locale: 'vi',
    title: 'Top cà phê sống ảo Quận 3',
    status: 'published',
    startsAt: iso(60 * 24 * 10),
    endsAt: null,
  },
  {
    id: 'col-hanoi-night',
    slug: 'an-dem-ha-noi',
    locale: 'vi',
    title: 'Ăn đêm Hà Nội',
    status: 'scheduled',
    startsAt: iso(-60 * 24),
    endsAt: iso(-60 * 24 * 30),
  },
]

/** Four independent pending lists, PII-light, exactly as the service builds them. */
/**
 * The per-type moderation queues (GoGo-BE#219). Each spans more than one page
 * and more than one status, so paging and every server filter are reachable
 * without hand-editing fixtures.
 */
export const moderationReportQueue: CmsModerationReport[] = Array.from(
  { length: 31 },
  (_, index) => {
    const nth = index + 1
    const targetType = (['place', 'review', 'member'] as const)[nth % 3]!
    return {
      id: `rep-${String(nth).padStart(3, '0')}`,
      status: nth % 9 === 0 ? ('actioned' as const) : ('open' as const),
      targetType,
      targetId: `4f0b8e10-0000-4000-8000-${String(400 + nth).padStart(12, '0')}`,
      reasonCode: (['spam', 'offensive', 'wrong_info'] as const)[nth % 3]!,
      note: nth % 4 === 0 ? null : `Người dùng báo cáo nội dung số ${nth}.`,
      reporterKind: (['user', 'guest', 'anonymous'] as const)[nth % 3]!,
      reporterUserId: null,
      decidedByAdminId: null,
      decisionReason: null,
      decidedAt: null,
      createdAt: iso(nth * 41),
    }
  },
)

export const moderationCheckinQueue: CmsModerationCheckin[] = Array.from(
  { length: 29 },
  (_, index) => {
    const nth = index + 1
    return {
      id: `chk-${String(nth).padStart(3, '0')}`,
      moderation: nth % 8 === 0 ? ('approved' as const) : ('pending' as const),
      rating: ((nth % 5) + 1) as 1 | 2 | 3 | 4 | 5,
      note: nth % 3 === 0 ? null : `Check-in thử số ${nth}, quán đúng như mô tả.`,
      tags: nth % 2 === 0 ? ['checkin_tag.good_value'] : [],
      photoCount: nth % 4,
      hasBill: nth % 5 === 0,
      planStopId: `4f0b8e10-0000-4000-8000-${String(500 + nth).padStart(12, '0')}`,
      placeId: `4f0b8e10-0000-4000-8000-${String(600 + nth).padStart(12, '0')}`,
      placeName: nth % 2 === 0 ? 'Chào Bạn Cafe & Space' : 'Lò Bánh Mì Cô Ba',
      memberId: `4f0b8e10-0000-4000-8000-${String(800 + nth).padStart(12, '0')}`,
      createdAt: iso(nth * 53),
    }
  },
)

export const communityPlaceQueue: CmsCommunityPlace[] = Array.from({ length: 27 }, (_, index) => {
  const nth = index + 1
  return {
    id: `com-${String(nth).padStart(3, '0')}`,
    name: nth % 2 === 0 ? `Quán Cà Phê Số ${nth}` : `Tiệm Bánh Số ${nth}`,
    addressText: `${nth} Nguyễn Huệ, Quận 1`,
    areaKey: nth % 2 === 0 ? 'hcm.q1' : 'hcm.q3',
    createdAt: iso(nth * 47),
  }
})

/** The six aggregates `CmsOpsService#kpis` returns — nothing more. */
export const opsKpis: OpsKpis = {
  placeFreshness: { fresh: 18_420, stale: 2_120, unknown: 700 },
  zeroResultsLast7d: 412,
  suggestionRunsLast7d: { succeeded: 1_884, failed: 240 },
  currentPlansOverBudget: 37,
  providerErrorsLast7d: 12,
  moderationBacklog: { reviews: 2, reports: 2 },
}

/**
 * Bounds travel with each config (`CmsRankingConfig`), so the console cannot
 * hold a slider range that the engine would reject.
 */
const SCORING_BOUNDS = {
  preferenceMatch: { min: 0, max: 1 },
  groupFairness: { min: 0, max: 1 },
  distanceDecay: { min: 0, max: 1 },
  budgetFit: { min: 0, max: 1 },
  freshness: { min: 0, max: 1 },
}

export const rankingConfigs: RankingConfig[] = [
  {
    id: 'rc-3',
    key: 'suggestion.scoring',
    version: 3,
    status: 'approved',
    weights: {
      preferenceMatch: 0.88,
      groupFairness: 0.62,
      distanceDecay: 0.7,
      budgetFit: 0.32,
      freshness: 0.45,
    },
    bounds: SCORING_BOUNDS,
    createdBy: { id: 'ad-2', displayName: 'vy.vo' },
    approvedBy: { id: 'ad-1', displayName: 'minh.anh' },
    activatedAt: null,
    createdAt: iso(90),
  },
  {
    id: 'rc-2',
    key: 'suggestion.scoring',
    version: 2,
    status: 'active',
    weights: {
      preferenceMatch: 0.85,
      groupFairness: 0.6,
      distanceDecay: 0.75,
      budgetFit: 0.3,
      freshness: 0.4,
    },
    bounds: SCORING_BOUNDS,
    createdBy: { id: 'ad-1', displayName: 'minh.anh' },
    approvedBy: { id: 'ad-2', displayName: 'vy.vo' },
    activatedAt: iso(105),
    createdAt: iso(120),
  },
  {
    id: 'rc-1',
    key: 'suggestion.scoring',
    version: 1,
    status: 'rolled_back',
    weights: {
      preferenceMatch: 0.8,
      groupFairness: 0.55,
      distanceDecay: 0.7,
      budgetFit: 0.35,
      freshness: 0.35,
    },
    bounds: SCORING_BOUNDS,
    createdBy: { id: 'ad-2', displayName: 'vy.vo' },
    approvedBy: { id: 'ad-1', displayName: 'minh.anh' },
    activatedAt: iso(60 * 24 * 14),
    createdAt: iso(60 * 24 * 14),
  },
]

/**
 * A candidate that mostly agrees with the baseline, with two runs skipped —
 * the case the console has to report honestly rather than round away.
 */
export const rankingEvaluation: RankingEvaluation = {
  configVersion: 3,
  baselineVersion: '2',
  runsEvaluated: 96,
  metrics: {
    top1Agreement: 0.83,
    top5Overlap: 0.91,
    newZeroResults: 1,
    meanCandidateCount: 14.2,
  },
  skipped: [
    { runId: 'run-0041', reason: 'NO_CANDIDATE_PASSES_HARD_FILTER' },
    { runId: 'run-0077', reason: 'SNAPSHOT_MISSING' },
  ],
}

/** SG-010 — one experiment running, one defined but switched off. */
export const experiments: Experiment[] = [
  {
    key: 'suggestion.scoring.ab',
    description: 'So sánh v3 với cấu hình đang chạy trên 20% phòng.',
    enabled: true,
    variants: { '3': 0.2 },
    controlShare: 0.8,
    updatedAt: iso(300),
  },
  {
    key: 'search.ranking.ab',
    description: 'Chưa bật — chưa có phiên bản search.ranking nào được duyệt.',
    enabled: false,
    variants: {},
    controlShare: 1,
    updatedAt: iso(60 * 24 * 6),
  },
]

/**
 * `GET /cms/feature-flags/catalog` — the registry. Covers all five value types,
 * and one key that refuses a per-platform override, so both branches of
 * `platformScoped` are reachable.
 */
export const featureFlagCatalog: FeatureFlagDefinition[] = [
  {
    key: 'suggestion.ai_refinement',
    valueType: 'boolean',
    defaultValue: false,
    description:
      'Cho phép AI tinh chỉnh trên tập ứng viên đã hợp lệ. Tắt để quay về kết quả deterministic.',
    platformScoped: false,
  },
  {
    key: 'ingest.auto_publish_community',
    valueType: 'boolean',
    defaultValue: false,
    description: 'Tự động xuất bản địa điểm do người dùng gửi sau khi verify.',
    platformScoped: false,
  },
  {
    key: 'app.minimum_version',
    valueType: 'version',
    defaultValue: '1.0.0',
    description: 'Phiên bản tối thiểu còn được phép dùng app.',
    platformScoped: true,
  },
  {
    key: 'app.maintenance_message',
    valueType: 'string',
    defaultValue: '',
    description: 'Câu hiển thị khi app ở chế độ bảo trì. Rỗng nghĩa là không hiện gì.',
    platformScoped: true,
  },
  {
    key: 'suggestion.recommendation_limit',
    valueType: 'number',
    defaultValue: 0,
    description: 'Số gợi ý tối đa mỗi phòng. 0 nghĩa là dùng mặc định của engine.',
    platformScoped: false,
  },
  {
    key: 'search.ranking_overrides',
    valueType: 'json',
    defaultValue: {},
    description: 'Ghi đè trọng số tìm kiếm theo thành phố.',
    platformScoped: false,
  },
]

/**
 * Stored overrides. One key carries both an unscoped row and a narrower
 * `(production, ios)` row, and one row is `known: false` — a value left behind
 * by a feature that has since been removed.
 */
export const featureFlags: FeatureFlag[] = [
  {
    key: 'suggestion.ai_refinement',
    valueType: 'boolean',
    environment: 'all',
    platform: 'all',
    enabled: true,
    value: true,
    payload: null,
    description:
      'Cho phép AI tinh chỉnh trên tập ứng viên đã hợp lệ. Tắt để quay về kết quả deterministic.',
    known: true,
    updatedBy: { id: 'ad-1', displayName: 'minh.anh' },
    updatedAt: iso(240),
  },
  {
    key: 'app.minimum_version',
    valueType: 'version',
    environment: 'all',
    platform: 'all',
    enabled: true,
    value: '2.4.0',
    payload: null,
    description: 'Phiên bản tối thiểu còn được phép dùng app.',
    known: true,
    updatedBy: { id: 'ad-2', displayName: 'vy.vo' },
    updatedAt: iso(60 * 24 * 4),
  },
  {
    key: 'app.minimum_version',
    valueType: 'version',
    environment: 'production',
    platform: 'ios',
    enabled: true,
    value: '2.6.1',
    payload: null,
    description: 'Phiên bản tối thiểu còn được phép dùng app.',
    known: true,
    updatedBy: { id: 'ad-1', displayName: 'minh.anh' },
    updatedAt: iso(60 * 8),
  },
  {
    key: 'suggestion.recommendation_limit',
    valueType: 'number',
    environment: 'all',
    platform: 'all',
    // Explicitly configured to zero — not the same as unconfigured, which is
    // the distinction the catalog's default exists to make visible.
    enabled: true,
    value: 0,
    payload: null,
    description: 'Số gợi ý tối đa mỗi phòng. 0 nghĩa là dùng mặc định của engine.',
    known: true,
    updatedBy: { id: 'ad-2', displayName: 'vy.vo' },
    updatedAt: iso(60 * 24 * 9),
  },
  {
    key: 'legacy.map_provider_fallback',
    valueType: 'string',
    environment: 'all',
    platform: 'all',
    enabled: true,
    value: 'mapbox',
    payload: null,
    description: null,
    // The feature that read this is gone; the row is left behind.
    known: false,
    updatedBy: { id: 'ad-1', displayName: 'minh.anh' },
    updatedAt: iso(60 * 24 * 200),
  },
]

/**
 * Seven days of search, including one term below the naming floor — the row
 * the console must still count without printing the text.
 */
export const searchAnalytics: SearchAnalytics = {
  days: 7,
  totals: {
    searches: 18_402,
    zeroResults: 412,
    zeroResultRate: 0.0224,
    avgResults: 11.4,
    avgLatencyMs: 186,
  },
  trend: [
    { day: '2026-08-21', searches: 2_410, zeroResults: 44, zeroResultRate: 0.0183 },
    { day: '2026-08-22', searches: 2_680, zeroResults: 51, zeroResultRate: 0.019 },
    { day: '2026-08-23', searches: 3_020, zeroResults: 88, zeroResultRate: 0.0291 },
    { day: '2026-08-24', searches: 2_940, zeroResults: 74, zeroResultRate: 0.0252 },
    { day: '2026-08-25', searches: 2_360, zeroResults: 49, zeroResultRate: 0.0208 },
    { day: '2026-08-26', searches: 2_512, zeroResults: 58, zeroResultRate: 0.0231 },
    { day: '2026-08-27', searches: 2_480, zeroResults: 48, zeroResultRate: 0.0194 },
  ],
  worstQueries: [
    { query: 'quán chay quận 7 mở khuya', searches: 96, zeroResults: 71, zeroResultRate: 0.7396 },
    { query: 'sân pickleball tây hồ', searches: 74, zeroResults: 48, zeroResultRate: 0.6486 },
    { query: 'cafe pet friendly đà lạt', searches: 61, zeroResults: 33, zeroResultRate: 0.541 },
  ],
  hiddenBelowFloor: { terms: 214, searches: 486, zeroResults: 122 },
}

export const importJobs: ImportJob[] = [
  {
    id: '4f0b8e10-0000-4000-8000-000000000209',
    status: 'review_required',
    mode: 'create_drafts',
    sourceType: 'xlsx',
    sourceFileName: 'hcm_q3_cafe_batch4.xlsx',
    totals: { rows: 500, processed: 234, success: 210, warnings: 18, failed: 6 },
    createdAt: iso(45),
    completedAt: null,
    createdBy: 'huy.ng',
    defaultCity: 'Hồ Chí Minh',
    rowsByStatus: { needs_confirmation: 12, duplicate: 4, ready: 210, failed: 6, pending: 266 },
    startedAt: iso(44),
    cancelledAt: null,
    reused: false,
    unmappedHeaders: ['ghi_chu_noi_bo'],
  },
  {
    id: '4f0b8e10-0000-4000-8000-000000000208',
    status: 'completed',
    mode: 'publish_approved',
    sourceType: 'csv',
    sourceFileName: 'chuoi_tra_sua_audit.csv',
    totals: { rows: 1240, processed: 1240, success: 1226, warnings: 9, failed: 14 },
    createdAt: iso(60 * 26),
    completedAt: iso(60 * 25),
    createdBy: 'vy.vo',
    defaultCity: null,
    rowsByStatus: { imported: 1226, failed: 14 },
    startedAt: iso(60 * 26),
    cancelledAt: null,
    reused: false,
    unmappedHeaders: [],
  },
  {
    id: '4f0b8e10-0000-4000-8000-000000000207',
    status: 'paused_provider_quota',
    mode: 'create_drafts',
    sourceType: 'google_sheet',
    sourceFileName: 'dalat_homestay_geocoded',
    totals: { rows: 300, processed: 22, success: 20, warnings: 2, failed: 0 },
    createdAt: iso(60 * 72),
    completedAt: null,
    createdBy: 'minh.anh',
    defaultCity: 'Đà Lạt',
    rowsByStatus: { pending: 278, ready: 20 },
    startedAt: iso(60 * 72),
    cancelledAt: null,
    reused: false,
    unmappedHeaders: [],
  },
]

export const importRows: Record<string, ImportRow[]> = {
  [importJobs[0]!.id]: [
    {
      id: 'row-12',
      rowNumber: 12,
      sourceRowId: '12',
      status: 'needs_confirmation',
      normalized: {
        name: 'Cộng Cà Phê',
        address: '120 Nguyễn Thị Minh Khai',
        city: 'Hồ Chí Minh',
        category: 'cafe',
      },
      resolvedGooglePlaceId: null,
      matchedPlaceId: null,
      matchedPlaceName: null,
      matchConfidence: 0.82,
      matchReasons: ['MULTIPLE_BRANCHES', 'EXACT_NAME_CITY'],
      candidates: [
        {
          googlePlaceId: 'ChIJ_cong_q3',
          name: 'Cộng Cà Phê – Nguyễn Thị Minh Khai',
          address: '120 Nguyễn Thị Minh Khai, Quận 3',
          confidence: 0.86,
          lat: 10.7771,
          lng: 106.6942,
          ratingCount: 1980,
          photoUrl: null,
          fetchedAt: iso(45),
          attributions: ['Dữ liệu © Google'],
        },
        {
          googlePlaceId: 'ChIJ_cong_q1',
          name: 'Cộng Cà Phê – Lý Tự Trọng',
          address: '26 Lý Tự Trọng, Quận 1',
          confidence: 0.71,
          lat: 10.7801,
          lng: 106.7002,
          ratingCount: 2410,
          photoUrl: null,
          fetchedAt: iso(45),
          attributions: ['Dữ liệu © Google'],
        },
      ],
      errors: [],
      warnings: [
        {
          code: 'DISTRICT_MISMATCH',
          field: 'district',
          message: 'Quận trong nguồn khác quận nhà cung cấp',
        },
      ],
    },
    {
      id: 'row-13',
      rowNumber: 13,
      sourceRowId: '13',
      status: 'ready',
      normalized: {
        name: 'The Coffee House Cao Thắng',
        address: '86 Cao Thắng',
        city: 'Hồ Chí Minh',
      },
      resolvedGooglePlaceId: 'ChIJ_tch_caothang',
      matchedPlaceId: null,
      matchedPlaceName: null,
      matchConfidence: 0.99,
      matchReasons: ['EXACT_PROVIDER_ID'],
      candidates: [],
      errors: [],
      warnings: [],
    },
    {
      id: 'row-14',
      rowNumber: 14,
      sourceRowId: '14',
      status: 'duplicate',
      normalized: {
        name: 'Chào Bạn Cafe',
        address: '126 Nguyễn Thị Minh Khai',
        city: 'Hồ Chí Minh',
      },
      resolvedGooglePlaceId: 'ChIJ_chao_ban',
      matchedPlaceId: 'pl-chao-ban',
      matchedPlaceName: 'Chào Bạn Cafe & Space',
      matchConfidence: 0.97,
      matchReasons: ['EXACT_PROVIDER_ID'],
      candidates: [],
      errors: [],
      warnings: [],
    },
    {
      id: 'row-15',
      rowNumber: 15,
      sourceRowId: '15',
      status: 'validation_failed',
      normalized: { name: 'Quán không tên', address: '' },
      resolvedGooglePlaceId: null,
      matchedPlaceId: null,
      matchedPlaceName: null,
      matchConfidence: null,
      matchReasons: [],
      candidates: [],
      errors: [{ code: 'ADDRESS_REQUIRED', field: 'address', message: 'Thiếu địa chỉ' }],
      warnings: [],
    },
    {
      id: 'row-16',
      rowNumber: 16,
      sourceRowId: '16',
      status: 'unresolved',
      normalized: { name: 'Cafe Tầng Thượng 3B', address: 'Ngõ 12 Trần Quốc Toản' },
      resolvedGooglePlaceId: null,
      matchedPlaceId: null,
      matchedPlaceName: null,
      matchConfidence: 0.42,
      matchReasons: ['LOW_CONFIDENCE'],
      candidates: [],
      errors: [
        { code: 'PLACE_NOT_FOUND', field: null, message: 'Không tìm thấy trên nhà cung cấp' },
      ],
      warnings: [],
    },
  ],
}

/**
 * `CmsAuditEntry` rows. The break-glass entry carries the fields incident
 * review actually needs; `ipAddress` appears only on entries a mocked
 * ops_admin would receive, which is how the real endpoint behaves.
 */
export const auditEntries: AuditEntry[] = [
  {
    id: 'au-1',
    action: 'place.updated',
    actorType: 'admin',
    actorId: 'ad-3',
    actorRole: 'editor',
    resourceType: 'place',
    resourceId: 'pl-chao-ban',
    occurredAt: iso(120),
    diff: {
      before: { name: 'Chao Ban Cafe', avgVisitMinutes: 60 },
      after: { name: 'Chào Bạn Cafe & Space', avgVisitMinutes: 90 },
    },
    breakGlass: false,
    requestId: 'req-8ac31f',
    authorizationPath: 'exact_role',
  },
  {
    id: 'au-2',
    action: 'place.status_changed',
    actorType: 'admin',
    actorId: 'ad-2',
    actorRole: 'editor',
    resourceType: 'place',
    resourceId: 'pl-chao-ban',
    occurredAt: iso(60 * 24 * 3),
    diff: { before: { status: 'review' }, after: { status: 'published' } },
    breakGlass: false,
    requestId: 'req-1b7702',
    authorizationPath: 'exact_role',
  },
  {
    id: 'au-3',
    action: 'place.emergency_suspended',
    actorType: 'admin',
    actorId: 'ad-4',
    actorRole: 'moderator',
    resourceType: 'place',
    resourceId: 'pl-goplay',
    occurredAt: iso(60 * 24 * 12),
    diff: {
      breakGlass: true,
      role: 'moderator',
      before: { status: 'published' },
      after: { status: 'suspended' },
    },
    reason: 'Báo chí đưa tin sự cố an toàn, gỡ tạm chờ xác minh.',
    breakGlass: true,
    requestId: 'req-c40e19',
    ipAddress: '10.20.4.51',
    authorizationPath: 'super_admin_bypass',
  },
]

/** GoGo-BE#161 — the ordered list behind a collection, with each place's status. */
export const collectionItems: Record<string, CollectionItem[]> = {
  'col-cafe-q3': [
    {
      position: 0,
      placeId: 'pl-chao-ban',
      name: 'Chào Bạn Cafe & Space',
      addressText: '126 Nguyễn Thị Minh Khai, Quận 3, TP.HCM',
      status: 'published',
    },
    {
      position: 1,
      placeId: 'pl-goplay',
      name: 'GoPlay Entertainment',
      addressText: '812 Sư Vạn Hạnh, Quận 10, TP.HCM',
      // Pinned, but no longer published — the curator has to see that.
      status: 'suspended',
    },
  ],
}

/** PI-CMS-007 — three pending proposals; the first is the popular one. */
export const placeSubmissions = [
  {
    id: '9a1d0c00-0000-4000-8000-000000000001',
    googlePlaceId: 'ChIJpopular',
    status: 'pending' as const,
    submissionCount: 4,
    categoryKey: 'cafe',
    estimatedPrice: { min: 60_000, max: 120_000, unit: 'per_person' },
    vibeKeys: ['chill'],
    note: 'Quán mới mở, view đẹp',
    roomId: null,
    resultPlaceId: null,
    resultPlaceName: null,
    fromRegisteredUser: true,
    createdAt: '2026-08-27T02:00:00.000Z',
    decidedAt: null,
    decisionReason: null,
  },
  {
    id: '9a1d0c00-0000-4000-8000-000000000002',
    googlePlaceId: 'ChIJguest',
    status: 'pending' as const,
    submissionCount: 1,
    categoryKey: null,
    estimatedPrice: null,
    vibeKeys: [],
    note: null,
    roomId: '11111111-2222-4333-8444-555555555555',
    resultPlaceId: null,
    resultPlaceName: null,
    fromRegisteredUser: false,
    createdAt: '2026-08-27T01:00:00.000Z',
    decidedAt: null,
    decisionReason: null,
  },
]

export const decidedSubmissions = [
  {
    ...placeSubmissions[1]!,
    id: '9a1d0c00-0000-4000-8000-000000000003',
    status: 'rejected' as const,
    decidedAt: '2026-08-27T03:00:00.000Z',
    decisionReason: 'trùng địa điểm đã có',
  },
]

/**
 * `GET /cms/moderation/reviews` (GoGo-BE#219). Deliberately spans more than one
 * page and more than one status, so paging, the status filter and the
 * `reported` filter are all reachable without hand-editing fixtures.
 */
type ReviewQueueStatus = 'pending' | 'published' | 'rejected' | 'removed' | 'hidden'

export const moderationReviewQueue = Array.from({ length: 32 }, (_, index) => {
  const nth = index + 1
  const published = nth % 7 === 0
  return {
    id: `rev-${String(nth).padStart(3, '0')}`,
    // Widened on purpose: a decision moves a row to `rejected`, and the mock
    // has to be able to write that back.
    status: (published ? 'published' : 'pending') as ReviewQueueStatus,
    rating: ((nth % 5) + 1) as 1 | 2 | 3 | 4 | 5,
    text:
      nth % 4 === 0
        ? null
        : `Đánh giá thử số ${nth} — quán ổn, nhân viên thân thiện, chỗ ngồi hơi chật.`,
    placeId: `4f0b8e10-0000-4000-8000-${String(300 + nth).padStart(12, '0')}`,
    placeName: nth % 2 === 0 ? 'Chào Bạn Cafe & Space' : 'Lò Bánh Mì Cô Ba',
    planId: null,
    authorUserId: `4f0b8e10-0000-4000-8000-${String(700 + nth).padStart(12, '0')}`,
    authorDisplayName: nth % 3 === 0 ? 'Ngọc Anh' : 'Trần Bảo',
    openReportCount: nth % 6 === 0 ? 2 : 0,
    moderatedByAdminId: published ? '00000000-0000-4000-8000-0000000000aa' : null,
    moderationReason: published ? 'Nội dung hợp lệ.' : null,
    createdAt: iso(nth * 37),
    updatedAt: iso(nth * 30),
  }
})

/**
 * `GET /cms/auth/admins` (GoGo-BE#220). Spans two pages, both roles worth
 * filtering on, and both statuses, so paging and every filter are reachable
 * without hand-editing. One account has never signed in.
 */
type CmsAdminFixture = {
  id: string
  email: string
  displayName: string
  role: 'editor' | 'moderator' | 'ops_admin' | 'super_admin'
  status: 'active' | 'suspended'
  createdAt: string
  lastLoginAt: string | null
}

export const cmsAdmins: CmsAdminFixture[] = [
  {
    id: '00000000-0000-4000-8000-0000000000aa',
    email: 'boss@gogo.vn',
    displayName: 'Minh Anh Ng.',
    role: 'super_admin',
    status: 'active',
    createdAt: iso(60 * 24 * 300),
    lastLoginAt: iso(2),
  },
  {
    id: '00000000-0000-4000-8000-0000000000bb',
    email: 'ops@gogo.vn',
    displayName: 'Vy Vo',
    role: 'ops_admin',
    status: 'active',
    createdAt: iso(60 * 24 * 210),
    lastLoginAt: iso(30),
  },
  {
    id: '00000000-0000-4000-8000-0000000000cc',
    email: 'editor@gogo.vn',
    displayName: 'Huy Nguyen',
    role: 'editor',
    status: 'active',
    createdAt: iso(60 * 24 * 140),
    lastLoginAt: iso(90),
  },
  {
    id: '00000000-0000-4000-8000-0000000000dd',
    email: 'moderator@gogo.vn',
    displayName: 'Lan Tran',
    role: 'moderator',
    status: 'active',
    createdAt: iso(60 * 24 * 90),
    lastLoginAt: iso(6),
  },
  {
    id: '00000000-0000-4000-8000-0000000000ee',
    email: 'cuu.nhan.su@gogo.vn',
    displayName: 'Đặng Quốc',
    role: 'editor',
    status: 'suspended',
    createdAt: iso(60 * 24 * 400),
    lastLoginAt: iso(60 * 24 * 45),
  },
  {
    id: '00000000-0000-4000-8000-0000000000ff',
    email: 'moi.tuyen@gogo.vn',
    displayName: 'Trần Bảo',
    role: 'moderator',
    status: 'active',
    createdAt: iso(30),
    // Never signed in — absent, not empty.
    lastLoginAt: null,
  },
]

/**
 * `GET /cms/recommendations` (GoGo-BE#222). Spans two pages and every status,
 * so paging and each server filter are reachable without hand-editing.
 */
type RecommendationFixture = {
  id: string
  slug: string
  locale: string
  internalName: string
  title: string
  subtitle: string | null
  description: string | null
  audience: 'couple' | 'group' | 'family' | 'solo'
  areaKey: string | null
  priority: number
  status: 'draft' | 'scheduled' | 'published' | 'archived'
  startsAt: string | null
  endsAt: string | null
  placeCount: number
  taxonomies: { id: string; kind: 'category' | 'mood'; key: string }[]
  createdByAdminId: string | null
  createdAt: string
  updatedAt: string
  places: {
    position: number
    placeId: string
    name: string
    addressText: string | null
    status: string
  }[]
}

const RECOMMENDATION_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const
const RECOMMENDATION_AUDIENCES = ['couple', 'group', 'family', 'solo'] as const

export const cmsRecommendations: RecommendationFixture[] = Array.from(
  { length: 28 },
  (_, index) => {
    const nth = index + 1
    const status = RECOMMENDATION_STATUSES[nth % 4]!
    const places =
      status === 'published'
        ? [
            {
              position: 0,
              placeId: 'pl-chao-ban',
              name: 'Chào Bạn Cafe & Space',
              addressText: '12 Nguyễn Huệ, Quận 1',
              status: 'published',
            },
            {
              position: 1,
              placeId: 'pl-pho-bat-dan',
              name: 'Phở Bát Đàn',
              addressText: '49 Bát Đàn, Hoàn Kiếm',
              // A place that is not published sitting inside a published
              // recommendation is exactly what the contract wants visible
              // rather than a silently shorter list. The mock resolves the
              // real catalog status on write.
              status: 'review',
            },
          ]
        : []
    return {
      id: `rec-${String(nth).padStart(3, '0')}`,
      slug: `goi-y-so-${nth}`,
      locale: 'vi',
      internalName: `Gợi ý biên tập số ${nth}`,
      title: `Đi đâu cuối tuần này ${nth}`,
      subtitle: nth % 3 === 0 ? null : 'Chọn lọc bởi đội biên tập',
      description: null,
      audience: RECOMMENDATION_AUDIENCES[nth % 4]!,
      areaKey: nth % 2 === 0 ? 'hcm.q1' : 'hcm.q3',
      priority: (nth * 7) % 100,
      status,
      startsAt: null,
      endsAt: null,
      placeCount: places.length,
      taxonomies: [],
      createdByAdminId: null,
      createdAt: iso(nth * 61),
      updatedAt: iso(nth * 43),
      places,
    }
  },
)
