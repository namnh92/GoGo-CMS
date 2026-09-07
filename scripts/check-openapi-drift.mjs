#!/usr/bin/env node
/**
 * CI gate: the vendored contract must match the version this client declares,
 * and the generated types must be in sync with the vendored spec.
 *
 * Run `pnpm api:check`. Failing here means someone changed the contract
 * without regenerating — fix by re-vendoring the spec and `pnpm api:types`.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const SPEC = 'openapi/gogo.v1.yaml'
const GENERATED = 'src/shared/api/schema.d.ts'
const EXPECTED_VERSION = process.env.GOGO_API_VERSION ?? '1.0.0-alpha.3'

const spec = readFileSync(SPEC, 'utf8')
const declared = /^\s{2}version:\s*(.+)$/m.exec(spec)?.[1]?.trim()

if (declared !== EXPECTED_VERSION) {
  console.error(
    `✖ OpenAPI version drift: spec declares "${declared}", client expects "${EXPECTED_VERSION}"`,
  )
  process.exit(1)
}

const workdir = mkdtempSync(join(tmpdir(), 'gogo-openapi-'))
const candidate = join(workdir, 'schema.d.ts')
try {
  execFileSync('npx', ['openapi-typescript', SPEC, '-o', candidate], { stdio: 'ignore' })
  if (readFileSync(candidate, 'utf8') !== readFileSync(GENERATED, 'utf8')) {
    console.error('✖ Generated client is stale. Run `pnpm api:types` and commit the result.')
    process.exit(1)
  }
} finally {
  rmSync(workdir, { recursive: true, force: true })
}

console.log(`✔ OpenAPI ${declared} in sync`)
