import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from './AppShell'
import { RequireAuth } from './RequireAuth'
import { LoadingState } from '@/shared/ui/State'

// Route files stay thin: they point at the screen's `.view` implementation
// under `src/features/<feature>/` and add nothing else.
const LoginScreen = lazy(() => import('@/features/auth/login.view'))
const DashboardScreen = lazy(() => import('@/features/ops/dashboard.view'))
const PlaceListScreen = lazy(() => import('@/features/places/placeList.view'))
const PlaceEditorScreen = lazy(() => import('@/features/places/placeEditor.view'))
const ImportListScreen = lazy(() => import('@/features/imports/importList.view'))
const ImportWizardScreen = lazy(() => import('@/features/imports/importWizard.view'))
const ImportJobScreen = lazy(() => import('@/features/imports/jobDetail.view'))
const ModerationQueueScreen = lazy(() => import('@/features/moderation/moderationQueue.view'))
const ReviewListScreen = lazy(() => import('@/features/moderation/reviewList.view'))
const SubmissionQueueScreen = lazy(() => import('@/features/submissions/submissionQueue.view'))
const TaxonomyScreen = lazy(() => import('@/features/taxonomy/taxonomy.view'))
const CollectionsScreen = lazy(() => import('@/features/collections/collections.view'))
const RecommendationListScreen = lazy(
  () => import('@/features/recommendations/recommendationList.view'),
)
const PlanTemplateListScreen = lazy(() => import('@/features/planTemplates/planTemplateList.view'))
const PlanTemplateDetailScreen = lazy(
  () => import('@/features/planTemplates/planTemplateDetail.view'),
)
const RecommendationDetailScreen = lazy(
  () => import('@/features/recommendations/recommendationDetail.view'),
)
const BannerListScreen = lazy(() => import('@/features/banners/bannerList.view'))
const BannerDetailScreen = lazy(() => import('@/features/banners/bannerDetail.view'))
const SafetyRuleListScreen = lazy(() => import('@/features/safety/safetyRuleList.view'))
const SafetyRuleDetailScreen = lazy(() => import('@/features/safety/safetyRuleDetail.view'))
const SettingsScreen = lazy(() => import('@/features/ranking/settings.view'))
const NewAccountScreen = lazy(() => import('@/features/admins/newAccount.view'))
const AdminListScreen = lazy(() => import('@/features/admins/adminList.view'))
const AuditLogScreen = lazy(() => import('@/features/audit/auditLog.view'))
const SearchQualityScreen = lazy(() => import('@/features/search/searchQuality.view'))
const ForbiddenScreen = lazy(() => import('@/features/errors/forbidden.view'))
const NotFoundScreen = lazy(() => import('@/features/errors/notFound.view'))

function Lazy() {
  return (
    <Suspense
      fallback={
        <div className="p-6">
          <LoadingState />
        </div>
      }
    >
      <Outlet />
    </Suspense>
  )
}

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <Suspense fallback={<LoadingState />}>
        <LoginScreen />
      </Suspense>
    ),
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      {
        element: <Lazy />,
        children: [
          { index: true, element: <DashboardScreen /> },
          { path: 'places', element: <PlaceListScreen /> },
          { path: 'places/:id', element: <PlaceEditorScreen /> },
          { path: 'imports', element: <ImportListScreen /> },
          { path: 'imports/new', element: <ImportWizardScreen /> },
          { path: 'imports/:jobId', element: <ImportJobScreen /> },
          { path: 'moderation', element: <ModerationQueueScreen /> },
          // Reviews have their own filtered, cursor-paged queue since
          // GoGo-BE#219; the detail drawer opens over it on the same route.
          { path: 'moderation/reviews', element: <ReviewListScreen /> },
          { path: 'moderation/reviews/:reviewId', element: <ReviewListScreen /> },
          { path: 'submissions', element: <SubmissionQueueScreen /> },
          { path: 'taxonomy', element: <TaxonomyScreen /> },
          { path: 'collections', element: <CollectionsScreen /> },
          { path: 'recommendations', element: <RecommendationListScreen /> },
          { path: 'recommendations/:id', element: <RecommendationDetailScreen /> },
          { path: 'plan-templates', element: <PlanTemplateListScreen /> },
          { path: 'plan-templates/:id', element: <PlanTemplateDetailScreen /> },
          { path: 'banners', element: <BannerListScreen /> },
          { path: 'banners/:id', element: <BannerDetailScreen /> },
          { path: 'safety-rules', element: <SafetyRuleListScreen /> },
          { path: 'safety-rules/:id', element: <SafetyRuleDetailScreen /> },
          { path: 'settings', element: <SettingsScreen /> },
          { path: 'settings/accounts', element: <AdminListScreen /> },
          { path: 'settings/accounts/new', element: <NewAccountScreen /> },
          { path: 'search-quality', element: <SearchQualityScreen /> },
          { path: 'audit', element: <AuditLogScreen /> },
          { path: '403', element: <ForbiddenScreen /> },
          { path: '*', element: <NotFoundScreen /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
