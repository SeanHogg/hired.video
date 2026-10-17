# Architecture remediation — 2026-10-17

Source: architecture review artifact https://claude.ai/artifact/LcUEeCR7DWuJ56Xqu5zueD
Gap rows: #2410–#2417 (ROADMAP.md, TK1 OTHER section).

## Rules for every work package (read before editing)

1. **Work on main, in place. Do not commit, stash, reset, checkout or revert anything.** Other sessions have uncommitted work in the tree.
2. **Shared files:** the other session committed its studio work (5229d934); `studio.ts` etc. are now editable by the package that owns them. Always re-read a file immediately before editing it (other agents work in parallel). Locale JSONs and `api/src/app.ts` are shared: add/remove only your own lines.
   **KV policy (owner decision):** stay on Workers Free — per-user caches use `api/src/utils/isolate-cache.ts` (no KV writes); KV is only for scheduler work markers.
3. **Own only your package's paths.** If a fix needs a file another package owns, note it in your report instead of editing it.
4. **Migrations:** use only your reserved number block; never edit an applied migration; every index must be declared in the schema `.ts` (CI `drizzle-kit push --force` drops undeclared indexes); follow `api/drizzle/CONVENTIONS.md`. Destructive drops are **archive-first**: `ALTER TABLE … SET SCHEMA archive` (create schema if missing), never `DROP TABLE`.
5. **Architecture:** route → use case/service → repository; no new god files (>400 lines); extract shared primitives and migrate every duplicate in the same pass; delete dead code you orphan (verify zero refs across api/frontend/shared/packages/extension).
6. **i18n:** every new user-facing string goes through `t()` with flat keys in `frontend/public/locales/{en,es,fr-CA}.json` (real translations).
7. **Theme/responsive:** any UI touched uses tokens, works light/dark and at 360px.
8. **Do not run typecheck/tests yourself** — the coordinator runs a Sonnet verify pass after each wave. Keep code compiling by construction (update every caller/import).
9. **Report** at the end: files changed, what each finding became, anything blocked with ONE concrete blocker.

## Migration number blocks

| Package | Block |
|---|---|
| W1-A Billing | 0535–0539 |
| W1-B Neon/persistence | 0540–0544 |
| W1-D Data model (indexes/orphans/crypto) | 0545–0559 |
| W1-E Code DRY | 0560–0564 |
| W2 API consolidation | 0565–0574 |
| W1 cleanup (used) | 0575–0578 |
| W3-A Engagement (views/comments/reactions/shares/reports) | 0580–0589 |
| W3-B Money + tokens + settings | 0590–0599 |
| W3-C Provider connections | 0600–0609 |
| W3-D1 Studio state + JSONB promotions | 0610–0619 |
| W3-D2 Status/role/application/identity/lists/sequences/perf | 0620–0639 |
| W3-E Versions | 0640–0649 |

## Wave 3 data-migration rules
- New canonical table → `INSERT … SELECT` backfill from every old table in the SAME migration (idempotent: `ON CONFLICT DO NOTHING` on a natural key or a carried-over id) → switch ALL code to the new table → archive old tables with `ALTER TABLE … SET SCHEMA archive` in a LATER migration file of your block (never DROP).
- Keep every API response shape identical; keep the old row ids where possible (copy `id`) so URLs/FKs stay valid; repoint inbound FKs.
- Polymorphic columns are `subject_type` + `subject_id` with a CHECK sourced from a `shared/` registry and an index `(subject_type, subject_id, created_at DESC)` (CONVENTIONS.md).
- Declare every new index in schema .ts; run nothing destructive on data that can't be backfilled.

## Waves

- **Wave 1 (parallel, disjoint):** A Billing & checkout · B Neon & persistence · C Frontend client · D Data-model hygiene · E Shared primitives & RBAC/notifications/LLM.
- **Wave 2:** API surface consolidation (aliases, AI tools dispatcher, analytics events, résumé PATCH, admin composite, middleware userId/zod-validator/DomainError/envelope/notFound) + god route splits.
- **Wave 3:** polymorphic table merges (views, shares, auth tokens, wallets/ledgers, provider connections, versions, comments, reactions), `studio_projects` single state column, status vocab, frontend god-module splits.
