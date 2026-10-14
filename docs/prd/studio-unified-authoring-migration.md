# PRD — Studio as the Universal Authoring Surface

**Status:** Proposed · **Opened:** 2026-06-07 · **Parent gaps:** #1912 (paged document runtime), #1915 (retire form pages), #1918 (structured-builder runtime) · **Author:** Studio unified-editor initiative

---

## 1. Vision

**Every piece of content on hired.video is created, edited, and previewed in the Studio.** There is one authoring surface, not a constellation of bespoke `*CreatePage` / `*EditPage` / `*Builder` form pages. Clicking **"+ New X"** anywhere — a course, an article, a company, a job, a pitch deck — opens that entity in the Studio. Editing an existing X opens the same Studio surface bound to its row.

This is already true for **resumes** and **jobs** (both edit on the `document` mediaKind canvas). This PRD extends the pattern to every remaining authoring surface.

### The "form is the meta panel" principle

The user-facing model (from the Course example): when you create a Course, the Studio shows a **metadata form** — title, cover image, summary, theme, category, tags, price, description — *as part of the create flow*. That form is the entity's **meta panel**: the structured fields that describe the artifact. The **body** is authored separately on the canvas:

- **Meta panel** = the structured fields (the "form"). Schema-driven, reused across entities (DRY).
- **Body** = the content the entity *is*:
  - a **paged document** (resume / job / article / blog) — the existing `document` canvas, OR
  - a **structured builder** (course modules+lessons, screening questions, pitch-deck slides) — an ordered list / DAG / multi-step builder, NOT a printable page, OR
  - **nothing** — some entities are meta-only (company, service offering, voice clone).

So the migration needs **two Studio runtimes** sharing **one meta-panel + field-schema foundation**:

| Runtime | Geometry | Backs | Status |
|---|---|---|---|
| `document` | Fixed print sheet (Letter/A4 × orientation), paged WYSIWYG | resume, job, article, blog | **Shipped** (#1912) |
| `structured` (NEW) | Non-paged ordered-list / DAG / wizard | course, screening template, interview set, pitch deck, scorecard, learning path, + meta-only entities | **Not built** (#1918) |

> **Preview === render === view.** Each entity's read-only renderer (already used on its detail/public page) is the same component the Studio mounts read-only, so what you author is exactly what ships.

---

## 2. Scope

### In scope (content + structured authoring)
Content-document entities, structured builders, and entity-metadata forms — everything a user *authors*.

### Out of scope (app chrome — stays native)
Settings, account, billing / `/checkout/*`, payouts, auth (`/login`, `/signup`, password reset), messaging / inbox, bookings / `/book/*`, event creation, admin (`/admin/*`), and one-time consent/enrollment wizards (CreatorEnrollmentWizard, PartnerProgramOptInDialog). These are transactional/config chrome, not content.

### Already migrated (reference implementations)
- **Resume** — `/resumes/create*` + `/resumes/edit/:id` → `/studio` (`?editResume` / `contentTemplate=resume-doc`). #1915.
- **Job (edit)** — `/jobs/edit/:id` → `/studio?editJob`. Document canvas; screening lifted to `/jobs/:id/screening`. #1914.

---

## 3. Foundation (Phase 0 — gates the structured track)

These cross-cutting tasks unblock everything in Phase 2+. **Do these first.**

> **Status (2026-06-07):** T0.2 ✅ (shared `FieldGroupEditor` engine + `chips` type + `MetaPanel`), T0.1 **core** ✅ (`builder-state.ts` + `builder-edit.ts` + 13 tests — the pure model/mutations), T0.3 ✅ (`studio-authoring.ts` registry + `studioEditHref`; StudioLanding edit branches collapsed to one loop). **Remaining:** T0.1 **mount + persistence** (`BuilderStage`/`BuilderView`, `structured` mediaKind + `builder_state` column + migration + CanvasRouter/save wiring), T0.4 catalog entries, T0.5 (this playbook is §6). tsc + 128 studio tests green.

- **T0.1 — Structured-builder runtime (`structured` Studio surface).** Per #1918: a non-paged runtime mounted by `CanvasRouter` (sibling to `DocumentStage`), reusing the full Studio shell (left rail, layers/outline, undo/redo, AI, save). Define `BuilderState` (ordered sections → children; supports list + DAG), `builder-edit.ts` pure mutations (add/remove/reorder/nest), `useKindHydration`, persistence (`studio_projects.builder_state` JSONB or reuse `document_state` with a discriminator — decide in design), and the read-only `BuilderView`. **Do NOT force these into `DocumentEntityKind`/Letter geometry.** Dependency for: courses, screening, interview sets, pitch decks, scorecards, learning paths.
- **T0.2 — Shared meta-panel.** Extract the entity-metadata "form" as a schema-driven panel reusing the existing field engine ([document-field-schema.ts](../../frontend/lib/studio/document/document-field-schema.ts) + [SectionEditor.tsx](../../frontend/components/studio/document/SectionEditor.tsx)). Add the field types entity metas need: `chips` (tags), `category`, `price` (currency+amount), `theme-select`, plus the existing `text/textarea/select/multiselect/number/date/day/image/list`. One panel, every entity declares its meta schema. This is the "form" the user sees in the create flow.
- **T0.3 — Authoring-href + deep-link convention.** One shared helper `studioAuthoringHref(kind, id?)` → `/studio?edit<Kind>=<id>` (edit) or `/studio?create=<kind-template>` (new), plus the matching `StudioLanding` deep-link handlers + `redirecting` guard entries. Replaces per-entity ad-hoc `?editResume`/`?editJob`/`?editArticle` strings with one rule (DRY). Every "+ New X" / "Edit" button routes through it.
- **T0.4 — StudioLanding catalog entries (#1917).** Every creatable entity gets a catalog card (icon, audience, `documentEntityKind` or `builderKind`) so the Studio landing lists *everything* a user can make.
- **T0.5 — Migration playbook (per-entity checklist).** Codify the repeatable retirement steps so each entity PR is mechanical: (1) add catalog + deep-link, (2) bind meta-panel schema, (3) bind body runtime, (4) entity-aware fetch + save-back (create-on-first-save), (5) repoint all "+ New"/"Edit" entry points via `studioAuthoringHref`, (6) delete the standalone page + now-orphaned form components (verify zero refs), (7) point the detail page's read-only renderer at the shared renderer, (8) log residuals.

---

## 4. Per-entity migration tasks

Each task notes: **target runtime · meta fields · body/children · API · entry points to repoint · dead code to delete · deferred**.

### Phase 1 — Document track (no new runtime; uses shipped `document` canvas)

- **T1.1 — Articles / Blog (creator).** Target: **document canvas** (body already block-modeled; `?editArticle` deep-link already works).
  - Meta: `kind` (article/faq/guide), `category`, `tags`, `coverImageUrl`, `sector`, `audience`, `locations`, `status`.
  - Body: Tiptap `bodyJson` ↔ `DocumentBlock[]` adapter (improve fidelity beyond the current paragraph-level [document-from-article.ts](../../frontend/lib/studio/document/document-from-article.ts) / [document-to-article.ts](../../frontend/lib/studio/document/document-to-article.ts)).
  - API: `POST/PATCH /api/articles`. Page/components to retire: [ArticlesManagerPanel](../../frontend/components/creator/ArticlesManagerPanel.tsx) editor, [ArticleEditor](../../frontend/components/articles/ArticleEditor.tsx) (Tiptap).
  - Entry points: `ArticlesManagerPanel` "New piece" + each row's "Edit" → `studioAuthoringHref`.
  - Deferred: rich Tiptap node fidelity (tables/embeds) in both adapters.
- **T1.2 — Job CREATE funnel. SHIPPED.** Target: **document canvas**. Pages `JobCreatePage.tsx` and `PostAJob.tsx` are deleted (pin [legacy-redirects.test.tsx](../../frontend/lib/routing/__tests__/legacy-redirects.test.tsx)). `/jobs/create`, `/jobs/create/:id`, `/jobs/upload`, `/post-a-job` → `studioNewEntityHref("job")` = `/studio?contentTemplate=job_doc`. `/jobs/edit/:id` → `studioEditHref("job", id)`. Canvas is the form: [job-field-schema.ts](../../frontend/lib/studio/document/job-field-schema.ts) + [JobDocumentInspector.tsx](../../frontend/components/studio/document/JobDocumentInspector.tsx). Import (file/URL/AI) lives in [job-import.ts](../../frontend/lib/studio/document/job-import.ts). Signed-out Post a Job lands on [PostJobLeadDialog](../../frontend/components/studio/landing/PostJobLeadDialog.tsx) (`/studio?postJob=1`). Do not reverse.

### Phase 2 — Structured track: meta-only entities (needs T0.2; light/no body)

- **T2.1 — Companies. LARGELY SHIPPED (redirected).** Pages `CompanyCreatePage`/`CompanyEditPage`/`CompanyBuilder` deleted. `/companies/create*` → `company_doc`; `/companies/edit/:id` → `editCompany`. Remaining: confirm meta-panel parity vs the retired CompanyBuilder field set.
- **T2.2 — Creator Offerings / Services.** Target: **meta-only structured**. Meta: title, description, category, priceCents, priceVisible, deliveryDays. API: `/api/services`. Retire: [OfferingsPanel](../../frontend/components/services/OfferingsPanel.tsx) create/edit dialog.
- **T2.3 — Voice clones.** Target: **meta-only structured + media upload**. Meta: name, description, language, gender, accent, priceUsd, public, consent; body = the 30s+ audio sample upload. API: `/api/voice-clones`. Retire the create flow in [VoiceCloneManager](../../frontend/components/studio/VoiceCloneManager.tsx). (Note: voice is also a Studio mediaKind for *generation*; this task is the clone-asset authoring/registration.)

### Phase 3 — Structured track: builders (needs T0.1)

- **T3.1 — Courses (flagship — the user's example).** Target: **structured builder**. Meta panel: title, coverImageUrl (+ auto-generate), summary, theme, category, tags, price, description, assignedReviewer (admin). Body: modules → lessons DAG; lesson `sourceType` ∈ {text_md, scorm_package, studio_video, external_url}. API: `/api/courses` (+ modules/lessons). Retire: [CoursesManagerPanel](../../frontend/components/creator/CoursesManagerPanel.tsx) create/edit, fold [CourseModulesEditor](../../frontend/components/courses/CourseModulesEditor.tsx) + [CourseContentEditor](../../frontend/components/creator/CourseContentEditor.tsx) into the builder. Entry: "+ New course" → `studioAuthoringHref("course")`. `/services/creator/courses` keeps the *list*; create/edit goes to Studio.
- **T3.2 — Pitch decks.** Target: **structured builder** (ordered candidate slides). Meta: name, description, brandKit, redactionEnabled. Body: ordered slides (candidateId, notes, matchScore, redactionOverride). API: `/api/pitch-decks` (+ slides). Retire: [PitchDeckBuilder](../../frontend/pages/services/PitchDeckBuilder.tsx). Routes `/people/pitch-decks/:id` → Studio.
- **T3.3 — Screening templates.** Target: **structured builder**. Meta: name, roleFamily, description, assessmentKinds, includeReferences, minReferences. Body: questions (custom/work_auth/visa/eeo/knockout). API: `/api/screening-templates`. Retire the dialog builder in [ScreeningTemplates](../../frontend/pages/services/ScreeningTemplates.tsx).
- **T3.4 — Interview templates / question sets.** Target: **structured builder**. Meta: title, description, targetRole, style, prepTimeSec, maxRetakes, proctoringOn, companyId. Body: ordered questions. API: `/api/interview-question-sets`. Retire the dialog in [InterviewTemplates](../../frontend/pages/tools/InterviewTemplates.tsx).
- **T3.5 — Job scorecards / screening config.** Target: **structured builder** (multi-section). The `/jobs/:id/screening` surface ([JobScreeningPage](../../frontend/pages/JobScreeningPage.tsx)) + scorecard editors ([ScorecardTemplateEditor](../../frontend/components/scorecards/ScorecardTemplateEditor.tsx), InterviewKitEditor, StageQuestionsEditor, TakeHomePromptEditor) become a Studio structured builder. Closes the #1954 "Studio-native screening" deferral.

### Phase 4 — Advanced / decision-gated

- **T4.1 — Learning paths & cohorts.** Target: **structured builder** (DAG + assignments). Authoring for `learning_paths` / cohorts (see learning-pathways / learning-cohorts work). Largest DAG case — validates the builder runtime's graph mode.
- **T4.2 — Profile / People section editing (DECISION REQUIRED).** Today PeopleDetail uses per-section edit *dialogs* (header/about/contact/skills/social/customUrl). Options: (a) leave as native inline dialogs (they're lightweight, in-context, arguably better than a full Studio trip); (b) a Studio "profile" meta surface. **Recommend (a)** unless profiles gain a designed/printable layout — flag for product. Do not migrate speculatively.

---

## 5. Execution order & dependencies

```
Phase 0 (foundation)         T0.1 structured runtime ─┐  T0.2 meta-panel ─┐  T0.3 href ─┐  T0.4 catalog ─┐  T0.5 playbook
                                                      │                  │             │               │
Phase 1 (document, parallel) T1.1 Articles ───────────┼──────────────────┘ (needs T0.2/0.3/0.5; NOT T0.1)
                             T1.2 Job create funnel ───┘
Phase 2 (meta-only)          T2.1 Companies · T2.2 Offerings · T2.3 Voice clones      (needs T0.2/0.3/0.4/0.5)
Phase 3 (builders)           T3.1 Courses · T3.2 Pitch decks · T3.3 Screening · T3.4 Interview · T3.5 Scorecards  (needs T0.1)
Phase 4                      T4.1 Learning paths/cohorts · T4.2 Profile (decision)   (needs T0.1)
```

- **Critical path** for the structured track is **T0.1** (the builder runtime). Start it immediately; Phase 1 (Articles, Job-create) can proceed in parallel since they ride the shipped document canvas.
- **T3.1 Courses** is the flagship validation of the structured runtime — prioritize it first within Phase 3.

## 6. Per-entity Definition of Done (the playbook, T0.5)
1. StudioLanding catalog entry + `studioAuthoringHref` deep-link (create + edit).
2. Meta-panel schema declared; renders the "form" in the Studio.
3. Body bound to the right runtime (document canvas / structured builder / none).
4. Entity-aware fetch + save-back with **create-on-first-save** (mirror resume/job).
5. ALL "+ New"/"Edit" entry points repointed; old route → redirect.
6. Standalone page + orphaned form components **deleted** (grep zero refs across frontend/backend/shared).
7. Detail/public page renders via the **shared read-only renderer** (preview === view).
8. Tests updated; tsc + lint clean; residuals logged to the Consolidated Gap Register.

## 7. Risks & open questions
- **Builder persistence shape** (T0.1): new `builder_state` column vs. reuse `document_state` with a discriminator — design decision; prefer a dedicated column to avoid overloading the document schema.
- **Meta vs. body boundary** per entity must be explicit so save-back never drops fields (the job migration's passthrough pattern is the template).
- **Profile editing** (T4.2) — genuinely may stay native; don't migrate without product sign-off.
- **DAG vs. list** in the builder runtime — courses/learning-paths need nesting + ordering; ship list mode first, graph mode for T4.1.
- **Import seeds** (job file/URL/AI extract; resume upload) must survive the funnel into the Studio create flow.

## 8. Tracking
Rolls up under gap **#1915** (retire form pages) and **#1918** (structured-builder runtime). A pointer entry lives in the Consolidated Gap Register; per-entity work is tracked by the **T#** IDs in this PRD.
