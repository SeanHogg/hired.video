# PRD — Context-Aware Help System

**Status:** v2 (content-as-files + caching-first) built 2026-06-13 (gaps #2001–#2009; v2 = #2009 supersedes the v1 DB-content build). tsc + lint clean both projects; help-service (6) + content (10) unit tests pass. NOT runtime-verified (needs migration 0210 applied; semantic search needs the Vectorize index provisioned). Remaining items at the end + in the Consolidated Gap Register.
**Owner:** Platform
**Related:** [[project_context_aware_help]] memory, [page → video](./.) (#1860), Consolidated Gap Register #2001–#2008.

---

## 1. Problem

Help content was fragmented across three disconnected stores:

1. **DB articles** (`kind=article|faq|guide`) — searchable, curatable, moderated.
2. **Static FAQ catalogue** (`frontend/data/help-faqs.ts`) — not searchable server-side, not localized, not mappable.
3. **Static `/guides/*` rich React pages** — not searchable, not mappable, not in any index.

There was no way to surface the *right* help on the *right* page, no localized help, and `/help` was a dead-end catalogue users had to leave their task to visit. We need help that (a) appears in context, (b) is searchable, (c) is curatable by a SuperAdmin, and (d) is localized with an English fallback.

## 2. Goals & principles

- **Content is separate from the database.** Help content (titles, bodies, FAQ answers, per-locale variants) lives as **static files** (one Markdown file per item per locale), bundled/edge-served and hard-cached. **A help view never makes a DB round-trip for content.** The DB is a **meta store, used strictly for search + mapping** — never the content of record.
- **One content store.** That store is the file tree, not a parallel mix of DB rows + static React pages.
- **Context-aware surfacing.** On any page, a slide-out drawer shows help curated for *that kind of page* — no per-page wiring.
- **Searchable.** Free-text search across all help, keyword now and semantic when provisioned.
- **Curatable.** A SuperAdmin maps help items (by slug) to page contexts (DB meta, live-editable) and (re)builds the search index from an admin UI.
- **Localized.** Each help item resolves to the user's locale (es / fr-CA) with EN fallback — at the file level (a missing `<slug>.<locale>.md` falls back to `<slug>.en.md`).
- **No new infra cost / minimal Neon load.** Content reads hit no DB at all; the only Neon table is the mapping meta; vectors live off-Neon on a free tier.

## 3. Non-goals

- Per-page help is **explicitly curated, not embedding-matched** (precision > recall on the in-context surface).
- We do **not** auto-generate help content (authoring stays human/editorial).
- We do **not** (yet) retire the bespoke rich `/guides/*` React pages — they remain the deep-dive experience.

## 4. Architecture (rearchitected — v2, content-as-files + caching-first)

> **v1 (shipped 2026-06-13) is superseded.** v1 stored help content (FAQ answers, guide bodies, per-locale variants) in Postgres (`articles` + `help_content_translations`) and read it on every request. That violated two principles: content must be separate from the DB, and content reads must not hit the DB. §9 covers the migration off v1.

### 4.0 Three layers, three caches
Help has three distinct concerns; each lives in the layer that fits and is cached at that layer. **No content is ever served from the DB.**

| Layer | Holds | Store | Cache |
|-------|-------|-------|-------|
| **Content** | titles, summaries, bodies, per-locale variants | **Markdown files** in the repo | Bundled at build → immutable, content-hashed static asset → browser + CDN cache; in-memory after first parse |
| **Mapping (meta)** | context → ordered slug list, `is_active` | DB (`help_mappings`, slug-keyed) | `getOrSetCached` (L1 isolate Map + L2 KV), invalidated on curation write |
| **Search (meta)** | searchable index of items | Cloudflare Vectorize (semantic) + bundled corpus (keyword) | KV read-through under a version token; Vectorize is itself the cache |

### 4.1 Content layer — Markdown files, zero DB
- One file per item per locale: `frontend/content/help/<slug>.<locale>.md` (e.g. `getting-started.en.md`, `getting-started.es.md`, `getting-started.fr-CA.md`). EN (`<slug>.en.md`) is the **fallback** — a missing locale file resolves to EN.
- YAML frontmatter is the per-item **metadata**: `slug`, `kind` (faq|guide), `title`, `summary`, `category`, `order`. Body is the prose.
- Bundled via `import.meta.glob('../content/help/*.md', { eager, query: '?raw' })` → content ships **inside the app bundle** as a content-hashed asset. **Result: a help view does zero network + zero DB work** — the browser already has it, cached immutably until the next deploy.
- One frontend module (`lib/help/content.ts`) is the single seam: `getHelpItem(slug, locale)` (locale resolve + EN fallback), `listHelpItems({ kind })`, `helpCatalog` (parsed once, memoized). Everything (drawer, `/help`, search rendering, article view) reads through it — DRY.

### 4.2 Mapping layer — DB meta, KV-cached
- `help_mappings` (context_key → **slug** + position + is_active). Slug-keyed (not `article_id`) because content is no longer in `articles`. SuperAdmin-curated live (the reason this is DB, not frontmatter).
- `HelpMappingService.resolveForContext(ctx)` returns **slugs + light meta**, read-through cached per context (no locale dimension — locale is resolved at the file layer on the client). Invalidated on curation write. The drawer turns slugs → cards via the bundled content module. **The resolve never touches content.**

### 4.3 Search layer — DB strictly for search
- **Keyword**: runs **client-side over the bundled corpus** (instant, zero DB) — the corpus is already in memory.
- **Semantic**: Cloudflare Vectorize index keyed by slug; embeddings from Workers AI `@cf/baai/bge-base-en-v1.5`. Synced from the content files on deploy (`POST /api/help/reindex` walks the manifest). **Neon holds no search text** — it only holds mappings. Query results are slugs → rendered from bundled content. Read-through cached (version token) at the edge.
- Falls back to keyword when Vectorize is unbound.

### 4.4 Join key — reuse, don't reinvent
Mappings key on `AIContextType` (`detectContextType`, `shared/ai-context-types.ts`) — the AI brain's existing route→context seam. No second route matcher.

### 4.5 API — `/api/help/*` (meta only)
- `GET /contexts` — active context keys (membership set, KV-cached). SA `GET/POST/DELETE /mappings`, `POST /reindex`.
- `GET /resolve?context=` — slugs + meta for a context (KV-cached). **No `faqs`/`guides`/content endpoints** — those are served from bundled files, not the API.
- `GET /search?q=` — semantic slugs (when Vectorize bound); keyword is client-side and needs no endpoint.

### 4.6 Frontend
- `lib/help/content.ts` — the content seam (bundled MD, locale fallback).
- `<HelpDrawer>` — context → slugs (cached resolve) → cards from bundled content; search box runs client-side keyword + optional semantic.
- `/help` (Help Center) — FAQ + Guides tabs render from the bundled catalog (no DB). Search shares the same client-side index.
- `/admin/help-mappings` — curate context→slug mappings (the slug picker lists the bundled catalog) + "Rebuild semantic index".

## 5. Localization

Per `shared/i18n.ts` (`en`, `es`, `fr-CA`). Localization happens at the **file** level: `<slug>.<locale>.md`. `getHelpItem(slug, locale)` resolves the requested locale and falls back to `<slug>.en.md` when absent. No DB, no per-request locale query — the active locale picks the bundled variant in memory.

## 6. Success metrics (to instrument — see remaining items)

- Drawer open rate per context; card click-through from the drawer.
- Help search queries with **zero results** (content-gap signal).
- Deflection: support-contact rate on pages with vs. without curated help.
- Localized-read share (non-EN locale resolutions served).

## 7. Remaining items

| Ref | Item | Notes |
|-----|------|-------|
| ~~rearch~~ ✅ | **Build v2 (this rearchitecture)** — DONE 2026-06-13 | Content MD files (63), `lib/help/content.ts` seam, `help_mappings` re-keyed to slug, search = bundled keyword + Vectorize-by-slug, `/help/:slug` reader. |
| #2004 (activate) | **Provision Vectorize** | Create the `help-content` index, bind `VECTORIZE` + `AI`, run reindex (now walks the file manifest, not DB rows). Keyword (client-side) works without it. |
| #2003 (decision) | **Retire bespoke `/guides/*` React pages?** | Once guides are MD files, the rich pages either become the rendered MD or stay as bespoke deep-dives. Product call. |
| new | **Curation-assist** | "Suggest items for this route" in `/admin/help-mappings` via semantic nearest-to-context. Depends on #2004. |
| new | **Help analytics** | Instrument §6 metrics. None captured today. |
| new | **Translation-coverage check** | CI check flagging any `<slug>` missing an `.es.md` / `.fr-CA.md` so help doesn't silently ship EN-only. Trivial with files (glob diff). |
| new | **Authoring UX** | Content is edited as files (PR/deploy). A future in-app authoring surface would write files via a content API; out of scope for v2. |
| verify | **Runtime verification** | v2 needs a runtime pass once built (no DB harness today). |

## 8. v1 → v2 migration (what to revert)

v1 is typecheck/test-green but **not deployed** (migrations 0210–0212 not applied), so this is a clean replace, not a data migration:
- **Keep:** `help_mappings` table + `HelpMappingService` shell + routes + `<HelpDrawer>` + `/admin/help-mappings` + the Vectorize/Workers-AI embedding module + `AIContextType` join key + the #2005/#2006 narrated-video work (unrelated).
- **Re-key:** `help_mappings.article_id` → `slug` (varchar). Resolve returns slugs.
- **Remove:** content seeding from `articles` (0210 part 2, 0211), the `help_content_translations` table (0212), `listFaqs`/`listGuides` DB readers, the per-locale DB overlay, and `card-feed`/`Help.tsx` reads of those endpoints. Replace with the bundled content module.
- **Net Neon footprint for help:** one small `help_mappings` table. No content, no translations, no search text.

## 9. Rollout

1. Land v2 (content files + content seam + slug-keyed mappings + reindex-from-files).
2. Ship frontend (drawer + `/help` + admin read the bundled catalog).
3. (When ready) provision Vectorize + bindings, run reindex → semantic search activates; keyword already works.
4. Instrument analytics; iterate curation from zero-result + low-CTR signals.
