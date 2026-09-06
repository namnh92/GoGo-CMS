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
  CmsCostFreshness,
  CmsCostFreshnessSource,
  CmsCostFreshnessStatus,
  CmsCostOperationUsage,
  CmsCostOverview,
  CmsCostProviderRow,
  CmsCostServiceRow,
  CmsCostTestRun,
  CmsCostTestRunDetail,
  CmsOpsCosts,
  CmsAppUserDetail,
  CmsRoomSummary,
  CmsPlanSummary,
  CmsRoomGuest,
  PrivacyRequest,
} from '@/shared/api/contracts'
import type { CmsManualCostEligibleService, CmsManualCostItem } from '@/shared/api/contracts'
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
    unmappedHeaders: ['HCM:ghi_chu_noi_bo'],
    // Sheet has no `category` column at all — the one thing an operator has to
    // go and add. `source_row_id` is absent too and is not listed: the server
    // derives it.
    missingRequiredColumns: ['HCM:category'],
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
    missingRequiredColumns: [],
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
    missingRequiredColumns: [],
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

/**
 * GoGo-BE#335 — a connected ledger, priced.
 *
 * Places has a measured amount, Sheets a measured zero, and the two things
 * with no amount are named in `gaps` rather than being left out: Routes bills
 * per matrix element at a list price nobody has verified, and the Maps SDK
 * renders on a handset the backend cannot see.
 */
export const opsCosts: CmsOpsCosts = {
  providers: [
    {
      key: 'places',
      today: 240,
      monthToDate: 1_040,
      currency: 'USD',
      basis: 'estimated',
      todayMicros: 2_400_000,
      monthToDateMicros: 10_400_000,
      billableUnitsToday: 120,
      billableUnitsMonthToDate: 1_520,
    },
    {
      key: 'sheets',
      today: 0,
      monthToDate: 0,
      currency: 'USD',
      basis: 'estimated',
      todayMicros: 0,
      monthToDateMicros: 0,
      billableUnitsToday: 0,
      billableUnitsMonthToDate: 0,
    },
  ],
  sourcesConfigured: true,
  currency: 'USD',
  pricingVersion: '2026-09-01',
  basis: 'ESTIMATED',
  confidence: 'MEDIUM',
  asOf: '2026-09-01T12:00:00.000Z',
  gaps: [
    {
      key: 'google.routeMatrix',
      provider: 'routes',
      kind: 'price_unknown',
      detail: 'Billed per matrix element; no per-element list price verified.',
    },
    {
      key: 'google.maps_sdk_ios',
      provider: 'maps_sdk',
      kind: 'not_instrumented',
      detail: 'The SDK renders on the handset; the backend sees no map load.',
    },
  ],
}

/** The pre-#335 shape, still parsed: a console can ship ahead of the backend. */
export const opsCostsUnmeasured: CmsOpsCosts = {
  providers: [],
  sourcesConfigured: false,
  gaps: [],
}

/**
 * `GET /cms/users` (GoGo-BE#246). All four statuses, a deleted account with
 * its email freed (null), and one reported user — so every branch of the
 * console is reachable. UUIDs because the server validates path ids as such.
 */
export const cmsAppUsers: CmsAppUserDetail[] = [
  {
    id: '11111111-0000-4000-8000-000000000001',
    displayName: 'Nguyễn Lan Anh',
    email: 'lananh.nguyen@gmail.com',
    status: 'active',
    authMethod: 'password',
    locale: 'vi',
    createdAt: iso(60 * 24 * 200),
    lastActiveAt: iso(12),
    counters: { roomsCreated: 14, roomsJoined: 28, reviews: 9, savedPlaces: 43 },
    reportCount: 0,
    openPrivacyRequestCount: 0,
    statusReason: null,
    statusChangedAt: null,
    rooms: [
      {
        id: '22222222-0000-4000-8000-000000000001',
        type: 'couple',
        status: 'completed',
        decisionMode: 'consensus',
        participantCount: 2,
        title: 'Cuối tuần Q1',
        role: 'host',
        joinedAt: iso(60 * 24 * 2),
        createdAt: iso(60 * 24 * 2),
      },
      {
        id: '22222222-0000-4000-8000-000000000002',
        type: 'group',
        status: 'active',
        decisionMode: 'vote',
        participantCount: 6,
        title: null,
        role: 'member',
        joinedAt: iso(60 * 24 * 9),
        createdAt: iso(60 * 24 * 10),
      },
    ],
  },
  {
    id: '11111111-0000-4000-8000-000000000002',
    displayName: 'Đặng Quốc Bảo',
    email: 'quocbao.dang@gmail.com',
    status: 'suspended',
    authMethod: 'password',
    locale: 'vi',
    createdAt: iso(60 * 24 * 150),
    lastActiveAt: iso(60 * 24 * 3),
    counters: { roomsCreated: 0, roomsJoined: 5, reviews: 12, savedPlaces: 8 },
    reportCount: 3,
    // An open request: deleting directly must warn before it bypasses the ledger.
    openPrivacyRequestCount: 1,
    statusReason: 'Spam đánh giá hàng loạt sau cảnh báo',
    statusChangedAt: iso(60 * 24 * 2),
    rooms: [],
  },
  {
    id: '11111111-0000-4000-8000-000000000003',
    displayName: 'Hoàng Việt Anh',
    email: 'vietanh.hoang@yahoo.com',
    status: 'banned',
    authMethod: 'password',
    locale: 'vi',
    createdAt: iso(60 * 24 * 120),
    lastActiveAt: iso(60 * 24 * 30),
    counters: { roomsCreated: 1, roomsJoined: 3, reviews: 1, savedPlaces: 5 },
    reportCount: 7,
    openPrivacyRequestCount: 0,
    statusReason: 'Quấy rối thành viên trong phòng, tái phạm',
    statusChangedAt: iso(60 * 24 * 28),
    rooms: [],
  },
  {
    id: '11111111-0000-4000-8000-000000000004',
    displayName: 'Người dùng đã xoá',
    // The address was freed for re-registration; null is the fact itself.
    email: null,
    status: 'deleted',
    authMethod: 'none',
    locale: 'vi',
    createdAt: iso(60 * 24 * 400),
    lastActiveAt: null,
    counters: { roomsCreated: 2, roomsJoined: 4, reviews: 0, savedPlaces: 0 },
    reportCount: 0,
    openPrivacyRequestCount: 0,
    statusReason: null,
    statusChangedAt: iso(60 * 24 * 40),
    rooms: [],
  },
  {
    id: '11111111-0000-4000-8000-000000000005',
    displayName: 'Lê Thị Ngọc',
    email: 'ngoc.le@gmail.com',
    status: 'active',
    authMethod: 'password',
    locale: 'vi',
    createdAt: iso(60 * 24 * 90),
    lastActiveAt: iso(45),
    counters: { roomsCreated: 21, roomsJoined: 40, reviews: 35, savedPlaces: 88 },
    reportCount: 0,
    openPrivacyRequestCount: 0,
    statusReason: null,
    statusChangedAt: null,
    rooms: [],
  },
]

/** `GET /cms/rooms` — no `code` field exists anywhere in this fixture. */
export const cmsRooms: CmsRoomSummary[] = [
  {
    id: '22222222-0000-4000-8000-000000000001',
    type: 'couple',
    status: 'completed',
    decisionMode: 'consensus',
    participantCount: 2,
    title: 'Cuối tuần Q1',
    hostUserId: '11111111-0000-4000-8000-000000000001',
    memberCount: 2,
    planCount: 1,
    createdAt: iso(60 * 24 * 2),
  },
  {
    id: '22222222-0000-4000-8000-000000000002',
    type: 'group',
    status: 'active',
    decisionMode: 'vote',
    participantCount: 6,
    title: null,
    hostUserId: '11111111-0000-4000-8000-000000000005',
    memberCount: 4,
    planCount: 0,
    createdAt: iso(60 * 24 * 10),
  },
  {
    id: '22222222-0000-4000-8000-000000000003',
    type: 'group',
    status: 'planning',
    decisionMode: 'host_decides',
    participantCount: 8,
    title: 'Team outing thứ 6',
    hostUserId: '11111111-0000-4000-8000-000000000005',
    memberCount: 8,
    planCount: 2,
    createdAt: iso(60 * 24 * 1),
  },
]

export const cmsPlans: CmsPlanSummary[] = [
  {
    id: '33333333-0000-4000-8000-000000000001',
    roomId: '22222222-0000-4000-8000-000000000001',
    version: 2,
    status: 'current',
    isStale: false,
    stopCount: 4,
    createdAt: iso(60 * 24 * 2),
  },
  {
    id: '33333333-0000-4000-8000-000000000002',
    roomId: '22222222-0000-4000-8000-000000000003',
    version: 1,
    status: 'current',
    isStale: true,
    stopCount: 5,
    createdAt: iso(60 * 20),
  },
  {
    id: '33333333-0000-4000-8000-000000000003',
    roomId: '22222222-0000-4000-8000-000000000001',
    version: 1,
    status: 'superseded',
    isStale: false,
    stopCount: 4,
    createdAt: iso(60 * 24 * 3),
  },
]

/**
 * `GET /cms/rooms/{id}/guests` (GoGo-BE#257). One of each state — active,
 * claimed, expired, removed — and no token or hash anywhere, because the
 * server never returns one.
 */
export const cmsRoomGuests: Record<string, CmsRoomGuest[]> = {
  '22222222-0000-4000-8000-000000000002': [
    {
      memberId: '44444444-0000-4000-8000-000000000001',
      guestSessionId: '55555555-0000-4000-8000-000000000001',
      displayName: 'Khách vui vẻ',
      selectionStatus: 'completed',
      joinedAt: iso(60 * 3),
      // Far future relative to the REAL clock: the console computes "active"
      // against Date.now(), not against the fixtures' frozen now.
      sessionExpiresAt: iso(-60 * 24 * 365),
      sessionRevokedAt: null,
      removedAt: null,
      claimed: false,
    },
    {
      memberId: '44444444-0000-4000-8000-000000000002',
      guestSessionId: '55555555-0000-4000-8000-000000000002',
      displayName: 'Mèo Mun',
      selectionStatus: 'in_progress',
      joinedAt: iso(60 * 24 * 2),
      sessionExpiresAt: iso(60 * 24),
      sessionRevokedAt: null,
      removedAt: null,
      claimed: true,
    },
    {
      memberId: '44444444-0000-4000-8000-000000000003',
      guestSessionId: '55555555-0000-4000-8000-000000000003',
      displayName: 'Người bí ẩn',
      selectionStatus: 'not_started',
      joinedAt: iso(60 * 30),
      sessionExpiresAt: iso(60 * 6),
      sessionRevokedAt: null,
      removedAt: null,
      claimed: false,
    },
    {
      memberId: '44444444-0000-4000-8000-000000000004',
      guestSessionId: '55555555-0000-4000-8000-000000000004',
      displayName: 'Bạn ơi đi đâu',
      selectionStatus: 'completed',
      joinedAt: iso(60 * 24 * 3),
      sessionExpiresAt: iso(60 * 24 * 2),
      sessionRevokedAt: iso(60 * 24 * 2),
      removedAt: iso(60 * 24 * 2),
      claimed: false,
    },
  ],
}

/**
 * `GET /cms/privacy-requests` (GoGo-BE#255). Every SLA state, both closed
 * outcomes that are *not* completion, an export awaiting delivery, and one
 * closed row under a legal hold whose review date has lapsed — the state a
 * person must look at because nothing auto-releases.
 */
export const privacyRequests: PrivacyRequest[] = [
  {
    id: '66666666-0000-4000-8000-000000000001',
    type: 'export',
    source: 'support',
    status: 'acknowledged',
    outcome: null,
    subject: {
      subjectType: 'email',
      userId: null,
      contactEmail: 'lananh.nguyen@gmail.com',
      externalReference: null,
      identityStatus: 'unverified',
    },
    receivedAt: iso(60 * 24 * 3),
    ackDueAt: iso(60 * 24 * 2),
    acknowledgedAt: iso(60 * 24 * 2 + 30),
    fulfillmentDueAt: iso(-60 * 24 * 20),
    extendedDueAt: null,
    extensionReason: null,
    executedAt: null,
    completedAt: null,
    closedAt: null,
    deliveryMethod: null,
    deliveredAt: null,
    retentionAt: null,
    retentionHold: null,
    reasonCode: null,
    ticketReference: 'SUP-1042',
    operatorNote: 'SUP-1042',
    sla: 'ON_TRACK',
  },
  {
    id: '66666666-0000-4000-8000-000000000002',
    type: 'delete',
    source: 'support',
    status: 'in_progress',
    outcome: null,
    subject: {
      subjectType: 'user',
      userId: '11111111-0000-4000-8000-000000000002',
      contactEmail: null,
      externalReference: null,
      identityStatus: 'matched',
    },
    receivedAt: iso(60 * 24 * 28),
    ackDueAt: iso(60 * 24 * 27),
    acknowledgedAt: iso(60 * 24 * 27),
    fulfillmentDueAt: iso(60 * 24 * 2),
    extendedDueAt: null,
    extensionReason: null,
    executedAt: null,
    completedAt: null,
    closedAt: null,
    deliveryMethod: null,
    deliveredAt: null,
    retentionAt: null,
    retentionHold: null,
    reasonCode: null,
    ticketReference: 'SUP-0990',
    operatorNote: null,
    sla: 'OVERDUE',
  },
  {
    id: '66666666-0000-4000-8000-000000000003',
    type: 'export',
    source: 'self_service',
    status: 'closed',
    outcome: 'completed',
    subject: {
      subjectType: 'user',
      userId: '11111111-0000-4000-8000-000000000005',
      contactEmail: null,
      externalReference: null,
      identityStatus: 'matched',
    },
    receivedAt: iso(60 * 24 * 12),
    ackDueAt: iso(60 * 24 * 11),
    acknowledgedAt: iso(60 * 24 * 12),
    fulfillmentDueAt: iso(60 * 24 * 5),
    extendedDueAt: null,
    extensionReason: null,
    executedAt: iso(60 * 24 * 10),
    completedAt: iso(60 * 24 * 10),
    closedAt: iso(60 * 24 * 10),
    // Executed but never handed over: the delivery action must be reachable.
    deliveryMethod: null,
    deliveredAt: null,
    retentionAt: iso(-60 * 24 * 300),
    retentionHold: null,
    reasonCode: null,
    ticketReference: null,
    operatorNote: null,
    sla: 'COMPLETED',
  },
  {
    id: '66666666-0000-4000-8000-000000000004',
    type: 'correction',
    source: 'support',
    status: 'closed',
    outcome: 'no_account_found',
    subject: {
      subjectType: 'external',
      userId: null,
      contactEmail: null,
      externalReference: 'ZENDESK-88213',
      identityStatus: 'no_account_found',
    },
    receivedAt: iso(60 * 24 * 40),
    ackDueAt: iso(60 * 24 * 39),
    acknowledgedAt: iso(60 * 24 * 39),
    fulfillmentDueAt: iso(60 * 24 * 33),
    extendedDueAt: null,
    extensionReason: null,
    executedAt: null,
    completedAt: null,
    closedAt: iso(60 * 24 * 35),
    deliveryMethod: null,
    deliveredAt: null,
    retentionAt: iso(-60 * 24 * 200),
    // Held past its review date: flagged, never auto-released.
    retentionHold: {
      heldAt: iso(60 * 24 * 34),
      heldBy: '00000000-0000-4000-8000-0000000000aa',
      reason: 'Tranh chấp đang trong quá trình xử lý',
      legalBasis: 'Yêu cầu lưu giữ chứng cứ theo vụ việc DS-2026-014',
      reviewAt: iso(60 * 24 * 5),
      holdUntil: null,
      reviewOverdue: true,
    },
    reasonCode: 'no_account',
    ticketReference: 'ZENDESK-88213',
    operatorNote: null,
    sla: 'COMPLETED',
  },
  {
    id: '66666666-0000-4000-8000-000000000006',
    type: 'correction',
    source: 'support',
    status: 'acknowledged',
    outcome: null,
    subject: {
      subjectType: 'external',
      userId: null,
      contactEmail: null,
      externalReference: 'ZENDESK-90144',
      identityStatus: 'unverified',
    },
    receivedAt: iso(60 * 24 * 4),
    ackDueAt: iso(60 * 24 * 3),
    acknowledgedAt: iso(60 * 24 * 3),
    fulfillmentDueAt: iso(-60 * 24 * 10),
    extendedDueAt: null,
    extensionReason: null,
    executedAt: null,
    completedAt: null,
    closedAt: null,
    deliveryMethod: null,
    deliveredAt: null,
    retentionAt: null,
    retentionHold: null,
    reasonCode: null,
    ticketReference: 'ZENDESK-90144',
    operatorNote: null,
    sla: 'ON_TRACK',
  },
  {
    id: '66666666-0000-4000-8000-000000000005',
    type: 'export',
    source: 'support',
    status: 'open',
    outcome: null,
    subject: {
      subjectType: 'email',
      userId: null,
      contactEmail: 'thuha.pham@outlook.com',
      externalReference: null,
      identityStatus: 'unverified',
    },
    receivedAt: iso(60 * 6),
    ackDueAt: iso(-60 * 18),
    acknowledgedAt: null,
    fulfillmentDueAt: iso(-60 * 24 * 6),
    extendedDueAt: null,
    extensionReason: null,
    executedAt: null,
    completedAt: null,
    closedAt: null,
    deliveryMethod: null,
    deliveredAt: null,
    retentionAt: null,
    retentionHold: null,
    reasonCode: null,
    ticketReference: null,
    operatorNote: null,
    sla: 'DUE_SOON',
  },
]

/**
 * `GET /cms/ops/summary|providers` (GoGo-BE#315).
 *
 * Shaped like a real DEV answer: Places measured, Routes measured with a
 * failure, Sheets not instrumented at all. That last row is the interesting
 * one — it is the case the console must render as "chưa đo" rather than as a
 * quiet zero.
 */
export const opsLatencySemantics = {
  unit: 'seconds' as const,
  source: 'place_provider_request_duration_seconds histogram',
  excludesHttpStatuses: ['400', '404'],
  excludesReason:
    'Deterministic input rejections (#314). Google refuses a malformed place id in tens of milliseconds, so counting those would make the provider look faster the more broken links users paste.',
  p99MinSamples: 100,
}

const opsTrendSeries = (base: number) =>
  Array.from({ length: 12 }, (_, i) => ({
    t: new Date(Date.UTC(2026, 8, 1, 0, i * 5)).toISOString(),
    v: base + (i % 4) * 0.25,
  }))

export const opsSummary = {
  window: '24h' as const,
  effectiveWindow: '24h',
  retentionDays: 14,
  truncated: false,
  generatedAt: '2026-09-01T12:00:00.000Z',
  backend: { status: 'ok' as const },
  totals: {
    providerRequests: 420,
    providerSuccesses: 400,
    providerFailures: 8,
    providerRejected: 12,
    providerSuccessRate: 0.952,
    providerFailureRate: 0.019,
    providerRejectedRate: 0.029,
    latency: { p50: 0.175, p95: 0.44, p99: null },
    rejectedLatency: { p50: 0.03, p95: 0.05 },
    billableUnits: 512,
    // Routes is measured and unpriced, so the total is a floor.
  },
  trends: {
    stepSeconds: 300,
    series: {
      requests: opsTrendSeries(2),
      failures: opsTrendSeries(0),
      latencyP95: opsTrendSeries(0.4),
      costUnits: opsTrendSeries(3),
    },
  },
  latencySemantics: opsLatencySemantics,
}

export const opsProviders = {
  window: '24h' as const,
  effectiveWindow: '24h',
  retentionDays: 14,
  truncated: false,
  generatedAt: '2026-09-01T12:00:00.000Z',
  backend: { status: 'ok' as const },
  providers: [
    {
      provider: 'places' as const,
      instrumented: true,
      calls: 400,
      successes: 388,
      failures: 0,
      rejected: 12,
      successRate: 0.97,
      latency: { p50: 0.175, p95: 0.44, p99: null },
      billableUnits: 500,
      costCenter: { providerId: 'google', serviceId: 'google.places' },
    },
    {
      provider: 'routes' as const,
      instrumented: true,
      calls: 20,
      successes: 12,
      failures: 8,
      rejected: 0,
      successRate: 0.6,
      latency: { p50: 0.21, p95: 0.6, p99: null },
      billableUnits: 12,
      costCenter: { providerId: 'google', serviceId: 'google.routes' },
      // Units exact, price unverified. Never rendered as free.
    },
    {
      // No metric at all. Never a zero.
      provider: 'sheets' as const,
      instrumented: false,
      calls: 0,
      successes: 0,
      failures: 0,
      rejected: 0,
      successRate: null,
      latency: { p50: null, p95: null, p99: null },
      billableUnits: null,
      costCenter: { providerId: 'google', serviceId: 'google.sheets' },
    },
    {
      // #335 — the handset renders the map; nothing here counts it.
      provider: 'maps_sdk' as const,
      instrumented: false,
      calls: 0,
      successes: 0,
      failures: 0,
      rejected: 0,
      successRate: null,
      latency: { p50: null, p95: null, p99: null },
      billableUnits: null,
      costCenter: { providerId: 'google', serviceId: null },
    },
  ],
  latencySemantics: opsLatencySemantics,
}

/**
 * COST-CMS-010 (GoGo-BE#382) — manual / fixed cost items and the registry's
 * MANUAL_COST services, as the server lists them (manual providers wholesale,
 * Play Console alone under Google).
 */
export const cmsManualCostEligibleServices: CmsManualCostEligibleService[] = [
  {
    providerId: 'google',
    providerDisplayName: 'Google',
    serviceId: 'google.play_console',
    displayName: 'Play Console',
  },
  {
    providerId: 'apple',
    providerDisplayName: 'Apple',
    serviceId: 'apple.developer_program',
    displayName: 'Developer Program',
  },
  {
    providerId: 'hosting',
    providerDisplayName: 'Hosting',
    serviceId: 'hosting.vps',
    displayName: 'VPS subscription',
  },
  {
    providerId: 'registrar',
    providerDisplayName: 'Domain registrar',
    serviceId: 'registrar.domain',
    displayName: 'Domain registration',
  },
]

export const cmsManualCostItems: CmsManualCostItem[] = [
  {
    id: 'mc-apple',
    environment: 'dev',
    providerId: 'apple',
    serviceId: 'apple.developer_program',
    name: 'Apple Developer Program',
    amountMicros: 99_000_000,
    currency: 'USD',
    period: 'YEARLY',
    costKind: 'RECURRING',
    billingCadence: 'ANNUAL',
    effectiveFrom: '2026-01-15',
    effectiveTo: null,
    nextChargeDay: '2027-01-15',
    note: null,
    createdBy: 'adm-ops',
    createdAt: '2026-01-15T03:00:00Z',
    updatedBy: 'adm-ops',
    updatedAt: '2026-01-15T03:00:00Z',
  },
  {
    id: 'mc-domain',
    environment: 'dev',
    providerId: 'registrar',
    serviceId: 'registrar.domain',
    name: 'gogo.vn',
    amountMicros: 350_000_000_000,
    currency: 'VND',
    period: 'ONE_TIME',
    costKind: 'ONE_TIME',
    billingCadence: null,
    effectiveFrom: '2026-03-01',
    effectiveTo: null,
    nextChargeDay: null,
    note: 'Gia hạn 1 năm',
    createdBy: 'adm-ops',
    createdAt: '2026-03-01T02:00:00Z',
    updatedBy: 'adm-ops',
    updatedAt: '2026-03-01T02:00:00Z',
  },
]

/**
 * COST-CMS-009 (GoGo-BE#381) — the Cost Center payload.
 *
 * The mock's job is the SHAPE, and specifically the four ways a row can be
 * honest about money, all reachable in one render:
 *
 * - `google.places` — KNOWN: a fresh source, a real estimate.
 * - `google.sheets` — MEASURED_ZERO: instrumented, fresh, and it counted 0.
 * - `google.routeMatrix` — usage but no verified price: UNKNOWN money beside a
 *   real quantity, which is why the two are separate columns.
 * - `google.mapsSdk`, `cloudflare.workers`, `vietmap` — nothing measures them
 *   at all. Collectors sit at UNKNOWN until GoGo-Infra#114 lands their SSM
 *   rows, and that is what a DEV console genuinely looks like today.
 *
 * Ids are registry-shaped rather than an enum, so the fixture also proves the
 * screen renders a provider it has never heard of (`apple`, `gogo`).
 */
function costFreshness(
  status: CmsCostFreshnessStatus,
  sources: CmsCostFreshnessSource[] = [],
): CmsCostFreshness {
  const asOf = sources.reduce<string | null>(
    (newest, source) =>
      source.sourceAsOf && (!newest || source.sourceAsOf > newest) ? source.sourceAsOf : newest,
    null,
  )
  return { status, sourceAsOf: asOf, sources }
}

function costSource(
  sourceId: string,
  status: CmsCostFreshnessStatus,
  overrides: Partial<CmsCostFreshnessSource> = {},
): CmsCostFreshnessSource {
  const at = status === 'FRESH' ? iso(30) : status === 'STALE' ? iso(60 * 40) : null
  return {
    sourceId,
    serviceId: null,
    status,
    lastSuccessfulAt: at,
    lastAttemptAt: at ?? iso(15),
    sourceAsOf: at,
    staleAfterS: 86_400,
    consecutiveFailures: status === 'UNAVAILABLE' ? 3 : 0,
    ...overrides,
  }
}

/** Nothing measures it: money is null and every per-basis figure with it. */
const UNKNOWN_MONEY = {
  spendMicros: null,
  estimatedMicros: null,
  actualMicros: null,
  fixedMicros: null,
  manualMicros: null,
  shadowedEstimatedMicros: 0,
  basis: 'UNKNOWN',
  confidence: null,
  currency: null,
  mixedCurrency: false,
  costStatus: 'UNKNOWN',
} as const

export const costServices: Record<string, CmsCostServiceRow> = {
  'google.places': {
    ...UNKNOWN_MONEY,
    spendMicros: 10_400_000,
    estimatedMicros: 10_400_000,
    basis: 'ESTIMATED',
    confidence: 'MEDIUM',
    currency: 'USD',
    costStatus: 'KNOWN',
    serviceId: 'google.places',
    providerId: 'google',
    displayName: 'Places API',
    category: 'maps',
    capabilities: ['PLACE_SEARCH', 'PLACE_DETAILS'],
    instrumented: true,
    // ADR-0014: what is measured, and how money gets in — two facts, never one.
    runtime: { surface: 'in_process', coverage: 'FULL', operations: { instrumented: 2, total: 2 } },
    cost: { kind: 'AUTO', freshness: 'FRESH' },
    usage: [
      {
        meterId: 'google.placeDetails/requests',
        operationId: 'google.placeDetails',
        usageMetricId: 'requests',
        billingSkuId: 'places.details.essentials',
        unit: 'request',
        billable: true,
        quantity: 1_520,
        sources: ['ledger'],
      },
    ],
    quota: null,
    lastUpdated: iso(45),
    freshness: costFreshness('FRESH', [costSource('ledger', 'FRESH')]),
  },
  'google.sheets': {
    ...UNKNOWN_MONEY,
    // A measured zero: somebody was counting, and counted nothing. It is not
    // the same claim as "no source", and must not render like one.
    spendMicros: 0,
    estimatedMicros: 0,
    basis: 'ESTIMATED',
    confidence: 'MEDIUM',
    currency: 'USD',
    costStatus: 'MEASURED_ZERO',
    serviceId: 'google.sheets',
    providerId: 'google',
    displayName: 'Sheets API',
    category: 'ops',
    capabilities: ['EXPORT'],
    instrumented: true,
    // ADR-0014: what is measured, and how money gets in — two facts, never one.
    runtime: { surface: 'in_process', coverage: 'FULL', operations: { instrumented: 1, total: 1 } },
    cost: { kind: 'AUTO', freshness: 'FRESH' },
    usage: [
      {
        meterId: 'google.sheetsAppend/requests',
        operationId: 'google.sheetsAppend',
        usageMetricId: 'requests',
        billingSkuId: null,
        unit: 'request',
        billable: false,
        quantity: 0,
        sources: ['ledger'],
      },
    ],
    quota: null,
    lastUpdated: iso(45),
    freshness: costFreshness('FRESH', [costSource('ledger', 'FRESH')]),
  },
  'google.routeMatrix': {
    ...UNKNOWN_MONEY,
    // Units are exact, money is not: Routes bills per matrix element and no
    // per-element list price is verified. A floor with a currency beside it
    // would be a false claim, so the money column stays unknown.
    serviceId: 'google.routeMatrix',
    providerId: 'google',
    displayName: 'Routes — Matrix',
    category: 'maps',
    capabilities: ['ROUTE_MATRIX'],
    instrumented: true,
    // ADR-0014: what is measured, and how money gets in — two facts, never one.
    runtime: { surface: 'in_process', coverage: 'FULL', operations: { instrumented: 1, total: 1 } },
    cost: { kind: 'AUTO', freshness: 'FRESH' },
    usage: [
      {
        meterId: 'google.routeMatrix/billable_elements',
        operationId: 'google.routeMatrix',
        usageMetricId: 'billable_elements',
        billingSkuId: null,
        unit: 'matrix_element',
        billable: true,
        quantity: 8_400,
        sources: ['ledger'],
      },
    ],
    quota: null,
    lastUpdated: iso(45),
    freshness: costFreshness('FRESH', [costSource('ledger', 'FRESH')]),
  },
  'google.mapsSdk': {
    ...UNKNOWN_MONEY,
    serviceId: 'google.mapsSdk',
    providerId: 'google',
    displayName: 'Maps SDK (mobile)',
    category: 'maps',
    capabilities: ['MAP_RENDER'],
    // The SDK renders on the handset; the backend sees no map load.
    instrumented: false,
    // ADR-0014: what is measured, and how money gets in — two facts, never one.
    runtime: {
      surface: 'client_sdk',
      coverage: 'NOT_INSTRUMENTED',
      operations: { instrumented: 0, total: 1 },
    },
    // Never observed, not failed: the SDK has an automatic source nothing has fed.
    cost: { kind: 'AUTO', freshness: 'UNKNOWN' },
    usage: [],
    quota: null,
    lastUpdated: null,
    freshness: costFreshness('UNKNOWN'),
  },
  'cloudflare.r2': {
    ...UNKNOWN_MONEY,
    spendMicros: 1_250_000,
    estimatedMicros: 1_400_000,
    actualMicros: 1_250_000,
    shadowedEstimatedMicros: 1_400_000,
    basis: 'ACTUAL',
    confidence: 'HIGH',
    currency: 'USD',
    costStatus: 'KNOWN',
    serviceId: 'cloudflare.r2',
    providerId: 'cloudflare',
    displayName: 'R2 object storage',
    category: 'storage',
    capabilities: ['OBJECT_STORAGE'],
    instrumented: true,
    // ADR-0014: what is measured, and how money gets in — two facts, never one.
    runtime: { surface: 'in_process', coverage: 'FULL', operations: { instrumented: 1, total: 1 } },
    cost: { kind: 'AUTO', freshness: 'STALE' },
    usage: [
      {
        meterId: 'cloudflare.r2/class_a_operations',
        operationId: 'cloudflare.r2Write',
        usageMetricId: 'class_a_operations',
        billingSkuId: 'r2.class_a',
        unit: 'operation',
        billable: true,
        quantity: 240_000,
        sources: ['cloudflare_api'],
      },
    ],
    quota: null,
    lastUpdated: iso(60 * 40),
    freshness: costFreshness('STALE', [costSource('cloudflare_api', 'STALE')]),
  },
  'cloudflare.workers': {
    ...UNKNOWN_MONEY,
    serviceId: 'cloudflare.workers',
    providerId: 'cloudflare',
    displayName: 'Workers',
    category: 'compute',
    capabilities: ['EDGE_COMPUTE'],
    instrumented: false,
    // ADR-0014: what is measured, and how money gets in — two facts, never one.
    runtime: { surface: 'none', coverage: 'N/A', operations: { instrumented: 0, total: 0 } },
    cost: { kind: 'AUTO', freshness: 'STALE' },
    usage: [],
    quota: null,
    lastUpdated: null,
    // No credential yet (GoGo-Infra#114): the collector has never succeeded.
    freshness: costFreshness('UNKNOWN', [
      costSource('cloudflare_api', 'UNKNOWN', { serviceId: 'cloudflare.workers' }),
    ]),
  },
  'upstash.redis': {
    ...UNKNOWN_MONEY,
    spendMicros: 0,
    estimatedMicros: 0,
    basis: 'ESTIMATED',
    confidence: 'MEDIUM',
    currency: 'USD',
    costStatus: 'KNOWN',
    serviceId: 'upstash.redis',
    providerId: 'upstash',
    displayName: 'Redis',
    category: 'cache',
    capabilities: ['USAGE_COLLECTOR', 'ESTIMATED_COST'],
    // Read from the provider's own API by a collector; this process emits no
    // runtime metric for it (COST-CMS-012 — NOT INSTRUMENTED, not absent).
    instrumented: false,
    // ADR-0014: what is measured, and how money gets in — two facts, never one.
    runtime: {
      surface: 'in_process',
      coverage: 'NOT_INSTRUMENTED',
      operations: { instrumented: 0, total: 0 },
      // COST-CMS-015 (#129): how the serving API's one boot-time connect ended.
      connection: {
        operation: 'upstash.redis.rate_limit.connect',
        status: 'ok',
        observedAt: '2026-09-06T03:00:02.000Z',
      },
    },
    cost: { kind: 'AUTO', freshness: 'FRESH' },
    usage: [],
    quota: null,
    lastUpdated: iso(30),
    freshness: costFreshness('FRESH', [
      costSource('upstash_api', 'FRESH', { serviceId: 'upstash.redis' }),
    ]),
  },
  'apple.developerProgram': {
    ...UNKNOWN_MONEY,
    spendMicros: 8_250_000,
    manualMicros: 8_250_000,
    basis: 'MANUAL',
    confidence: 'HIGH',
    currency: 'USD',
    costStatus: 'KNOWN',
    serviceId: 'apple.developerProgram',
    providerId: 'apple',
    displayName: 'Apple Developer Program',
    category: 'store',
    capabilities: ['MANUAL_COST'],
    instrumented: false,
    // ADR-0014: what is measured, and how money gets in — two facts, never one.
    runtime: { surface: 'none', coverage: 'N/A', operations: { instrumented: 0, total: 0 } },
    cost: { kind: 'MANUAL', freshness: 'FRESH' },
    usage: [],
    quota: null,
    lastUpdated: iso(60 * 6),
    freshness: costFreshness('FRESH', [costSource('manual_cost_items', 'FRESH')]),
  },
  'gogo.metrics': {
    ...UNKNOWN_MONEY,
    spendMicros: 640_000,
    estimatedMicros: 640_000,
    basis: 'ESTIMATED',
    confidence: 'MEDIUM',
    currency: 'USD',
    costStatus: 'KNOWN',
    serviceId: 'gogo.metrics',
    providerId: 'gogo',
    displayName: 'Metrics store',
    category: 'internal',
    capabilities: ['METRICS'],
    instrumented: true,
    // ADR-0014: what is measured, and how money gets in — two facts, never one.
    runtime: { surface: 'in_process', coverage: 'FULL', operations: { instrumented: 1, total: 1 } },
    cost: { kind: 'AUTO', freshness: 'FRESH' },
    usage: [
      {
        meterId: 'gogo.metrics/active_series',
        operationId: 'gogo.metricsIngest',
        usageMetricId: 'active_series',
        billingSkuId: 'metrics.series',
        unit: 'series',
        billable: true,
        quantity: 18_400,
        sources: ['ledger'],
      },
    ],
    quota: null,
    lastUpdated: iso(45),
    freshness: costFreshness('FRESH', [costSource('ledger', 'FRESH')]),
  },
}

export const costProviderRows: CmsCostProviderRow[] = [
  {
    ...UNKNOWN_MONEY,
    spendMicros: 10_400_000,
    estimatedMicros: 10_400_000,
    basis: 'ESTIMATED',
    confidence: 'MEDIUM',
    currency: 'USD',
    costStatus: 'KNOWN',
    providerId: 'google',
    displayName: 'Google',
    status: 'active',
    runtime: {
      coverage: 'PARTIAL',
      services: { full: 3, partial: 0, notInstrumented: 1 },
      operations: { instrumented: 4, total: 5 },
    },
    cost: { kind: 'AUTO', freshness: 'FRESH' },
    capabilities: ['PLACE_SEARCH', 'ROUTE_MATRIX', 'MAP_RENDER'],
    billingTimezone: 'America/Los_Angeles',
    unknownServices: ['google.routeMatrix', 'google.mapsSdk'],
    services: [
      costServices['google.places']!,
      costServices['google.sheets']!,
      costServices['google.routeMatrix']!,
      costServices['google.mapsSdk']!,
    ],
    lastUpdated: iso(45),
    freshness: costFreshness('UNKNOWN', [costSource('ledger', 'FRESH')]),
  },
  {
    ...UNKNOWN_MONEY,
    spendMicros: 1_250_000,
    estimatedMicros: 1_400_000,
    actualMicros: 1_250_000,
    shadowedEstimatedMicros: 1_400_000,
    basis: 'ACTUAL',
    confidence: 'HIGH',
    currency: 'USD',
    costStatus: 'KNOWN',
    providerId: 'cloudflare',
    displayName: 'Cloudflare',
    status: 'active',
    runtime: {
      coverage: 'FULL',
      services: { full: 1, partial: 0, notInstrumented: 0 },
      operations: { instrumented: 1, total: 1 },
    },
    cost: { kind: 'AUTO', freshness: 'STALE' },
    capabilities: ['OBJECT_STORAGE', 'EDGE_COMPUTE'],
    billingTimezone: 'UTC',
    unknownServices: ['cloudflare.workers'],
    services: [costServices['cloudflare.r2']!, costServices['cloudflare.workers']!],
    lastUpdated: iso(60 * 40),
    freshness: costFreshness('STALE', [costSource('cloudflare_api', 'STALE')]),
  },
  {
    ...UNKNOWN_MONEY,
    spendMicros: 0,
    estimatedMicros: 0,
    basis: 'ESTIMATED',
    confidence: 'MEDIUM',
    currency: 'USD',
    costStatus: 'KNOWN',
    providerId: 'upstash',
    displayName: 'Upstash',
    status: 'active',
    runtime: {
      coverage: 'NOT_INSTRUMENTED',
      services: { full: 0, partial: 0, notInstrumented: 1 },
      operations: { instrumented: 0, total: 0 },
    },
    cost: { kind: 'AUTO', freshness: 'FRESH' },
    // Epic §6 capability names: a collector reads it, nothing in-process
    // instruments it — the shape every non-Google infrastructure provider has.
    capabilities: ['USAGE_COLLECTOR', 'ESTIMATED_COST'],
    billingTimezone: 'UTC',
    unknownServices: [],
    services: [costServices['upstash.redis']!],
    lastUpdated: iso(30),
    freshness: costFreshness('FRESH', [costSource('upstash_api', 'FRESH')]),
  },
  {
    ...UNKNOWN_MONEY,
    spendMicros: 8_250_000,
    manualMicros: 8_250_000,
    basis: 'MANUAL',
    confidence: 'HIGH',
    currency: 'USD',
    costStatus: 'KNOWN',
    providerId: 'apple',
    displayName: 'Apple',
    // Active: the manual-item form is its integration. Manual is `cost.kind`, not a status (ADR-0014).
    status: 'active',
    runtime: {
      coverage: 'N/A',
      services: { full: 0, partial: 0, notInstrumented: 0 },
      operations: { instrumented: 0, total: 0 },
    },
    cost: { kind: 'MANUAL', freshness: 'FRESH' },
    capabilities: ['MANUAL_COST'],
    billingTimezone: null,
    unknownServices: [],
    services: [costServices['apple.developerProgram']!],
    lastUpdated: iso(60 * 6),
    freshness: costFreshness('FRESH', [costSource('manual_cost_items', 'FRESH')]),
  },
  {
    ...UNKNOWN_MONEY,
    spendMicros: 640_000,
    estimatedMicros: 640_000,
    basis: 'ESTIMATED',
    confidence: 'MEDIUM',
    currency: 'USD',
    costStatus: 'KNOWN',
    providerId: 'gogo',
    displayName: 'GoGo (nội bộ)',
    status: 'active',
    runtime: {
      coverage: 'FULL',
      services: { full: 1, partial: 0, notInstrumented: 0 },
      operations: { instrumented: 1, total: 1 },
    },
    cost: { kind: 'AUTO', freshness: 'FRESH' },
    capabilities: ['METRICS'],
    billingTimezone: 'Asia/Ho_Chi_Minh',
    unknownServices: [],
    services: [costServices['gogo.metrics']!],
    lastUpdated: iso(45),
    freshness: costFreshness('FRESH', [costSource('ledger', 'FRESH')]),
  },
  {
    ...UNKNOWN_MONEY,
    // In the registry, nothing connected. `planned` is not zero spend.
    providerId: 'vietmap',
    displayName: 'VIETMAP',
    status: 'planned',
    runtime: {
      coverage: 'N/A',
      services: { full: 0, partial: 0, notInstrumented: 0 },
      operations: { instrumented: 0, total: 0 },
    },
    cost: { kind: 'NONE', freshness: null },
    capabilities: ['PLACE_SEARCH'],
    billingTimezone: null,
    unknownServices: [],
    services: [],
    lastUpdated: null,
    freshness: costFreshness('UNKNOWN'),
  },
]

/** Operations behind each service, for the drill-down drawer. */
export const costServiceOperations: Record<string, CmsCostOperationUsage[]> = {
  'google.places': [
    {
      operationId: 'google.placeDetails',
      displayName: 'Place Details',
      instrumented: true,
      unregistered: false,
      meters: costServices['google.places']!.usage,
    },
    {
      // In the tables, not in the registry — a SKU somebody forgot to fold.
      operationId: 'google.placePhoto',
      displayName: null,
      instrumented: true,
      unregistered: true,
      meters: [
        {
          meterId: null,
          operationId: 'google.placePhoto',
          usageMetricId: 'requests',
          billingSkuId: null,
          unit: 'request',
          billable: true,
          quantity: 96,
          sources: ['ledger'],
        },
      ],
    },
  ],
  'google.mapsSdk': [],
}

export const costOverview: CmsCostOverview = {
  environment: 'dev',
  ledgerEnabled: true,
  window: 'mtd',
  range: { from: '2026-09-01', to: '2026-09-04' },
  month: '2026-09',
  today: '2026-09-04',
  generatedAt: iso(5),
  cards: {
    today: {
      day: '2026-09-04',
      spendMicros: 2_400_000,
      byBasis: { ACTUAL: 0, ESTIMATED: 2_400_000, FIXED: 0, MANUAL: 0 },
      byKind: { USAGE: 2_400_000, RECURRING: 0, ONE_TIME: 0 },
      currency: 'USD',
      mixedCurrency: false,
      services: 2,
    },
    monthToDate: {
      month: '2026-09',
      spendMicros: 20_540_000,
      byBasis: {
        ACTUAL: 1_250_000,
        ESTIMATED: 11_040_000,
        FIXED: 0,
        MANUAL: 8_250_000,
      },
      // A $12 VPS billed on the 1st (recurring), a $25 Play Console
      // registration on the 3rd (one-time) — and no daily share of anything.
      byKind: { USAGE: 12_290_000, RECURRING: 12_000_000, ONE_TIME: 25_000_000 },
      currency: 'USD',
      mixedCurrency: false,
      services: 4,
    },
    // COST-CMS-012 (GoGo-BE#415, ADR-0015). Usage 12.29 over 10 days → 36.87
    // projected; VPS 12.00 landed; a $3 VPS on the 15th and the domain's
    // annual $10 renewal on the 20th still ahead; $25 one-off landed. Cash
    // 36.87 + 25.00 + 25.00 = 86.87. Run-rate: 36.87 + 15.00 + (99 + 10) / 12.
    forecast: {
      month: '2026-09',
      today: '2026-09-10',
      elapsedDays: 10,
      daysInMonth: 30,
      minElapsedDays: 3,
      actual: {
        micros: 49_290_000,
        byKind: { USAGE: 12_290_000, RECURRING: 12_000_000, ONE_TIME: 25_000_000 },
      },
      usage: { mtdMicros: 12_290_000, projectedMicros: 36_870_000, reason: null },
      recurring: {
        landedMicros: 12_000_000,
        scheduledMicros: 13_000_000,
        committedMicros: 25_000_000,
      },
      oneTime: { landedMicros: 25_000_000, scheduledMicros: 0 },
      scheduled: [
        {
          key: 'manual_cost_items:mc-vps-15',
          providerId: 'hosting',
          serviceId: 'hosting.vps',
          name: 'VPS (backup)',
          kind: 'RECURRING',
          cadence: 'MONTHLY',
          day: '2026-09-15',
          amountMicros: 3_000_000,
          currency: 'USD',
        },
        {
          key: 'manual_cost_items:mc-domain-renewal',
          providerId: 'registrar',
          serviceId: 'registrar.domain',
          name: 'gogo.vn',
          kind: 'RECURRING',
          cadence: 'ANNUAL',
          day: '2026-09-20',
          amountMicros: 10_000_000,
          currency: 'USD',
        },
      ],
      cash: { micros: 86_870_000, floorMicros: 50_000_000, partial: false },
      runRate: {
        micros: 60_953_333,
        usageMicros: 36_870_000,
        recurringMonthlyMicros: 15_000_000,
        annualEquivalentMicros: 9_083_333,
        oneTimeExcludedMicros: 25_000_000,
      },
      currency: 'USD',
      mixedCurrency: false,
    },
    budget: {
      total: {
        scope: { kind: 'TOTAL', id: null },
        monthMicros: 25_000_000,
        usedMicros: 20_540_000,
        remainingMicros: 4_460_000,
        usedPct: 82.16,
        projectedMicros: 86_870_000,
        projectedPct: 347.48,
        projectedFloorMicros: 50_000_000,
        runRateMicros: 60_953_333,
        state: 'projected_exceed',
        currency: 'USD',
      },
      budgets: [
        {
          scope: { kind: 'PROVIDER', id: 'google' },
          monthMicros: 15_000_000,
          usedMicros: 10_400_000,
          remainingMicros: 4_600_000,
          usedPct: 69.33,
          projectedMicros: 31_200_000,
          projectedPct: 208,
          projectedFloorMicros: 0,
          runRateMicros: 31_200_000,
          state: 'warning',
          currency: 'USD',
        },
      ],
    },
    unknown: {
      providerIds: ['vietmap'],
      serviceIds: ['google.routeMatrix', 'google.mapsSdk', 'cloudflare.workers'],
    },
    costOfMonitoring: {
      spendMicros: 640_000,
      byBasis: { ACTUAL: 0, ESTIMATED: 640_000, FIXED: 0, MANUAL: 0 },
      byKind: { USAGE: 640_000, RECURRING: 0, ONE_TIME: 0 },
      currency: 'USD',
      mixedCurrency: false,
      services: 1,
      serviceIds: ['gogo.metrics'],
    },
  },
  providerRows: costProviderRows,
  unattributed: { providerIds: [], serviceIds: ['google.legacyGeocode'] },
}

export const costTestRuns: CmsCostTestRun[] = [
  {
    id: '33333333-0000-4000-8000-000000000001',
    name: 'e2e · suggestion smoke',
    environment: 'dev',
    status: 'ok',
    startedAt: iso(60 * 5),
    endedAt: iso(60 * 4),
    baselineSnapshotAt: iso(60 * 5),
    finalSnapshotAt: iso(60 * 4),
    gitSha: '9d0d85e',
    services: ['google.places', 'google.routeMatrix'],
    budget: { maxProviderCalls: 200, maxEstimatedCostMicros: 500_000 },
    notes: null,
  },
  {
    id: '33333333-0000-4000-8000-000000000002',
    name: 'load · room fanout',
    environment: 'dev',
    status: 'running',
    startedAt: iso(20),
    endedAt: null,
    baselineSnapshotAt: iso(20),
    finalSnapshotAt: null,
    gitSha: null,
    services: null,
    budget: null,
    notes: 'Đang chạy trong CI.',
  },
]

export const costTestRunDetails: Record<string, CmsCostTestRunDetail> = {
  '33333333-0000-4000-8000-000000000001': {
    ...costTestRuns[0]!,
    deltas: [
      {
        providerId: 'google',
        serviceId: 'google.places',
        operationId: 'google.placeDetails',
        usageMetricId: 'requests',
        billingSkuId: 'places.details.essentials',
        unit: 'request',
        usageBefore: 1_400,
        usageAfter: 1_520,
        usageDelta: 120,
        estimatedCostDelta: 40_000,
        actualCostDelta: null,
        currency: 'USD',
        basis: 'ESTIMATED',
        confidence: 'MEDIUM',
      },
      {
        providerId: 'google',
        serviceId: 'google.routeMatrix',
        operationId: 'google.routeMatrix',
        usageMetricId: 'billable_elements',
        billingSkuId: 'routes.matrix.element',
        unit: 'matrix_element',
        usageBefore: 8_000,
        usageAfter: 8_400,
        usageDelta: 400,
        // No verified per-element list price: the run's total is a floor.
        estimatedCostDelta: null,
        actualCostDelta: null,
        currency: 'USD',
        basis: 'UNKNOWN',
        confidence: 'LOW',
      },
    ],
    estimatedCostMicros: 40_000,
    actualCostMicros: null,
    unpriced: ['google.routeMatrix/billable_elements'],
  },
  '33333333-0000-4000-8000-000000000002': {
    ...costTestRuns[1]!,
    deltas: [
      {
        providerId: 'google',
        serviceId: 'google.places',
        operationId: 'google.placeDetails',
        usageMetricId: 'requests',
        billingSkuId: 'places.details.essentials',
        unit: 'request',
        usageBefore: 1_520,
        usageAfter: 1_520,
        usageDelta: 0,
        estimatedCostDelta: null,
        actualCostDelta: null,
        currency: 'USD',
        basis: 'UNKNOWN',
        confidence: 'LOW',
      },
    ],
    // The run is open: nothing has been measured, and 0 would read as a result.
    estimatedCostMicros: null,
    actualCostMicros: null,
    unpriced: [],
  },
}
