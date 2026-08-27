import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 18, children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

/**
 * GoGo brandmark — same geometry as the mobile splash
 * (`GoGo-MobileApp/src/features/onboarding/splash.view.tsx`): two overlapping
 * coral discs with a white lens where they meet. Colours come from the token
 * layer via `currentColor` on the outer wrapper.
 */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 42 42" fill="none" aria-hidden="true">
      <circle cx="14" cy="21" r="9" fill="var(--color-coral)" />
      <circle cx="28" cy="21" r="9" fill="var(--color-coral)" opacity="0.6" />
      <path
        d="M21 14C17 14 14 17 14 21C14 25 17 28 21 28C25 28 28 25 28 21C28 17 25 14 21 14Z"
        fill="var(--color-neutral-0)"
      />
    </svg>
  )
}

export const DashboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="1" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="10" y="1" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="1" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <rect x="10" y="10" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
  </Icon>
)

export const PlacesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M9 1.5C6.515 1.5 4.5 3.515 4.5 6C4.5 9.375 9 16.5 9 16.5C9 16.5 13.5 9.375 13.5 6C13.5 3.515 11.485 1.5 9 1.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <circle cx="9" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.5" />
  </Icon>
)

export const ModerationIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M9 1.5 15 4v5c0 3.6-2.6 6.4-6 7.5C5.6 15.4 3 12.6 3 9V4l6-2.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M6.5 9 8.3 10.8 11.8 7.3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)

export const TaxonomyIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M2 4.5h14M2 9h10M2 13.5h6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
)

export const CollectionsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="1.5" y="3.5" width="15" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    <path d="M5.5 1.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path
      d="M6 8.5l2 2 4-4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)

export const ImportIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M9 1.5v9M6 7.5l3 3 3-3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M2.5 12v3a1 1 0 001 1h11a1 1 0 001-1v-3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
)

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M9 1.5v2M9 14.5v2M1.5 9h2M14.5 9h2M3.697 3.697l1.414 1.414M12.889 12.889l1.414 1.414M3.697 14.303l1.414-1.414M12.889 5.111l1.414-1.414"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
)

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.75" cy="7.75" r="5.25" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M11.75 11.75 15.5 15.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
)

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M9 1.5C6.24 1.5 4 3.74 4 6.5v.8L2.5 10.5h13L14 7.3v-.8C14 3.74 11.76 1.5 9 1.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M7 13a2 2 0 004 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
)

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3v12M3 9h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </Icon>
)

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M3.5 9.5l3.5 3.5 7.5-8"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M9 2 16.5 15.5h-15L9 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path d="M9 7v3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="9" cy="13" r="0.75" fill="currentColor" />
  </Icon>
)

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
    <path d="M9 8v4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="9" cy="5.5" r="0.85" fill="currentColor" />
  </Icon>
)

export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M12 2.5l3.5 3.5-9 9H3v-3.5l9-9Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </Icon>
)

export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M2.5 4.5h13M6.5 4.5V3h5v1.5M7 7.5v5M11 7.5v5M4 4.5l.7 10.5h8.6L14 4.5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)

export const MoreIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="4" r="1.2" fill="currentColor" />
    <circle cx="9" cy="9" r="1.2" fill="currentColor" />
    <circle cx="9" cy="14" r="1.2" fill="currentColor" />
  </Icon>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M6.5 3.5 12 9l-5.5 5.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M11.5 3.5 6 9l5.5 5.5"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)

export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M9 2v9M5.5 8 9 11.5 12.5 8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3 13v1.5A1.5 1.5 0 004.5 16h9a1.5 1.5 0 001.5-1.5V13"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
)

export const PlayIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M5 3.5 14 9l-9 5.5v-11Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </Icon>
)

export const StopIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
  </Icon>
)

export const RetryIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M15 9a6 6 0 11-1.9-4.4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M15.5 2v3.5H12"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)

export const MergeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M4 2v4.5c0 2 1.6 3.5 3.5 3.5H14"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path d="M4 16v-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path
      d="M11 7l3 3-3 3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)

export const StarIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M9 2l2.1 4.3 4.7.7-3.4 3.3.8 4.7L9 12.8 4.8 15l.8-4.7L2.2 7l4.7-.7L9 2Z"
      fill="currentColor"
    />
  </Icon>
)

export const DragIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="4.5" r="1.1" fill="currentColor" />
    <circle cx="11" cy="4.5" r="1.1" fill="currentColor" />
    <circle cx="7" cy="9" r="1.1" fill="currentColor" />
    <circle cx="11" cy="9" r="1.1" fill="currentColor" />
    <circle cx="7" cy="13.5" r="1.1" fill="currentColor" />
    <circle cx="11" cy="13.5" r="1.1" fill="currentColor" />
  </Icon>
)

export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M7 3H4a1 1 0 00-1 1v10a1 1 0 001 1h3"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path
      d="M11 5.5 14.5 9 11 12.5M14.5 9H7"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)

export const ShieldOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M9 1.5 15 4v5c0 3.6-2.6 6.4-6 7.5C5.6 15.4 3 12.6 3 9V4l6-2.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M6.5 6.5l5 5M11.5 6.5l-5 5"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </Icon>
)

export const OfflineIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M2 6.5a10 10 0 0114 0M4.5 9.5a6 6 0 019 0"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <circle cx="9" cy="13.5" r="1.1" fill="currentColor" />
    <path d="M2 2l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </Icon>
)

export const InboxIcon = (p: IconProps) => (
  <Icon {...p}>
    <path
      d="M2 10.5 4 3.5h10l2 7v4a1 1 0 01-1 1H3a1 1 0 01-1-1v-4Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M2 10.5h4a3 3 0 006 0h4"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </Icon>
)

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M9 5v4.2l2.8 1.8"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
)
