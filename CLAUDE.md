# GoGo-CMS

Back-office for GoGo (couple/group date planning). Pure client over the GoGo-BE
CMS APIs — no database, no direct provider calls, no business logic of its own.

**Stack:** React, TypeScript strict, Vite, TanStack Query (server state), TanStack Table (grids), react-hook-form + zod, generated OpenAPI client (never hand-edited), Vitest + Playwright + axe.

## Hard rules

- **The API is the authorization layer.** `RoleGate` hides what a role cannot use; it never *is* the permission check. Every action must survive a hand-crafted request. If the UI hides a button but the API still allows the call, that is a GoGo-BE bug — report it, do not patch around it in the client.
- **Roles:** `editor` / `moderator` / `ops_admin` / `super_admin`. **Read is hierarchical, write is not**: a safe method passes when the caller's rank (editor = moderator = 1, ops_admin = 2, super_admin = 3) is at least the lowest rank the route wants, so peers read each other's areas and nothing reads above it; every write still needs the exact role. Publish (import → catalog) is ops-only. Approving and activating a ranking config must be two different accounts. A suspended or demoted admin loses access — read included — on the next request; handle a mid-session 403 as a permission-denied screen, never a blank page.
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
- **Cookie sessions carry a CSRF double-submit.** Login sets `gogo_csrf` readable by JS; every cookie-authenticated mutation echoes it in `x-gogo-csrf` or GoGo-BE answers `403 CSRF_FAILED`. A 401 mid-session means the short-lived access cookie expired, not that the session ended — refresh once at `/v1/cms/auth/refresh` (single-use token, so never concurrently) and replay, then fall back to the login screen.
- **Deployed CMS serves `/v1` from its own origin** (Cloudflare Worker proxy, `docs/adr/0003-cms-hosting.md`). Calling the BFF hostname directly would force `SameSite=None` on the session cookie — the setting CSRF protection exists to avoid.

## Ingestion specifics

- `POST /v1/cms/place-imports` is the **only** import path. The old `/v1/cms/import-jobs` was removed from GoGo-BE — do not integrate it.
- `dry_run` is the default mode and costs no provider quota. Make the user choose a writing mode deliberately.
- `paused_provider_quota` is **not a data error**. Say "provider quota exhausted, your rows are intact" and offer resume (`start`), do not render it as failure.
- `confirm-candidate` accepts only a `googlePlaceId` the resolver surfaced for that row; never offer a free-text field.
- Cancel stops unprocessed chunks only — already-imported rows stay. Do not promise a rollback the backend does not do.

## Git

Git Flow: `master` (prod, tags `vX.Y.Z`) / `develop` / `feature|bugfix|hotfix/GOGO-<issue>-<name>` / `release/x.y.z`. Squash merge for feature/bugfix. Conventional Commits, subject ≤ 50 chars. PR required, CI green, ≥1 approval.

Workspace docs (parent GoGo folder): `GOGO_SRS.md` §8.8–8.10, `GOGO_IMPLEMENTATION_WBS.md`, `GOGO_PLACE_INGESTION_SPEC.md` §9–10, `GOGO_FEATURE_IMPROVEMENT_SPEC.md`, `GOGO_ENGINEERING_SKILLS_AND_PLANS.md`.

## GitHub identity: act as the agent App, never as the owner

Every write an agent session makes to GitHub — push, pull request, PR or issue comment, review
request — goes through the agent GitHub App (GoGo-Infra#250), so it is authored by `<app>[bot]`
and the owner can approve it. The wrapper lives in GoGo-Infra, checked out next to this
repository on an up-to-date `develop`:

```bash
../GoGo-Infra/scripts/secrets/as-agent.sh -- git push -u origin <branch>
../GoGo-Infra/scripts/secrets/as-agent.sh -- gh pr create --base develop --title "…" --body-file <file>
../GoGo-Infra/scripts/secrets/as-agent.sh -- gh issue comment <n> --body-file <file>
```

- The command after `--` is one of an allowlist of concrete forms: `git push <remote> …` (the
  remote by name, of this checkout, on github.com), `gh pr create|comment|edit|view|list|checks`,
  `gh issue create|comment|edit|close|reopen|view|list`, `gh run view|list`, `gh repo view`,
  `gh api <relative path>`. Every option must be in that form's table; anything else — a shell,
  a script, `env`, a path to git, `git -C …`/`-c …`, any other git subcommand or alias, a gh
  alias/extension, `gh pr merge`/`review`, `-R HOST/OWNER/REPO`, `--hostname`, a URL where a
  number belongs, `-w`/`-e` — is refused before any token is minted, and gh is pinned to
  github.com. Run it from the checkout it concerns. (GoGo-Infra `docs/secrets.md` → *Using it* has the
  tables and the stated residuals; a new form is one table line plus a test, never a wider rule.)
- The command runs in an environment the wrapper builds: your global/system git and gh config,
  `~/.netrc`, hooks and push signing are not loaded (proxy/CA only via the environment), and the
  gh forms have no git transport — push with the `git push` form first. Residual: programs on
  your `PATH` or named in this checkout's own config still run as you, with the token.
- Read-only calls (`gh pr view`, `gh pr checks`, `gh issue list`, `gh api` GETs) may use the
  session's own login.
- Minting the token needs AWS credentials for the `ci` rows (on the owner's workstation:
  `AWS_PROFILE=gogobootstrap`). If it fails, stop and tell the owner. Do not fall back to the
  owner's `gh` login or git keychain: a pull request authored by the owner cannot be approved by
  the owner, and the code-owner gate on `develop` exists for exactly that.
- A session with no AWS access (e.g. a cloud session) may push its branch with the access it
  has, but does not open the pull request itself: it reports the branch and the prepared PR body
  so a session that can run `as-agent.sh` opens it.
- The App has no `workflows` permission, by design: GitHub rejects a push from it that
  creates or changes anything under `.github/workflows/`. Push such a branch with the session's
  own git access (the push author does not count as the PR author), then open the pull request
  with `as-agent.sh` as usual.
- Never print the token, write it to git config or a file, or put it in a remote URL.
- Never merge. Merging stays with the owner.

Details, creation and revocation: GoGo-Infra `docs/secrets.md` → *Agent GitHub App*.
