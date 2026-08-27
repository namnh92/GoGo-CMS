type ClassValue = string | false | null | undefined

/** Tiny class joiner. No dependency, no runtime surprises. */
export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ')
}
