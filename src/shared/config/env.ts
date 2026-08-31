/**
 * Which deployment the operator is looking at.
 *
 * Resolved from build config only. Never from the hostname and never from an
 * API response: a preview domain, a tunnel or a proxied host would all lie,
 * and the one thing this value controls — the production warning — must not be
 * defeatable by the URL somebody typed. `VITE_APP_ENV` is inlined at build
 * time by Vite, so each artefact knows what it is.
 */
export const APP_ENVIRONMENTS = ['dev', 'staging', 'production'] as const

export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number]

function isAppEnvironment(value: unknown): value is AppEnvironment {
  return typeof value === 'string' && (APP_ENVIRONMENTS as readonly string[]).includes(value)
}

/**
 * Read at call time rather than cached in a module constant, so a test can
 * stub the variable and so a mis-set value degrades to the least alarming
 * environment instead of throwing the shell away.
 */
export function getAppEnvironment(): AppEnvironment {
  const raw: unknown = import.meta.env.VITE_APP_ENV
  return isAppEnvironment(raw) ? raw : 'dev'
}
