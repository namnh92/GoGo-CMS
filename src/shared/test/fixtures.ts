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
  CmsSafetyRule,
  CmsBanner,
  CmsCampaign,
  CmsOpsHealth,
  CmsOpsQueues,
  CmsOpsCosts,
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
  // Mirrors GoGo-BE `libs/modules/shared/feature-flags.ts` (BE-CMS-G3, #221)
  // key for key: the mock's job is to behave like the server, and the App
  // Control screen keys off these exact names.
  {
    key: 'maintenance_mode',
    valueType: 'boolean',
    defaultValue: false,
    description: 'App hiển thị màn bảo trì thay vì nội dung.',
    platformScoped: true,
  },
  {
    key: 'minimum_app_version',
    valueType: 'version',
    defaultValue: '0.0.0',
    description: 'Dưới mức này client bắt buộc cập nhật mới dùng tiếp.',
    platformScoped: true,
  },
  {
    key: 'recommended_app_version',
    valueType: 'version',
    defaultValue: '0.0.0',
    description: 'Dưới mức này client chỉ gợi ý cập nhật, vẫn dùng được.',
    platformScoped: true,
  },
  {
    key: 'recommendation_limit',
    valueType: 'number',
    defaultValue: 20,
    description: 'Số gợi ý một bề mặt xin mỗi lần.',
    platformScoped: false,
  },
  {
    key: 'feature_group_planning',
    valueType: 'boolean',
    defaultValue: false,
    description: 'Bề mặt lập kế hoạch nhóm mở cho client.',
    platformScoped: true,
  },
  {
    key: 'feature_ai_recommendation',
    valueType: 'boolean',
    defaultValue: false,
    description: 'AI tinh chỉnh gợi ý. Tắt là đường deterministic — nguồn chân lý dù bật hay tắt.',
    platformScoped: false,
  },
  {
    key: 'place_import.autopublish',
    valueType: 'boolean',
    defaultValue: false,
    description: 'Xuất bản địa điểm import mà không cần biên tập duyệt.',
    platformScoped: false,
  },
  {
    key: 'place_import.rules',
    valueType: 'json',
    defaultValue: { minReviews: 10, minRating: 3.5, autoPublish: false },
    description: 'Ngưỡng một địa điểm cộng đồng phải vượt qua.',
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
    key: 'feature_ai_recommendation',
    valueType: 'boolean',
    environment: 'all',
    platform: 'all',
    enabled: true,
    value: true,
    payload: null,
    description: 'AI tinh chỉnh gợi ý. Tắt là đường deterministic — nguồn chân lý dù bật hay tắt.',
    known: true,
    updatedBy: { id: 'ad-1', displayName: 'minh.anh' },
    updatedAt: iso(240),
  },
  {
    key: 'minimum_app_version',
    valueType: 'version',
    environment: 'all',
    platform: 'all',
    enabled: true,
    value: '2.4.0',
    payload: null,
    description: 'Dưới mức này client bắt buộc cập nhật mới dùng tiếp.',
    known: true,
    updatedBy: { id: 'ad-2', displayName: 'vy.vo' },
    updatedAt: iso(60 * 24 * 4),
  },
  {
    key: 'minimum_app_version',
    valueType: 'version',
    environment: 'production',
    platform: 'ios',
    enabled: true,
    value: '2.6.1',
    payload: null,
    description: 'Dưới mức này client bắt buộc cập nhật mới dùng tiếp.',
    known: true,
    updatedBy: { id: 'ad-1', displayName: 'minh.anh' },
    updatedAt: iso(60 * 8),
  },
  {
    key: 'recommendation_limit',
    valueType: 'number',
    environment: 'all',
    platform: 'all',
    // Explicitly configured to zero — not the same as unconfigured, which is
    // the distinction the catalog's default exists to make visible.
    enabled: true,
    value: 0,
    payload: null,
    description: 'Số gợi ý một bề mặt xin mỗi lần.',
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
  /** #248 — enrollment status only, never anything about the secret. */
  mfaEnrolled: boolean
  /** A temporary password is outstanding. */
  mustChangePassword: boolean
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
    mfaEnrolled: true,
    mustChangePassword: false,
  },
  {
    id: '00000000-0000-4000-8000-0000000000bb',
    email: 'ops@gogo.vn',
    displayName: 'Vy Vo',
    role: 'ops_admin',
    status: 'active',
    createdAt: iso(60 * 24 * 210),
    lastLoginAt: iso(30),
    mfaEnrolled: true,
    mustChangePassword: false,
  },
  {
    id: '00000000-0000-4000-8000-0000000000cc',
    email: 'editor@gogo.vn',
    displayName: 'Huy Nguyen',
    role: 'editor',
    status: 'active',
    createdAt: iso(60 * 24 * 140),
    lastLoginAt: iso(90),
    mfaEnrolled: false,
    mustChangePassword: true,
  },
  {
    id: '00000000-0000-4000-8000-0000000000dd',
    email: 'moderator@gogo.vn',
    displayName: 'Lan Tran',
    role: 'moderator',
    status: 'active',
    createdAt: iso(60 * 24 * 90),
    lastLoginAt: iso(6),
    mfaEnrolled: false,
    mustChangePassword: false,
  },
  {
    id: '00000000-0000-4000-8000-0000000000ee',
    email: 'cuu.nhan.su@gogo.vn',
    displayName: 'Đặng Quốc',
    role: 'editor',
    status: 'suspended',
    createdAt: iso(60 * 24 * 400),
    lastLoginAt: iso(60 * 24 * 45),
    mfaEnrolled: false,
    mustChangePassword: false,
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
    mfaEnrolled: false,
    mustChangePassword: false,
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

/**
 * `GET /cms/plan-templates` (GoGo-BE#223). Two pages, every status, and one
 * published template with ordered stops so reordering is exercisable.
 */
type PlanTemplateFixture = {
  id: string
  slug: string
  locale: string
  internalName: string
  title: string
  description: string | null
  audience: 'couple' | 'group' | 'family' | 'solo' | null
  areaKey: string | null
  budget: { min: number; max: number; currency: string; scope: 'per_person' | 'per_group' } | null
  expectedDurationMinutes: number | null
  status: 'draft' | 'published' | 'archived'
  stopCount: number
  taxonomies: { id: string; kind: 'category' | 'mood'; key: string }[]
  createdByAdminId: string | null
  createdAt: string
  updatedAt: string
  stops: {
    id: string
    position: number
    categoryTaxonomyId: string | null
    categoryKey: string
    preferredPlaceId: string | null
    preferredPlaceName: string | null
    isOptional: boolean
    expectedDurationMinutes: number | null
    budget: {
      min: number
      max: number
      currency: string
      scope: 'per_person' | 'per_group'
    } | null
    note: string | null
  }[]
}

const PLAN_TEMPLATE_STATUSES = ['draft', 'published', 'archived'] as const

export const cmsPlanTemplates: PlanTemplateFixture[] = Array.from({ length: 27 }, (_, index) => {
  const nth = index + 1
  const status = PLAN_TEMPLATE_STATUSES[nth % 3]!
  const stops =
    status === 'published'
      ? [
          {
            id: `stop-${nth}-1`,
            position: 0,
            categoryTaxonomyId: 'tx-cat-cafe',
            categoryKey: 'cafe',
            preferredPlaceId: 'pl-chao-ban',
            preferredPlaceName: 'Chào Bạn Cafe & Space',
            isOptional: false,
            expectedDurationMinutes: 90,
            // Minor units with currency and scope, never a bare number.
            budget: { min: 50_000, max: 120_000, currency: 'VND', scope: 'per_person' as const },
            note: null,
          },
          {
            id: `stop-${nth}-2`,
            position: 1,
            categoryTaxonomyId: 'tx-cat-cafe',
            categoryKey: 'cafe',
            preferredPlaceId: null,
            preferredPlaceName: null,
            isOptional: true,
            expectedDurationMinutes: 45,
            budget: null,
            note: null,
          },
        ]
      : []
  return {
    id: `tpl-${String(nth).padStart(3, '0')}`,
    slug: `mau-lich-trinh-${nth}`,
    locale: 'vi',
    internalName: `Mẫu lịch trình số ${nth}`,
    title: `Buổi hẹn ${nth}`,
    description: null,
    audience: (['couple', 'group', 'family', 'solo'] as const)[nth % 4]!,
    areaKey: nth % 2 === 0 ? 'hcm.q1' : 'hcm.q3',
    budget:
      nth % 3 === 0
        ? { min: 200_000, max: 500_000, currency: 'VND', scope: 'per_group' as const }
        : null,
    expectedDurationMinutes: 60 + (nth % 5) * 30,
    status,
    stopCount: stops.length,
    taxonomies: [],
    createdByAdminId: null,
    createdAt: iso(nth * 59),
    updatedAt: iso(nth * 37),
    stops,
  }
})

/**
 * `GET /cms/safety-rules` (GoGo-BE#225).
 *
 * Spans every rule type, both ends of the severity scale and all three
 * statuses, so each server filter is reachable without hand-editing — and
 * `conditions` carries a real shape per type, including one rule that leaves
 * an optional field unset so "absent" stays visible in the editor.
 */
export const cmsSafetyRules: CmsSafetyRule[] = [
  {
    id: 'sr-blocked-words',
    name: 'Chặn từ ngữ thô tục trong đánh giá',
    description: 'Danh sách từ khoá dùng chung cho đánh giá và check-in.',
    ruleType: 'blocked_words',
    trigger: 'review_created',
    conditions: {
      terms: ['lừa đảo', 'rác rưởi', 'đồ ngu'],
      matchMode: 'substring',
      caseSensitive: false,
    },
    action: 'flag_for_review',
    severity: 'medium',
    status: 'active',
    priority: 10,
    reasonCode: 'blocked_words_review',
    createdBy: { id: 'adm-ops', displayName: 'Ngô Ops' },
    createdAt: iso(60 * 24 * 12),
    updatedAt: iso(60 * 20),
  },
  {
    id: 'sr-spam-links',
    name: 'Đánh giá nhồi link',
    description: null,
    ruleType: 'spam',
    // `minAccountAgeHours` is deliberately absent: the editor must show it as
    // unset rather than as the number the server default happens to be.
    conditions: { maxLinks: 3, windowHours: 24 },
    trigger: 'review_created',
    action: 'auto_hide',
    severity: 'high',
    status: 'active',
    priority: 20,
    reasonCode: 'spam_links_in_review',
    createdBy: { id: 'adm-ops', displayName: 'Ngô Ops' },
    createdAt: iso(60 * 24 * 9),
    updatedAt: iso(60 * 24 * 2),
  },
  {
    id: 'sr-review-abuse',
    name: 'Một tài khoản đánh giá quá nhiều',
    description: 'Chặn hành vi cày đánh giá cho cùng một địa điểm.',
    ruleType: 'review_abuse',
    conditions: { maxReviewsPerWindow: 20, windowHours: 24, maxReviewsPerPlace: 2 },
    trigger: 'review_created',
    action: 'require_moderation',
    severity: 'medium',
    status: 'disabled',
    priority: 30,
    reasonCode: 'review_flooding',
    createdBy: null,
    createdAt: iso(60 * 24 * 30),
    updatedAt: iso(60 * 24 * 5),
  },
  {
    id: 'sr-user-abuse',
    name: 'Tài khoản bị báo cáo nhiều lần',
    description: 'Chỉ tính báo cáo đã được kiểm duyệt viên chấp nhận.',
    ruleType: 'user_abuse',
    conditions: { maxReportsAgainstUser: 5, windowHours: 168, upheldOnly: true },
    trigger: 'report_created',
    // The one fixture that suspends: severity is `critical`, which is what
    // the server requires before it accepts this action at all.
    action: 'suspend_user',
    severity: 'critical',
    status: 'draft',
    priority: 5,
    reasonCode: 'repeat_offender_account',
    createdBy: { id: 'adm-ops', displayName: 'Ngô Ops' },
    createdAt: iso(60 * 24 * 3),
    updatedAt: iso(60 * 3),
  },
  {
    id: 'sr-repeated-reports',
    name: 'Nhiều người cùng báo cáo một nội dung',
    description: null,
    ruleType: 'repeated_reports',
    conditions: { minReports: 3, windowHours: 24, distinctReporters: true },
    trigger: 'report_created',
    action: 'auto_hide',
    severity: 'high',
    status: 'active',
    priority: 15,
    reasonCode: 'crowd_reported_content',
    createdBy: null,
    createdAt: iso(60 * 24 * 20),
    updatedAt: iso(60 * 24),
  },
  {
    id: 'sr-rate-limit-checkin',
    name: 'Giới hạn tần suất check-in',
    description: 'Một tài khoản không check-in quá 10 lần mỗi giờ.',
    ruleType: 'rate_limit',
    conditions: { action: 'checkin_create', limit: 10, windowSeconds: 3600 },
    trigger: 'checkin_created',
    action: 'block_action',
    severity: 'low',
    status: 'active',
    priority: 40,
    reasonCode: 'checkin_rate_limit',
    createdBy: { id: 'adm-ops', displayName: 'Ngô Ops' },
    createdAt: iso(60 * 24 * 15),
    updatedAt: iso(60 * 24 * 15),
  },
  {
    id: 'sr-abusive-content',
    name: 'Nội dung công kích cá nhân',
    description: null,
    ruleType: 'abusive_content',
    conditions: { terms: ['xúc phạm'], minReports: 2, windowHours: 48 },
    trigger: 'review_created',
    action: 'require_moderation',
    severity: 'medium',
    status: 'draft',
    priority: 25,
    reasonCode: 'personal_attack_content',
    createdBy: null,
    createdAt: iso(60 * 24 * 2),
    updatedAt: iso(60 * 24 * 2),
  },
]

/**
 * `GET /cms/banners` (GoGo-BE#224).
 *
 * Covers both placements, every lifecycle status and — importantly — one
 * banner whose window has closed, so `expired` is reachable without waiting
 * for a clock. `imageUrl` is null on one row: media hosting is not configured
 * in dev, and the console must render that absence rather than a broken image.
 */
export const cmsBanners: CmsBanner[] = [
  {
    id: 'bn-tet-hero',
    name: 'Hero Tết 2026',
    imageKey: 'cms/banner/adm-ops/tet-2026.jpg',
    imageUrl: 'https://images.gogo.test/banners/tet-2026.jpg',
    title: 'Hẹn hò ngày Tết',
    subtitle: 'Gợi ý quán mở xuyên Tết ở Hà Nội',
    ctaLabel: 'Xem gợi ý',
    destinationType: 'recommendation',
    destinationValue: 'rec-tet-ha-noi',
    audience: 'couple',
    placement: 'home_hero',
    startsAt: iso(60 * 24 * 3),
    endsAt: null,
    priority: 100,
    status: 'published',
    lifecycleStatus: 'published',
    createdByAdminId: 'adm-ops',
    createdAt: iso(60 * 24 * 20),
    updatedAt: iso(60 * 6),
  },
  {
    id: 'bn-cuoi-tuan',
    name: 'Cuối tuần gần nhà',
    // Hosting is not configured for this one — an honest null, not a URL
    // that would 404.
    imageKey: 'cms/banner/adm-ops/cuoi-tuan.png',
    imageUrl: null,
    title: 'Đi đâu cuối tuần?',
    subtitle: null,
    ctaLabel: 'Mở danh sách',
    destinationType: 'plan_template',
    destinationValue: 'pt-cuoi-tuan-ha-noi',
    audience: 'group',
    placement: 'home_secondary',
    startsAt: null,
    endsAt: null,
    priority: 50,
    status: 'draft',
    lifecycleStatus: 'draft',
    createdByAdminId: 'adm-ops',
    createdAt: iso(60 * 24 * 6),
    updatedAt: iso(60 * 24),
  },
  {
    id: 'bn-noel-cu',
    name: 'Noel 2025',
    imageKey: 'cms/banner/adm-ops/noel-2025.jpg',
    imageUrl: 'https://images.gogo.test/banners/noel-2025.jpg',
    title: 'Đêm Giáng sinh',
    subtitle: 'Quán ấm cúng cho hai người',
    ctaLabel: null,
    destinationType: 'external_url',
    destinationValue: 'https://gogo.vn/noel',
    audience: 'couple',
    placement: 'home_hero',
    startsAt: iso(60 * 24 * 250),
    // The window closed: the server reports `expired` while the lifecycle
    // status a person set is still `published`.
    endsAt: iso(60 * 24 * 240),
    priority: 80,
    status: 'expired',
    lifecycleStatus: 'published',
    createdByAdminId: 'adm-ops',
    createdAt: iso(60 * 24 * 260),
    updatedAt: iso(60 * 24 * 240),
  },
  {
    id: 'bn-sap-chay',
    name: 'Lễ hội ẩm thực tháng 9',
    imageKey: 'cms/banner/adm-ops/le-hoi-thang-9.webp',
    imageUrl: 'https://images.gogo.test/banners/le-hoi-thang-9.webp',
    title: 'Lễ hội ẩm thực',
    subtitle: 'Ba ngày cuối tuần này',
    ctaLabel: 'Đặt lịch đi',
    destinationType: 'place',
    destinationValue: 'pl-pho-bat-dan',
    audience: null,
    placement: 'home_secondary',
    startsAt: iso(-60 * 24 * 2),
    endsAt: iso(-60 * 24 * 9),
    priority: 60,
    status: 'scheduled',
    lifecycleStatus: 'scheduled',
    createdByAdminId: 'adm-ops',
    createdAt: iso(60 * 24 * 2),
    updatedAt: iso(60 * 24 * 2),
  },
  {
    id: 'bn-luu-tru',
    name: 'Hè 2025 (đã lưu trữ)',
    imageKey: 'cms/banner/adm-ops/he-2025.jpg',
    imageUrl: 'https://images.gogo.test/banners/he-2025.jpg',
    title: 'Trốn nóng',
    subtitle: null,
    ctaLabel: null,
    destinationType: 'none',
    destinationValue: null,
    audience: 'family',
    placement: 'home_hero',
    startsAt: null,
    endsAt: null,
    priority: 10,
    status: 'archived',
    lifecycleStatus: 'archived',
    createdByAdminId: null,
    createdAt: iso(60 * 24 * 400),
    updatedAt: iso(60 * 24 * 300),
  },
]

/**
 * `GET /cms/campaigns` (GoGo-BE#226).
 *
 * One campaign per status, so every branch of the delivery panel is reachable:
 * a draft that can still be edited, a scheduled one that can be cancelled, one
 * mid-send that cannot, a finished one with real counters, and a failed one
 * carrying `lastError`. Destination ids are UUIDs because that is what the
 * server validates them as.
 */
export const cmsCampaigns: CmsCampaign[] = [
  {
    id: 'cp-cuoi-tuan',
    name: 'Nhắc cuối tuần tháng 9',
    title: 'Cuối tuần này đi đâu?',
    body: 'Ba gợi ý gần bạn, mở cửa cả hai ngày.',
    imageKey: null,
    ctaLabel: 'Xem gợi ý',
    audienceType: 'all',
    audienceFilter: {},
    destinationType: 'recommendation',
    destinationValue: '3f1c2b8a-9d4e-4a71-b0c5-8e2f6a1d7c93',
    status: 'draft',
    scheduledAt: null,
    startedAt: null,
    completedAt: null,
    // Nothing has run, so there is no recipient count — absent, not zero.
    recipientCount: null,
    sentCount: 0,
    failedCount: 0,
    lastError: null,
    testSendRequestedAt: null,
    testSendCompletedAt: null,
    createdByAdminId: 'adm-ops',
    createdAt: iso(60 * 24 * 2),
    updatedAt: iso(60 * 5),
  },
  {
    id: 'cp-le-2-9',
    name: 'Lễ 2/9',
    title: 'Nghỉ lễ rồi!',
    body: 'Mở GoGo, chốt chỗ trước khi kín bàn.',
    imageKey: 'cms/campaign_image/adm-ops/le-2-9.jpg',
    ctaLabel: 'Mở app',
    audienceType: 'platform',
    audienceFilter: { platform: 'ios' },
    destinationType: 'home',
    destinationValue: null,
    status: 'scheduled',
    scheduledAt: iso(-60 * 24),
    startedAt: null,
    completedAt: null,
    recipientCount: null,
    sentCount: 0,
    failedCount: 0,
    lastError: null,
    testSendRequestedAt: iso(60 * 2),
    testSendCompletedAt: iso(60 * 2 - 1),
    createdByAdminId: 'adm-ops',
    createdAt: iso(60 * 24 * 4),
    updatedAt: iso(60 * 24),
  },
  {
    id: 'cp-dang-gui',
    name: 'Khảo sát trải nghiệm',
    title: 'Một phút cho GoGo nhé?',
    body: 'Trả lời 3 câu, giúp bọn mình gợi ý đúng hơn.',
    imageKey: null,
    ctaLabel: null,
    audienceType: 'couple',
    audienceFilter: {},
    destinationType: 'external_url',
    destinationValue: 'https://gogo.vn/khao-sat',
    // Mid-send: some messages are already on phones, so there is nothing to
    // recall and the console must not offer a cancel.
    status: 'sending',
    scheduledAt: iso(60 * 3),
    startedAt: iso(60 * 2),
    completedAt: null,
    recipientCount: 8420,
    sentCount: 5130,
    failedCount: 12,
    lastError: null,
    testSendRequestedAt: null,
    testSendCompletedAt: null,
    createdByAdminId: 'adm-ops',
    createdAt: iso(60 * 24 * 8),
    updatedAt: iso(30),
  },
  {
    id: 'cp-da-gui',
    name: 'Ra mắt mẫu lịch trình',
    title: 'Lịch trình dựng sẵn cho buổi hẹn',
    body: 'Chọn một mẫu, đổi vài chỗ, xong.',
    imageKey: 'cms/campaign_image/adm-ops/plan-templates.png',
    ctaLabel: 'Thử ngay',
    audienceType: 'group',
    audienceFilter: {},
    destinationType: 'plan_template',
    destinationValue: '7b9e4c15-2af6-4d38-9c17-5e0b3d84a2f6',
    status: 'sent',
    scheduledAt: iso(60 * 24 * 14),
    startedAt: iso(60 * 24 * 14),
    completedAt: iso(60 * 24 * 14 - 20),
    recipientCount: 12908,
    sentCount: 12744,
    failedCount: 164,
    lastError: null,
    testSendRequestedAt: iso(60 * 24 * 15),
    testSendCompletedAt: iso(60 * 24 * 15 - 1),
    createdByAdminId: 'adm-ops',
    createdAt: iso(60 * 24 * 18),
    updatedAt: iso(60 * 24 * 14 - 20),
  },
  {
    id: 'cp-loi',
    name: 'Nhắc đánh giá sau buổi hẹn',
    title: 'Buổi hẹn thế nào?',
    body: 'Đánh giá nhanh để lần sau gợi ý sát hơn.',
    imageKey: null,
    ctaLabel: 'Đánh giá',
    audienceType: 'all',
    audienceFilter: {},
    destinationType: 'saved',
    destinationValue: null,
    status: 'failed',
    scheduledAt: iso(60 * 24 * 5),
    startedAt: iso(60 * 24 * 5),
    completedAt: null,
    recipientCount: 0,
    sentCount: 0,
    failedCount: 0,
    lastError: 'provider rejected the credential set (OneSignal 401)',
    testSendRequestedAt: null,
    testSendCompletedAt: null,
    createdByAdminId: 'adm-ops',
    createdAt: iso(60 * 24 * 6),
    updatedAt: iso(60 * 24 * 5),
  },
]

/**
 * `GET /cms/ops/health|queues|costs` (GoGo-BE#247).
 *
 * Health carries all four statuses — `unknown` included, because the console
 * must render "not measured" as its own state, never as healthy. One queue is
 * the Postgres outbox and one failed count is truncated, so both honesty
 * markers are reachable. Costs default to the truthful DEV shape: no source
 * connected — an empty list that must never render as zero.
 */
export const opsHealth: CmsOpsHealth = {
  services: [
    { key: 'api', status: 'healthy', latencyMs: 12, checkedAt: iso(1), detail: null },
    { key: 'db', status: 'healthy', latencyMs: 4, checkedAt: iso(1), detail: null },
    {
      key: 'redis',
      status: 'degraded',
      latencyMs: 210,
      checkedAt: iso(1),
      detail: 'chậm hơn ngưỡng 50ms trong 5 phút gần nhất',
    },
    {
      key: 'worker',
      status: 'down',
      latencyMs: null,
      checkedAt: iso(3),
      detail: 'heartbeat quá hạn 4 phút',
    },
    {
      key: 'google_places',
      status: 'unknown',
      latencyMs: null,
      checkedAt: iso(1),
      detail: 'chưa có lời gọi nào trong process này',
    },
  ],
}

export const opsQueues: CmsOpsQueues = {
  queues: [
    {
      name: 'place-import',
      source: 'bullmq',
      pending: 82,
      running: 3,
      failed24h: 2,
      failed24hTruncated: false,
      deadLetter: 0,
      oldestPendingSeconds: 480,
      workers: 3,
    },
    {
      name: 'image-processing',
      source: 'bullmq',
      pending: 18,
      running: 2,
      failed24h: 500,
      // The scan hit its cap: 500 is a floor, and the console must say ≥.
      failed24hTruncated: true,
      deadLetter: 3,
      oldestPendingSeconds: 4_440,
      workers: 2,
    },
    {
      name: 'outbox_events',
      source: 'database',
      pending: 12,
      running: 0,
      failed24h: 0,
      failed24hTruncated: false,
      deadLetter: 0,
      oldestPendingSeconds: null,
      workers: null,
    },
  ],
}

export const opsCosts: CmsOpsCosts = {
  providers: [],
  sourcesConfigured: false,
}
