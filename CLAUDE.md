# GoGo-CMS

Back-office for GoGo (couple/group date planning). Pure client over the GoGo-BE
CMS APIs — no database, no direct provider calls, no business logic of its own.

**Stack:** React, TypeScript strict, Vite, TanStack Query (server state), TanStack Table (grids), react-hook-form + zod, generated OpenAPI client (never hand-edited), Vitest + Playwright + axe.

## Hard rules

- **The API is the authorization layer.** `RoleGate` hides what a role cannot use; it never *is* the permission check. Every action must survive a hand-crafted request. If the UI hides a button but the API still allows the call, that is a GoGo-BE bug — report it, do not patch around it in the client.
- **Roles:** `editor` / `moderator` / `ops_admin` / `super_admin`. Publish (import → catalog) is ops-only. Approving and activating a ranking config must be two different accounts. A suspended or demoted admin loses access on the next request — handle a mid-session 403 as a permission-denied screen, never a blank page.
- **The API client is generated** from `openapi/gogo.v1.yaml` (GoGo-BE). Never hand-write a DTO, never copy types across repos. CI fails when the client drifts from the declared OpenAPI version.
- **Money is integer minor units**; `total` vs `per_person` distinguished. Format at the display layer; never compute money in floats.
- **Taxonomy comes from the API as stable keys**; labels resolve via i18n (vi default, en secondary). No hardcoded taxonomy IDs, roles or provider IDs.
- **Every async screen** renders loading / empty / error / success plus permission-denied and offline/degraded. Every CTA handles pressed / loading / disabled. The `screen × role × state` matrix must actually render — a selector that only swaps a query param without changing the render is a bug.
- **Destructive actions show what changes.** Merging a place, bulk publishing, rolling back a ranking config must preview the effect. A bare "Are you sure?" dialog is not a confirmation.
- **Audit is a feature, not a log.** Wherever the BFF writes an audit entry, the CMS must show who did what and when, as a readable diff — ops should not need database access to reconstruct history.
- **No surplus PII.** Dashboards and tables show what the job needs: no exact origin coordinates, no email/phone unless the task requires it. Never log tokens, secrets, full payloads or PII.
- **Design:** same semantic tokens as the consumer app (coral/lavender/mint/amber/ivory/ink), different surface. This is a data-dense tool: opaque backgrounds, high contrast, tight spacing. Glass/blur is for overlays only (drawer, modal, popover) — never tables, forms or page backgrounds. WCAG 2.2 AA, full keyboard operation, 44×44 targets, colour never the sole signal.
- **Sessions** live in secure `HttpOnly` cookies; production requires SSO/MFA and a shorter timeout than the consumer app. No sensitive token in `localStorage` when a cookie will do.
- Clients talk only to the BFF `/v1` contract. Error envelope `{ code, message, field_errors, request_id, retryable }`.

## Ingestion specifics

- `POST /v1/cms/place-imports` is the **only** import path. The old `/v1/cms/import-jobs` was removed from GoGo-BE — do not integrate it.
- `dry_run` is the default mode and costs no provider quota. Make the user choose a writing mode deliberately.
- `paused_provider_quota` is **not a data error**. Say "provider quota exhausted, your rows are intact" and offer resume (`start`), do not render it as failure.
- `confirm-candidate` accepts only a `googlePlaceId` the resolver surfaced for that row; never offer a free-text field.
- Cancel stops unprocessed chunks only — already-imported rows stay. Do not promise a rollback the backend does not do.

## Git

Git Flow: `master` (prod, tags `vX.Y.Z`) / `develop` / `feature|bugfix|hotfix/GOGO-<issue>-<name>` / `release/x.y.z`. Squash merge for feature/bugfix. Conventional Commits, subject ≤ 50 chars. PR required, CI green, ≥1 approval.

Workspace docs (parent GoGo folder): `GOGO_SRS.md` §8.8–8.10, `GOGO_IMPLEMENTATION_WBS.md`, `GOGO_PLACE_INGESTION_SPEC.md` §9–10, `GOGO_FEATURE_IMPROVEMENT_SPEC.md`, `GOGO_ENGINEERING_SKILLS_AND_PLANS.md`.
