export const styles = {
  root: 'flex min-h-full bg-surface-sunken',

  /*
   * Brand panel — the one deliberately expressive surface in the CMS. The
   * gradient is composed from brand tokens (coral → coral-deep), never a
   * literal: the Figma frame's three conflicting oranges map to the shipped
   * coral per .claude/rules/figma-mcp.md §4.
   */
  brand:
    'hidden w-[420px] shrink-0 flex-col justify-between p-10 text-neutral-0 lg:flex ' +
    'bg-[linear-gradient(160deg,var(--color-coral)_0%,var(--color-coral-deep)_100%)]',
  brandTop: 'flex items-center gap-3',
  brandLogoBox:
    'flex h-14 w-14 shrink-0 items-center justify-center rounded-sheet bg-neutral-0 shadow-lg',
  brandWordmark: 'font-display text-[22px] font-extrabold leading-none tracking-tight',
  brandSuffix: 'text-[11px] font-bold uppercase tracking-widest text-coral-soft',
  brandHeadline: 'mb-4 font-display text-[32px] font-extrabold leading-tight',
  brandLede: 'text-sm leading-relaxed text-coral-soft',
  brandBullets: 'flex flex-col gap-3',
  brandBullet: 'flex items-center gap-2.5 text-sm text-coral-soft',
  brandFoot: 'text-xs text-neutral-0/60',

  form: 'flex flex-1 items-center justify-center p-8',
  formInner: 'w-full max-w-sm',
  mobileBrand: 'mb-6 flex items-center gap-2 lg:hidden',
  mobileWordmark: 'font-display text-lg font-extrabold text-text',
  mobileSuffix: 'rounded bg-coral-soft px-1.5 py-0.5 text-[10px] font-bold text-coral-ink',

  stepHead: 'mb-8',
  stepBadge:
    'mb-4 flex h-12 w-12 items-center justify-center rounded-sheet border border-coral/30 bg-coral-ghost text-coral-deep',
  title: 'font-display text-2xl font-bold text-text',
  subtitle: 'mt-1 text-sm text-text-muted',

  fields: 'flex flex-col gap-4',
  passwordWrap: 'relative',
  passwordToggle: 'absolute right-1 top-[26px]',
  otpInput: 'text-center font-mono text-2xl tracking-[0.5em]',
  otpCompat: 'mt-4 text-center text-xs text-text-subtle',
  backButton: 'w-full py-1 text-center text-xs text-text-subtle hover:text-text',

  alert:
    'flex items-start gap-2 rounded-compact border border-amber/40 bg-amber-soft px-3 py-2 text-xs text-text',
  alertDanger:
    'flex items-start gap-2 rounded-compact border border-danger/40 bg-danger-soft px-3 py-2 text-xs text-danger-ink',

  /* Environment notice under the form — colour per environment, never colour alone. */
  envNote: 'mt-6 flex items-start gap-2 rounded-card border px-4 py-3 text-xs',
  envDev: 'border-lavender/40 bg-lavender-soft text-text',
  envProduction: 'border-danger/40 bg-danger-soft text-text',

  footNote: 'mt-6 border-t border-line pt-4 text-[11px] leading-relaxed text-text-subtle',
  localeRow: 'mt-4 flex items-center justify-center gap-1 text-[11px] text-text-subtle',
  localeButton: 'min-h-11 rounded-compact px-2 font-semibold hover:text-text',
  localeActive: 'text-coral-deep',
} as const
