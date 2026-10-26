export const styles = {
  root: 'flex min-h-full bg-surface-canvas',

  /*
   * Brand panel — the one deliberately expressive surface in the CMS. The
   * gradient is composed from accent tokens (primary → pressed), never a
   * literal: the Figma frame's three conflicting oranges map to the shipped
   * accent per .claude/rules/figma-mcp.md §4. White on it, not coral-soft:
   * soft-on-coral was 3.12 (GoGo-CMS#246).
   */
  brand:
    'hidden w-[420px] shrink-0 flex-col justify-between p-10 text-neutral-0 lg:flex ' +
    'bg-[linear-gradient(160deg,var(--color-accent-primary)_0%,var(--color-accent-pressed)_100%)]',
  brandTop: 'flex items-center gap-3',
  brandLogoBox:
    'flex h-14 w-14 shrink-0 items-center justify-center rounded-sheet bg-neutral-0 shadow-lg',
  brandWordmark: 'font-display text-display font-extrabold leading-none tracking-tight',
  brandSuffix: 'text-caption font-bold uppercase tracking-widest text-neutral-0',
  brandHeadline: 'mb-4 font-display text-hero font-extrabold leading-tight',
  brandLede: 'text-sm leading-relaxed text-neutral-0',
  brandBullets: 'flex flex-col gap-3',
  brandBullet: 'flex items-center gap-2.5 text-sm text-neutral-0',
  brandFoot: 'text-xs text-neutral-0',

  form: 'flex flex-1 items-center justify-center p-8',
  formInner: 'w-full max-w-sm',
  mobileBrand: 'mb-6 flex items-center gap-2 lg:hidden',
  mobileWordmark: 'font-display text-lg font-extrabold text-text-primary',
  mobileSuffix: 'rounded bg-coral-soft px-1.5 py-0.5 text-caption font-bold text-coral-ink',

  stepHead: 'mb-8',
  stepBadge:
    'mb-4 flex h-12 w-12 items-center justify-center rounded-sheet border border-accent-primary/30 bg-accent-soft text-accent-on-soft',
  title: 'font-display text-2xl font-bold text-text-primary',
  subtitle: 'mt-1 text-sm text-text-muted',

  fields: 'flex flex-col gap-4',
  passwordWrap: 'relative',
  passwordToggle: 'absolute right-1 top-[26px]',

  /* Single sign-on (GoGo-BE#679): the button, then what it does, then the way
     back to identity selection when Access vouched for the wrong person. */
  ssoBlock: 'mb-6 flex flex-col gap-3',
  ssoHint: 'text-xs text-text-muted',
  ssoLink: 'font-semibold text-accent-primary underline underline-offset-2',
  ssoDivider: 'mt-2 border-t border-line pt-4 text-xs text-text-secondary',

  alert:
    'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text-primary',
  alertDanger:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger-ink',

  /* Environment notice under the form — colour per environment, never colour alone. */
  envNote: 'mt-6 flex items-start gap-2 rounded-card border px-4 py-3 text-xs',
  envDev: 'border-lavender/40 bg-lavender-soft text-text-primary',
  envProduction: 'border-danger/40 bg-danger-soft text-text-primary',

  footNote: 'mt-6 border-t border-line pt-4 text-caption leading-relaxed text-text-secondary',
  localeRow: 'mt-4 flex items-center justify-center gap-1 text-caption text-text-secondary',
  localeButton: 'min-h-11 rounded-compact px-2 font-semibold hover:text-text-primary',
  localeActive: 'text-accent-primary',
} as const
