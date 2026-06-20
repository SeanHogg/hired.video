## Localization (i18n) Coverage Catalog

**What this measures.** The catalogue files ([en.json](hired.video/frontend/public/locales/en.json) / [es.json](hired.video/frontend/public/locales/es.json) / [fr-CA.json](hired.video/frontend/public/locales/fr-CA.json)) are at ~99% **key** parity — almost every key that exists is translated into all three locales. The gap is the opposite end: most pages/components still render **hardcoded English literals that never call `t()`**, so a Quebec/LatAm visitor sees English regardless of catalogue completeness. The "~95% Spanish coverage" claim elsewhere in this README refers to *key* coverage; this section measures *page wiring* coverage, which is much lower.

**How to regenerate (single source of truth).** Numbers below are produced by [scripts/i18n-coverage.cjs](hired.video/frontend/scripts/i18n-coverage.cjs), a heuristic detector that counts `t()`/`<Trans>` calls vs. user-facing hardcoded literals (JSX text nodes, UI attributes like `placeholder`/`title`/`aria-label`/`alt`, and `toast`/`alert`/`confirm` messages) per file:

```
cd hired.video/frontend
node scripts/i18n-coverage.cjs            # user-facing pages, table
node scripts/i18n-coverage.cjs --md       # markdown (this table)
node scripts/i18n-coverage.cjs --components# include components/
node scripts/i18n-coverage.cjs --staff     # include admin/superadmin
```
`coverage% = (t + Trans) / (t + Trans + hardcoded)`. The detector errs toward over-counting hardcoded text, so a page only reads 100% when it has no stray literals. Treat counts as ±a few; use them for ranking/triage, not as a compiler.

**Scope of the "to 100%" target.**
- **In scope:** all user-facing `pages/*` (table below) plus the components each page renders (a page is not "done" until its child components stop leaking English — see gap #1894 for the data-catalog leakers).
- **Staff-only (`pages/admin/*`, `pages/superadmin/*`) — out of scope, English by policy** (gap #634): 24 files / ~408 hardcoded strings, excluded from the table. Pass `--staff` to include them.
- **Legal bodies** ([TermsOfService.tsx](hired.video/frontend/pages/TermsOfService.tsx) #1200, plus already-extracted Privacy/Cookie) get structurally localized here, but the es/fr-CA copy is competent working-knowledge and still needs **certified legal-translator review before CA/MX launch** (gap #1202).
- **Components scope (tracked separately):** `components/*` carries another ~5,600 hardcoded strings across ~656 files at ~26% coverage. Highest-leverage shared components ([SearchBar.tsx](hired.video/frontend/components/SearchBar.tsx), [ResumeViewer.tsx](hired.video/frontend/components/ResumeViewer.tsx), studio panels) are pulled in alongside the pages that render them.

**Headline (user-facing pages, regenerated 2026-06-20 after the ≥80% + 60–79% completion sweeps):** **73% localized · 1,993 hardcoded strings remaining across 187 files · 20 hardcoded-free (24 rows round to ✅ 100%).** (Baseline at catalog creation: 34% / 3,820 / 173 files.) Total project surface incl. components ≈ 9,800 hardcoded strings. **Caveat:** on pages already ≥80%, the residual count is dominated by detector false positives (TypeScript generics/arrow code read as JSX text — `useState<T>(null)`, `z.infer<typeof>`, ternaries `) : (` — plus brand/proper nouns and contact emails), **not** raw-key leaks. Use the count for triage of *low*-coverage pages; for high-coverage pages inspect the `--json` `samples` before assuming a leak.

**Progress log** (newest first — update when a page reaches ✅ 100%):
- 2026-06-20 **60–79% band sweep** — same per-page-`.tsx`-edit + central-merge pattern via 4 parallel agents (**34 new keys × 3 locales** at en/es/fr-CA parity, zero collisions). Real copy localized: [Careers.tsx](hired.video/frontend/pages/Careers.tsx) (68→95%; Hiring-Process + FAQ + CTA sections, module arrays → `t`-factories), [ResumeTailor.tsx](hired.video/frontend/pages/tools/ResumeTailor.tsx) (72→90%; job-desc/resume-picker labels + run-history strings), [Career360.tsx](hired.video/frontend/pages/tools/Career360.tsx) (74→92%; legend/stamps copy + `_one`/`_other` plural), [Dashboard.tsx](hired.video/frontend/pages/Dashboard.tsx) (69→74%; `buildDashboardTabs(t)` factory), [GigMarketplace.tsx](hired.video/frontend/pages/GigMarketplace.tsx) (70→72%; `useSEO` title/desc). The other 6 band files — [ResumeConsolidator.tsx](hired.video/frontend/pages/tools/ResumeConsolidator.tsx), [VendorSync.tsx](hired.video/frontend/pages/tools/VendorSync.tsx), [PredictiveAssessments.tsx](hired.video/frontend/pages/tools/PredictiveAssessments.tsx), [VerifyEmail.tsx](hired.video/frontend/pages/VerifyEmail.tsx), [ValueProposition.tsx](hired.video/frontend/pages/tools/ValueProposition.tsx), [JobResumeMatch.tsx](hired.video/frontend/pages/tools/JobResumeMatch.tsx) — were **already fully localized**; their 4–18 residual flags are 100% detector false positives (`useState<T>(null)` generics read as JSX text, per gap #2217), verified via `--json` `samples`. `tsc` clean; raw-key scan confirms zero new leaks. Overall hardcoded 2,023→1,993.
- 2026-06-20 **≥80% completion sweep** — drove every user-facing page already at **≥80% coverage** to its genuine ceiling via 11 parallel agents (per-page `.tsx` edits, **107 new keys × 3 locales** merged centrally at en/es/fr-CA parity, zero collisions; `w` derives automatically). Genuine English leaks wrapped across **18 pages** — highlights: [PitchDeckBuilder.tsx](hired.video/frontend/pages/services/PitchDeckBuilder.tsx) (86→93%, whole `SlideEditor` sub-component had no i18n), [InterviewTemplates.tsx](hired.video/frontend/pages/tools/InterviewTemplates.tsx) (86→94%), [JobApplicationPage.tsx](hired.video/frontend/pages/JobApplicationPage.tsx) (83→93%, screening preview block w/ `_one`/`_other` plurals), [Home.tsx](hired.video/frontend/pages/Home.tsx) (96→98%), [Settings.tsx](hired.video/frontend/pages/Settings.tsx) (97→98%, Social-publishing card), [Contributors.tsx](hired.video/frontend/pages/Contributors.tsx) (92→96%), [Resumes.tsx](hired.video/frontend/pages/Resumes.tsx) (93→94%, MarketingFAQ block), [Tasks.tsx](hired.video/frontend/pages/Tasks.tsx) (91→93%, `buildEventsFaq(t)` factory), plus Companies/CompanyDetail status badges, StudioLanding/StudioSidebar, ProfileAudit/VideoPitchLab/SummarizeResume run-history + AI-coach strings, and SEO `useSEO`/`useUgcSeo` titles on Gig*/SourcingBrowse/TranscriptSearch/SharedCandidateResume/SharedPitchDeck. [ForRecruiters.tsx](hired.video/frontend/pages/ForRecruiters.tsx) reached ✅ 100%. `tsc` clean. Overall 72%→73%, 19→20 hardcoded-free pages (ForRecruiters newly zero-leak); also fixed two pre-existing raw-key leaks in JobCreatePage (`labels.sector`, `labels.unspecified` had no catalogue entry → rendered the raw key). **Key finding:** the other ~39 ≥80% pages had **no genuine leaks left** — their flags are detector false positives (TS generics/arrow code as JSX text + brand/proper nouns/emails like hired.video, info@hired.video, SCORM, testimonial names). Reaching a literal 100% there would mean wrapping non-copy or breaking code, so they were left as-is. Detector refinement (strip generics, brand allowlist) logged as a gap.
- 2026-06-12 **studio/services/recruit wave** — localized the next 5 high-leverage 0%-coverage pages in parallel (per-page `.tsx` edits, 320 keys merged centrally at en/es/fr-CA parity, zero collisions): [StudioLayout.tsx](hired.video/frontend/pages/studio/StudioLayout.tsx) (0%→🟡 93%; full landing/hero/features/how-it-works/9-item FAQ + ~80 toast/dialog/onboarding strings, all control arrays → `t`-taking factories), [StudioLanding.tsx](hired.video/frontend/pages/studio/StudioLanding.tsx) (0%→🟡 85%; template grid + project cards + empty/provenance states, reused `actions.{edit,delete,preview,use,retry}` + `labels.{public,private,name,type,updated}` + `fields.visibility.label`), [PaidMediaPage.tsx](hired.video/frontend/pages/paid-media/PaidMediaPage.tsx) (0%→🟡 89%; connections/campaigns/pixels/reporting tabs — **fixed a key collision the localizer introduced**: the platform-name fallback and the "Platform" column header had been collapsed onto one `labels.paidMedia.platform` key → split the fallback into `labels.paidMedia.platformFallback`), [ScreeningTemplates.tsx](hired.video/frontend/pages/services/ScreeningTemplates.tsx) (0%→🟡 91%), [LiveScreens.tsx](hired.video/frontend/pages/recruit/LiveScreens.tsx) (0%→🟡 91%; replaced ad-hoc `+ "s"` pluralization with proper i18next plurals). **320 new keys × 3 locales**, including **10 i18next `_one`/`_other` plural entries** (5 `{{count}}` keys: liveScreens invite/candidate counts + auto-matched, studioLayout script-rewritten + voiceover-added). `tsc` clean across all 5. Overall 68%→72%, –199 hardcoded. Residual 4–14 flags per file are heuristic over-counts (enum/status values, data-URL placeholders, em-dashes), not raw-key leaks.
- 2026-06-12 **info/marketing-page wave** — localized 5 high-leverage 0%-coverage pages in parallel (page `.tsx` edited per-page, all 327 keys merged centrally at en/es/fr-CA parity, zero key collisions): [ForAgencies.tsx](hired.video/frontend/pages/ForAgencies.tsx) (0%→✅ 100%; hero + 6 feature blocks + "typical week" timeline + 10-item FAQ, module-level `FEATURE_BLOCKS`/`FAQ_ITEMS`/step arrays moved inside the component with stable React keys, reused `actions.seePricing` + `headings.faq`), [ChromeExtension.tsx](hired.video/frontend/pages/ChromeExtension.tsx) (0%→✅ 100%; both extension cards + detail grids + 8-item FAQ, `{{tier}}` interpolation, reused `labels.chromeExtensions`), [Security.tsx](hired.video/frontend/pages/Security.tsx) (0%→🟡 97%; all 6 control arrays + `SECTIONS`/`STANDARDS` converted to `t`-taking factories, `STATUS_META.label`→`labelKey`, dropped dead `Server`/`Network` icon imports; security standard proper nouns left as-is), [Help.tsx](hired.video/frontend/pages/Help.tsx) (0%→🟡 98%), [Contributors.tsx](hired.video/frontend/pages/Contributors.tsx) (0%→🟡 92%, reused `status.loading` + `labels.unknown`). **327 new keys × 3 locales (en/es/fr-CA); `w` derives automatically.** `tsc` clean across all 5. Overall 66%→68%, 15→17 pages at 100%. Residual 1–3 flags on Security/Help/Contributors are heuristic over-counts (brand names / interpolated values / emoji), not raw-key leaks.
- 2026-06-07 **search-card sweep (W-language QA, cont.)** — localized the search/result cards flagged in `w`-locale: [ContentCard.tsx](hired.video/frontend/components/search/ContentCard.tsx) (article/guide/FAQ type + CTA labels, "Pro", reading time, share toast, free-text article category via new [lib/article-category.ts](hired.video/frontend/lib/article-category.ts) `articleCategoryI18nKey` with raw fallback); [PeopleCard.tsx](hired.video/frontend/components/PeopleCard.tsx) vertical layout (status badge, Connected/Creator/Open-to-Work, `at {company}`, Connections/Followers/profile-views, Active/Joined dates, talent-pool labels) — and **extracted the connect dialog**, which was a verbatim hardcoded duplicate of the already-translated horizontal-layout dialog, into one shared `connectDialog` element (DRY); [EntityMedia.tsx](hired.video/frontend/components/studio/EntityMedia.tsx) + [CreateVideoMenuItem.tsx](hired.video/frontend/components/studio/CreateVideoMenuItem.tsx) (the "ARTICLE PROMO MEDIA"/"PROFILE REEL MEDIA" header, "X items" pluralized count, Create/No-media/Edit-in-Studio, studio-subject labels via `studioSubject.<kind>.label` with shared-map fallback; deleted the now-dead `itemsHeaderLabel` export). **49 new keys × 3 locales (incl. 15 article-category + 7 studio-subject values + i18next plurals).** `tsc` clean. Remaining category render sites still tracked under #1952.
- 2026-06-07 **chrome sweep (W-language QA)** — localized always-on app chrome flagged during `w`-locale review: sidebar pills ([AITokenPill.tsx](hired.video/frontend/components/AITokenPill.tsx), [PointsPill.tsx](hired.video/frontend/components/PointsPill.tsx)) were 100% hardcoded → fully wired; footer legal links ([LegalLinks.tsx](hired.video/frontend/components/LegalLinks.tsx)) + footer resource-maps ([AudienceLinks.tsx](hired.video/frontend/components/landing/AudienceLinks.tsx), audience labels resolved from the shared registry via `audiences.<key>.label` with registry-label fallback); header search control ([HeaderSearch.tsx](hired.video/frontend/components/HeaderSearch.tsx)); audio narrator Voice & speed ([TextNarrator.tsx](hired.video/frontend/components/audio/TextNarrator.tsx)); course category badge ([CourseLearner.tsx](hired.video/frontend/pages/CourseLearner.tsx) via [lib/course-category.ts](hired.video/frontend/lib/course-category.ts), known seeded values AI/Career/Engineering, free-text falls back raw). Sidebar nav already used `t()` but keys were missing/untranslated: added `labels.tasksAndEvents` + `labels.wishlist`, fixed es `outreach`/`marketplace` (were English) and fr `myServices`/`tools` (grammar/English leak). **121 new keys × 3 locales (en/es/fr-CA) + 4 es/fr value fixes; `w` derives automatically.** `tsc` clean. Residual leakers in adjacent components logged as #1948–#1950.
- 2026-06-04 **wave 2 repair (#1899 resolved)** — recovered all 412 missing keys for the 13 partially-edited pages (English reconstructed from each `t()` call site + natural es/fr-CA), merged at parity (en 7038 / es 7008 / fr-CA 7024 keys). `tsc` clean; a key-literal scan confirms **0 raw-key leaks remain**. Overall 56% → 64%. The 13 pages are now partially localized like the rest (no regression); finishing their residual strings is part of the ongoing sweep.
- 2026-06-04 **wave 1** — 17 highest-leverage pages localized (~1,000 strings → 889 new keys × 3 locales, merged at parity): [Pricing.tsx](hired.video/frontend/pages/Pricing.tsx), [People.tsx](hired.video/frontend/pages/People.tsx), [JobCreatePage.tsx](hired.video/frontend/pages/JobCreatePage.tsx), [Jobs.tsx](hired.video/frontend/pages/Jobs.tsx), [Resumes.tsx](hired.video/frontend/pages/Resumes.tsx), [ResumeDetail.tsx](hired.video/frontend/pages/ResumeDetail.tsx), [InterviewPractice.tsx](hired.video/frontend/pages/InterviewPractice.tsx), [MyInterviewAssignments.tsx](hired.video/frontend/pages/MyInterviewAssignments.tsx), [Companies.tsx](hired.video/frontend/pages/Companies.tsx), [CompanyDetail.tsx](hired.video/frontend/pages/CompanyDetail.tsx), [Tools.tsx](hired.video/frontend/pages/Tools.tsx), [Rewards.tsx](hired.video/frontend/pages/Rewards.tsx), [Onboarding.tsx](hired.video/frontend/pages/Onboarding.tsx), [Checkout.tsx](hired.video/frontend/pages/Checkout.tsx), [AffiliateProgram.tsx](hired.video/frontend/pages/AffiliateProgram.tsx), [ServicesManagement.tsx](hired.video/frontend/pages/ServicesManagement.tsx), [EventNew.tsx](hired.video/frontend/pages/EventNew.tsx). `tsc` clean. Child-component leakers surfaced for follow-up (see #1898).
- 2026-06-04 **wave 2 (ABORTED — partial, see #1899)** — a parallel agent batch on ~20 tools/studio/services/recruiter pages was interrupted (API errors + cancellation). **No fragment keys were merged.** 13 of those pages were left with partial `t()` edits referencing **394 keys absent from the catalogue** → they render raw dotted keys to users. `tsc` is clean. Recovery: revert the 13 files (editor/VCS) or complete them by adding the 394 keys. Affected: tools/{SentimentAnalysis,InterviewQuestions,InterviewTemplates,ResumeConsolidator,ResumeTailor,SalaryCalculator,VideoPitchLab,SkillExtractor}, studio/{StudioSidebar,v2/StudioEditorV2}, services/PitchDeckBuilder, people/PeopleRoster, recruiter/PlacementDetail, bookings/BookingsHost, CourseLearner.
- 2026-06-04 — Home route ([Index.tsx](hired.video/frontend/pages/Index.tsx)) child components localized: [UnifiedSearch](hired.video/frontend/components/UnifiedSearch.tsx), [FeaturedTools](hired.video/frontend/components/FeaturedTools.tsx), [LatestGuides](hired.video/frontend/components/LatestGuides.tsx), [TemplateGallery](hired.video/frontend/components/resume-renderer/TemplateGallery.tsx) (30 keys × 3 locales). Catalog + this section established.

### Catalog — user-facing pages (sorted by hardcoded count, highest leverage first)

| File | t()+Trans | Hardcoded | Coverage |
|------|----------:|----------:|---------:|
| [pages/TermsOfService.tsx](hired.video/frontend/pages/TermsOfService.tsx) | 0 | 390 | 🔴 0% |
| [pages/studio/v2/StudioEditorV2.tsx](hired.video/frontend/pages/studio/v2/StudioEditorV2.tsx) | 78 | 77 | 🔴 50% |
| [pages/tools/SkillExtractor.tsx](hired.video/frontend/pages/tools/SkillExtractor.tsx) | 11 | 36 | 🔴 23% |
| [pages/bookings/BookingsHost.tsx](hired.video/frontend/pages/bookings/BookingsHost.tsx) | 12 | 34 | 🔴 26% |
| [pages/PrivacyPolicy.tsx](hired.video/frontend/pages/PrivacyPolicy.tsx) | 252 | 30 | 🟡 89% |
| [pages/studio/AsyncInterviewPage.tsx](hired.video/frontend/pages/studio/AsyncInterviewPage.tsx) | 0 | 29 | 🔴 0% |
| [pages/studio/StudioWizard.tsx](hired.video/frontend/pages/studio/StudioWizard.tsx) | 0 | 29 | 🔴 0% |
| [pages/recruit/AgentRuns.tsx](hired.video/frontend/pages/recruit/AgentRuns.tsx) | 0 | 28 | 🔴 0% |
| [pages/PeopleOperations.tsx](hired.video/frontend/pages/PeopleOperations.tsx) | 0 | 27 | 🔴 0% |
| [pages/people/PeopleGoals.tsx](hired.video/frontend/pages/people/PeopleGoals.tsx) | 0 | 26 | 🔴 0% |
| [pages/people/PeopleOneOnOnes.tsx](hired.video/frontend/pages/people/PeopleOneOnOnes.tsx) | 0 | 26 | 🔴 0% |
| [pages/services/CandidateDetail.tsx](hired.video/frontend/pages/services/CandidateDetail.tsx) | 3 | 26 | 🔴 10% |
| [pages/studio/StudioProjectActions.tsx](hired.video/frontend/pages/studio/StudioProjectActions.tsx) | 0 | 25 | 🔴 0% |
| [pages/CandidateScreening.tsx](hired.video/frontend/pages/CandidateScreening.tsx) | 0 | 24 | 🔴 0% |
| [pages/Feed.tsx](hired.video/frontend/pages/Feed.tsx) | 0 | 24 | 🔴 0% |
| [pages/marketplace/CoursePublicDetail.tsx](hired.video/frontend/pages/marketplace/CoursePublicDetail.tsx) | 0 | 24 | 🔴 0% |
| [pages/Jobs.tsx](hired.video/frontend/pages/Jobs.tsx) | 125 | 24 | 🟡 84% |
| [pages/References.tsx](hired.video/frontend/pages/References.tsx) | 0 | 23 | 🔴 0% |
| [pages/EventManage.tsx](hired.video/frontend/pages/EventManage.tsx) | 3 | 22 | 🔴 12% |
| [pages/PrivacyOptOut.tsx](hired.video/frontend/pages/PrivacyOptOut.tsx) | 0 | 21 | 🔴 0% |
| [pages/studio/StudioActions.tsx](hired.video/frontend/pages/studio/StudioActions.tsx) | 0 | 21 | 🔴 0% |
| [pages/recruiter/PlacementDetail.tsx](hired.video/frontend/pages/recruiter/PlacementDetail.tsx) | 14 | 21 | 🔴 40% |
| [pages/Outreach.tsx](hired.video/frontend/pages/Outreach.tsx) | 149 | 21 | 🟡 88% |
| [pages/guides/VideoBestPractices.tsx](hired.video/frontend/pages/guides/VideoBestPractices.tsx) | 0 | 20 | 🔴 0% |
| [pages/PivotExplorer.tsx](hired.video/frontend/pages/PivotExplorer.tsx) | 0 | 20 | 🔴 0% |
| [pages/SectorLanding.tsx](hired.video/frontend/pages/SectorLanding.tsx) | 0 | 20 | 🔴 0% |
| [pages/seo/SalaryPage.tsx](hired.video/frontend/pages/seo/SalaryPage.tsx) | 0 | 20 | 🔴 0% |
| [pages/tools/FormAutofill.tsx](hired.video/frontend/pages/tools/FormAutofill.tsx) | 26 | 20 | 🔴 57% |
| [pages/tools/ResumeConsolidator.tsx](hired.video/frontend/pages/tools/ResumeConsolidator.tsx) | 69 | 18 | 🟡 79% |
| [pages/bookings/ReservationPage.tsx](hired.video/frontend/pages/bookings/ReservationPage.tsx) | 0 | 17 | 🔴 0% |
| [pages/bookings/BookPage.tsx](hired.video/frontend/pages/bookings/BookPage.tsx) | 0 | 16 | 🔴 0% |
| [pages/marketplace/VoicePublicDetail.tsx](hired.video/frontend/pages/marketplace/VoicePublicDetail.tsx) | 0 | 14 | 🔴 0% |
| [pages/recruiter/BdPipeline.tsx](hired.video/frontend/pages/recruiter/BdPipeline.tsx) | 0 | 14 | 🔴 0% |
| [pages/services/PitchDecksList.tsx](hired.video/frontend/pages/services/PitchDecksList.tsx) | 0 | 14 | 🔴 0% |
| [pages/JobDetail.tsx](hired.video/frontend/pages/JobDetail.tsx) | 9 | 14 | 🔴 39% |
| [pages/AICoach.tsx](hired.video/frontend/pages/AICoach.tsx) | 0 | 13 | 🔴 0% |
| [pages/LiveScreenInvite.tsx](hired.video/frontend/pages/LiveScreenInvite.tsx) | 0 | 13 | 🔴 0% |
| [pages/ResumeRoast.tsx](hired.video/frontend/pages/ResumeRoast.tsx) | 0 | 13 | 🔴 0% |
| [pages/studio/StudioPreview.tsx](hired.video/frontend/pages/studio/StudioPreview.tsx) | 0 | 13 | 🔴 0% |
| [pages/TakeHomeDeliveryPage.tsx](hired.video/frontend/pages/TakeHomeDeliveryPage.tsx) | 0 | 13 | 🔴 0% |
| [pages/studio/StudioLanding.tsx](hired.video/frontend/pages/studio/StudioLanding.tsx) | 80 | 13 | 🟡 86% |
| [pages/InterviewPractice.tsx](hired.video/frontend/pages/InterviewPractice.tsx) | 92 | 13 | 🟡 88% |
| [pages/JobCreatePage.tsx](hired.video/frontend/pages/JobCreatePage.tsx) | 136 | 13 | 🟡 91% |
| [pages/PhoneDashboard.tsx](hired.video/frontend/pages/PhoneDashboard.tsx) | 138 | 13 | 🟡 91% |
| [pages/CertificateVerify.tsx](hired.video/frontend/pages/CertificateVerify.tsx) | 0 | 12 | 🔴 0% |
| [pages/people/PeopleTco.tsx](hired.video/frontend/pages/people/PeopleTco.tsx) | 0 | 12 | 🔴 0% |
| [pages/Companies.tsx](hired.video/frontend/pages/Companies.tsx) | 66 | 12 | 🟡 85% |
| [pages/studio/StudioLayout.tsx](hired.video/frontend/pages/studio/StudioLayout.tsx) | 154 | 12 | 🟡 93% |
| [pages/Competitors.tsx](hired.video/frontend/pages/Competitors.tsx) | 0 | 11 | 🔴 0% |
| [pages/MarketplaceTemplatePreview.tsx](hired.video/frontend/pages/MarketplaceTemplatePreview.tsx) | 0 | 11 | 🔴 0% |
| [pages/seo/ResumeGuidePage.tsx](hired.video/frontend/pages/seo/ResumeGuidePage.tsx) | 0 | 11 | 🔴 0% |
| [pages/settings/Connections.tsx](hired.video/frontend/pages/settings/Connections.tsx) | 0 | 11 | 🔴 0% |
| [pages/studio/StudioSidebar.tsx](hired.video/frontend/pages/studio/StudioSidebar.tsx) | 75 | 11 | 🟡 87% |
| [pages/Resumes.tsx](hired.video/frontend/pages/Resumes.tsx) | 175 | 11 | 🟡 94% |
| [pages/CourseCheckout.tsx](hired.video/frontend/pages/CourseCheckout.tsx) | 0 | 10 | 🔴 0% |
| [pages/EventDetail.tsx](hired.video/frontend/pages/EventDetail.tsx) | 0 | 10 | 🔴 0% |
| [pages/blog/BlogIndex.tsx](hired.video/frontend/pages/blog/BlogIndex.tsx) | 0 | 9 | 🔴 0% |
| [pages/CheckoutSuccess.tsx](hired.video/frontend/pages/CheckoutSuccess.tsx) | 0 | 9 | 🔴 0% |
| [pages/EmbeddedResume.tsx](hired.video/frontend/pages/EmbeddedResume.tsx) | 0 | 9 | 🔴 0% |
| [pages/people/PeopleTeamHealth.tsx](hired.video/frontend/pages/people/PeopleTeamHealth.tsx) | 0 | 9 | 🔴 0% |
| [pages/seo/SalaryIndexPage.tsx](hired.video/frontend/pages/seo/SalaryIndexPage.tsx) | 0 | 9 | 🔴 0% |
| [pages/services/ScorecardsPage.tsx](hired.video/frontend/pages/services/ScorecardsPage.tsx) | 0 | 9 | 🔴 0% |
| [pages/TakeHomeAssignment.tsx](hired.video/frontend/pages/TakeHomeAssignment.tsx) | 0 | 9 | 🔴 0% |
| [pages/WarmIntros.tsx](hired.video/frontend/pages/WarmIntros.tsx) | 0 | 9 | 🔴 0% |
| [pages/tools/VendorSync.tsx](hired.video/frontend/pages/tools/VendorSync.tsx) | 21 | 9 | 🟡 70% |
| [pages/EventNew.tsx](hired.video/frontend/pages/EventNew.tsx) | 44 | 9 | 🟡 83% |
| [pages/paid-media/PaidMediaPage.tsx](hired.video/frontend/pages/paid-media/PaidMediaPage.tsx) | 70 | 9 | 🟡 89% |
| [pages/MyInterviewAssignments.tsx](hired.video/frontend/pages/MyInterviewAssignments.tsx) | 86 | 9 | 🟡 91% |
| [pages/ArticlesIndex.tsx](hired.video/frontend/pages/ArticlesIndex.tsx) | 0 | 8 | 🔴 0% |
| [pages/Contact.tsx](hired.video/frontend/pages/Contact.tsx) | 0 | 8 | 🔴 0% |
| [pages/CourseReviewQueue.tsx](hired.video/frontend/pages/CourseReviewQueue.tsx) | 0 | 8 | 🔴 0% |
| [pages/people/PeopleOpsHub.tsx](hired.video/frontend/pages/people/PeopleOpsHub.tsx) | 0 | 8 | 🔴 0% |
| [pages/PlayInvite.tsx](hired.video/frontend/pages/PlayInvite.tsx) | 0 | 8 | 🔴 0% |
| [pages/PublicVideoResume.tsx](hired.video/frontend/pages/PublicVideoResume.tsx) | 0 | 8 | 🔴 0% |
| [pages/Wishlist.tsx](hired.video/frontend/pages/Wishlist.tsx) | 0 | 8 | 🔴 0% |
| [pages/Dashboard.tsx](hired.video/frontend/pages/Dashboard.tsx) | 23 | 8 | 🟡 74% |
| [pages/tools/PredictiveAssessments.tsx](hired.video/frontend/pages/tools/PredictiveAssessments.tsx) | 31 | 8 | 🟡 79% |
| [pages/CourseLearner.tsx](hired.video/frontend/pages/CourseLearner.tsx) | 43 | 8 | 🟡 84% |
| [pages/people/PeopleRoster.tsx](hired.video/frontend/pages/people/PeopleRoster.tsx) | 53 | 8 | 🟡 87% |
| [pages/Tasks.tsx](hired.video/frontend/pages/Tasks.tsx) | 101 | 8 | 🟡 93% |
| [pages/HiringManagerPortal.tsx](hired.video/frontend/pages/HiringManagerPortal.tsx) | 0 | 7 | 🔴 0% |
| [pages/landing/AudienceLandingPage.tsx](hired.video/frontend/pages/landing/AudienceLandingPage.tsx) | 0 | 7 | 🔴 0% |
| [pages/landing/LocationLandingPage.tsx](hired.video/frontend/pages/landing/LocationLandingPage.tsx) | 0 | 7 | 🔴 0% |
| [pages/studio/ATSLandingPage.tsx](hired.video/frontend/pages/studio/ATSLandingPage.tsx) | 0 | 7 | 🔴 0% |
| [pages/VerifyEmail.tsx](hired.video/frontend/pages/VerifyEmail.tsx) | 15 | 7 | 🔴 68% |
| [pages/GigMarketplace.tsx](hired.video/frontend/pages/GigMarketplace.tsx) | 18 | 7 | 🟡 72% |
| [pages/services/HiringOnboarding.tsx](hired.video/frontend/pages/services/HiringOnboarding.tsx) | 78 | 7 | 🟡 92% |
| [pages/services/PitchDeckBuilder.tsx](hired.video/frontend/pages/services/PitchDeckBuilder.tsx) | 95 | 7 | 🟡 93% |
| [pages/blog/BlogPost.tsx](hired.video/frontend/pages/blog/BlogPost.tsx) | 0 | 6 | 🔴 0% |
| [pages/CompanyReviewsPage.tsx](hired.video/frontend/pages/CompanyReviewsPage.tsx) | 0 | 6 | 🔴 0% |
| [pages/guides/WorkforceGuide.tsx](hired.video/frontend/pages/guides/WorkforceGuide.tsx) | 0 | 6 | 🔴 0% |
| [pages/landing/TemplateLandingPage.tsx](hired.video/frontend/pages/landing/TemplateLandingPage.tsx) | 0 | 6 | 🔴 0% |
| [pages/ResumeTemplatesGallery.tsx](hired.video/frontend/pages/ResumeTemplatesGallery.tsx) | 0 | 6 | 🔴 0% |
| [pages/RetainedSearchDirectory.tsx](hired.video/frontend/pages/RetainedSearchDirectory.tsx) | 0 | 6 | 🔴 0% |
| [pages/studio/StudioEditor.tsx](hired.video/frontend/pages/studio/StudioEditor.tsx) | 0 | 6 | 🔴 0% |
| [pages/ForIndex.tsx](hired.video/frontend/pages/ForIndex.tsx) | 1 | 6 | 🔴 14% |
| [pages/AffiliateDashboard.tsx](hired.video/frontend/pages/AffiliateDashboard.tsx) | 40 | 6 | 🟡 87% |
| [pages/tools/ProfileAudit.tsx](hired.video/frontend/pages/tools/ProfileAudit.tsx) | 49 | 6 | 🟡 89% |
| [pages/services/ScreeningTemplates.tsx](hired.video/frontend/pages/services/ScreeningTemplates.tsx) | 55 | 6 | 🟡 90% |
| [pages/tools/ResumeTailor.tsx](hired.video/frontend/pages/tools/ResumeTailor.tsx) | 52 | 6 | 🟡 90% |
| [pages/ResumeDetail.tsx](hired.video/frontend/pages/ResumeDetail.tsx) | 75 | 6 | 🟡 93% |
| [pages/tools/InterviewQuestions.tsx](hired.video/frontend/pages/tools/InterviewQuestions.tsx) | 86 | 6 | 🟡 93% |
| [pages/guides/JobSearchStrategies.tsx](hired.video/frontend/pages/guides/JobSearchStrategies.tsx) | 0 | 5 | 🔴 0% |
| [pages/PersonaSelection.tsx](hired.video/frontend/pages/PersonaSelection.tsx) | 0 | 5 | 🔴 0% |
| [pages/PostDetail.tsx](hired.video/frontend/pages/PostDetail.tsx) | 0 | 5 | 🔴 0% |
| [pages/ReferencesShared.tsx](hired.video/frontend/pages/ReferencesShared.tsx) | 0 | 5 | 🔴 0% |
| [pages/studio/StudioSettings.tsx](hired.video/frontend/pages/studio/StudioSettings.tsx) | 0 | 5 | 🔴 0% |
| [pages/tools/ValueProposition.tsx](hired.video/frontend/pages/tools/ValueProposition.tsx) | 12 | 5 | 🟡 71% |
| [pages/Tools.tsx](hired.video/frontend/pages/Tools.tsx) | 41 | 5 | 🟡 89% |
| [pages/tools/VideoPitchLab.tsx](hired.video/frontend/pages/tools/VideoPitchLab.tsx) | 46 | 5 | 🟡 90% |
| [pages/Settings.tsx](hired.video/frontend/pages/Settings.tsx) | 237 | 5 | 🟡 98% |
| [pages/EmailPreferences.tsx](hired.video/frontend/pages/EmailPreferences.tsx) | 0 | 4 | 🔴 0% |
| [pages/guides/NetworkingTips.tsx](hired.video/frontend/pages/guides/NetworkingTips.tsx) | 0 | 4 | 🔴 0% |
| [pages/JobEmbed.tsx](hired.video/frontend/pages/JobEmbed.tsx) | 0 | 4 | 🔴 0% |
| [pages/PlaceholderPage.tsx](hired.video/frontend/pages/PlaceholderPage.tsx) | 0 | 4 | 🔴 0% |
| [pages/SectorsIndex.tsx](hired.video/frontend/pages/SectorsIndex.tsx) | 0 | 4 | 🔴 0% |
| [pages/ToolDetail.tsx](hired.video/frontend/pages/ToolDetail.tsx) | 1 | 4 | 🔴 20% |
| [pages/ArticleView.tsx](hired.video/frontend/pages/ArticleView.tsx) | 5 | 4 | 🔴 56% |
| [pages/tools/JobResumeMatch.tsx](hired.video/frontend/pages/tools/JobResumeMatch.tsx) | 15 | 4 | 🟡 79% |
| [pages/GigDetail.tsx](hired.video/frontend/pages/GigDetail.tsx) | 24 | 4 | 🟡 86% |
| [pages/recruit/LiveScreens.tsx](hired.video/frontend/pages/recruit/LiveScreens.tsx) | 43 | 4 | 🟡 91% |
| [pages/CompanyDetail.tsx](hired.video/frontend/pages/CompanyDetail.tsx) | 64 | 4 | 🟡 94% |
| [pages/tools/InterviewTemplates.tsx](hired.video/frontend/pages/tools/InterviewTemplates.tsx) | 61 | 4 | 🟡 94% |
| [pages/ServicesManagement.tsx](hired.video/frontend/pages/ServicesManagement.tsx) | 79 | 4 | 🟡 95% |
| [pages/People.tsx](hired.video/frontend/pages/People.tsx) | 138 | 4 | 🟡 97% |
| [pages/FeaturedCreators.tsx](hired.video/frontend/pages/FeaturedCreators.tsx) | 0 | 3 | 🔴 0% |
| [pages/guides/GettingStarted.tsx](hired.video/frontend/pages/guides/GettingStarted.tsx) | 0 | 3 | 🔴 0% |
| [pages/guides/Tutorials.tsx](hired.video/frontend/pages/guides/Tutorials.tsx) | 0 | 3 | 🔴 0% |
| [pages/JobScreeningPage.tsx](hired.video/frontend/pages/JobScreeningPage.tsx) | 0 | 3 | 🔴 0% |
| [pages/ServiceInquiries.tsx](hired.video/frontend/pages/ServiceInquiries.tsx) | 23 | 3 | 🟡 88% |
| [pages/SourcingBrowse.tsx](hired.video/frontend/pages/SourcingBrowse.tsx) | 27 | 3 | 🟡 90% |
| [pages/GigCreatePage.tsx](hired.video/frontend/pages/GigCreatePage.tsx) | 33 | 3 | 🟡 92% |
| [pages/JobApplicationPage.tsx](hired.video/frontend/pages/JobApplicationPage.tsx) | 39 | 3 | 🟡 93% |
| [pages/Careers.tsx](hired.video/frontend/pages/Careers.tsx) | 59 | 3 | 🟡 95% |
| [pages/Security.tsx](hired.video/frontend/pages/Security.tsx) | 105 | 3 | 🟡 97% |
| [pages/tools/SentimentAnalysis.tsx](hired.video/frontend/pages/tools/SentimentAnalysis.tsx) | 92 | 3 | 🟡 97% |
| [pages/CompanyEditPage.tsx](hired.video/frontend/pages/CompanyEditPage.tsx) | 0 | 2 | 🔴 0% |
| [pages/NotFound.tsx](hired.video/frontend/pages/NotFound.tsx) | 0 | 2 | 🔴 0% |
| [pages/paid-media/SuperAdminPaidMediaPage.tsx](hired.video/frontend/pages/paid-media/SuperAdminPaidMediaPage.tsx) | 0 | 2 | 🔴 0% |
| [pages/PublicProfile.tsx](hired.video/frontend/pages/PublicProfile.tsx) | 0 | 2 | 🔴 0% |
| [pages/SecuritySessions.tsx](hired.video/frontend/pages/SecuritySessions.tsx) | 0 | 2 | 🔴 0% |
| [pages/SitemapLocations.tsx](hired.video/frontend/pages/SitemapLocations.tsx) | 0 | 2 | 🔴 0% |
| [pages/studio/Studio.tsx](hired.video/frontend/pages/studio/Studio.tsx) | 0 | 2 | 🔴 0% |
| [pages/TranscriptSearch.tsx](hired.video/frontend/pages/TranscriptSearch.tsx) | 18 | 2 | 🟡 90% |
| [pages/tools/Career360.tsx](hired.video/frontend/pages/tools/Career360.tsx) | 22 | 2 | 🟡 92% |
| [pages/tools/CompAnalyzer.tsx](hired.video/frontend/pages/tools/CompAnalyzer.tsx) | 22 | 2 | 🟡 92% |
| [pages/AcceptInvitation.tsx](hired.video/frontend/pages/AcceptInvitation.tsx) | 25 | 2 | 🟡 93% |
| [pages/tools/EmployerResearch.tsx](hired.video/frontend/pages/tools/EmployerResearch.tsx) | 31 | 2 | 🟡 94% |
| [pages/PeopleDetail.tsx](hired.video/frontend/pages/PeopleDetail.tsx) | 41 | 2 | 🟡 95% |
| [pages/tools/PdfToJson.tsx](hired.video/frontend/pages/tools/PdfToJson.tsx) | 36 | 2 | 🟡 95% |
| [pages/tools/SummarizeResume.tsx](hired.video/frontend/pages/tools/SummarizeResume.tsx) | 37 | 2 | 🟡 95% |
| [pages/Checkout.tsx](hired.video/frontend/pages/Checkout.tsx) | 52 | 2 | 🟡 96% |
| [pages/CookiePolicy.tsx](hired.video/frontend/pages/CookiePolicy.tsx) | 71 | 2 | 🟡 97% |
| [pages/Home.tsx](hired.video/frontend/pages/Home.tsx) | 102 | 2 | 🟡 98% |
| [pages/CompanyCreatePage.tsx](hired.video/frontend/pages/CompanyCreatePage.tsx) | 0 | 1 | 🔴 0% |
| [pages/EmbeddedStudioProject.tsx](hired.video/frontend/pages/EmbeddedStudioProject.tsx) | 0 | 1 | 🔴 0% |
| [pages/people/PeopleSurface.tsx](hired.video/frontend/pages/people/PeopleSurface.tsx) | 0 | 1 | 🔴 0% |
| [pages/Points.tsx](hired.video/frontend/pages/Points.tsx) | 0 | 1 | 🔴 0% |
| [pages/SharedCandidateResume.tsx](hired.video/frontend/pages/SharedCandidateResume.tsx) | 10 | 1 | 🟡 91% |
| [pages/SharedPitchDeck.tsx](hired.video/frontend/pages/SharedPitchDeck.tsx) | 16 | 1 | 🟡 94% |
| [pages/SignupSuccess.tsx](hired.video/frontend/pages/SignupSuccess.tsx) | 21 | 1 | 🟡 95% |
| [pages/Contributors.tsx](hired.video/frontend/pages/Contributors.tsx) | 23 | 1 | 🟡 96% |
| [pages/Help.tsx](hired.video/frontend/pages/Help.tsx) | 35 | 1 | 🟡 97% |
| [pages/Signup.tsx](hired.video/frontend/pages/Signup.tsx) | 38 | 1 | 🟡 97% |
| [pages/About.tsx](hired.video/frontend/pages/About.tsx) | 56 | 1 | 🟡 98% |
| [pages/tools/SalaryCalculator.tsx](hired.video/frontend/pages/tools/SalaryCalculator.tsx) | 56 | 1 | 🟡 98% |
| [pages/Pricing.tsx](hired.video/frontend/pages/Pricing.tsx) | 299 | 1 | ✅ 100% |
| [pages/AffiliateProgram.tsx](hired.video/frontend/pages/AffiliateProgram.tsx) | 69 | 0 | ✅ 100% |
| [pages/ChromeExtension.tsx](hired.video/frontend/pages/ChromeExtension.tsx) | 90 | 0 | ✅ 100% |
| [pages/ConfirmEmail.tsx](hired.video/frontend/pages/ConfirmEmail.tsx) | 6 | 0 | ✅ 100% |
| [pages/Features.tsx](hired.video/frontend/pages/Features.tsx) | 23 | 0 | ✅ 100% |
| [pages/ForAgencies.tsx](hired.video/frontend/pages/ForAgencies.tsx) | 74 | 0 | ✅ 100% |
| [pages/ForgotPassword.tsx](hired.video/frontend/pages/ForgotPassword.tsx) | 20 | 0 | ✅ 100% |
| [pages/ForRecruiters.tsx](hired.video/frontend/pages/ForRecruiters.tsx) | 92 | 0 | ✅ 100% |
| [pages/HelpArticle.tsx](hired.video/frontend/pages/HelpArticle.tsx) | 6 | 0 | ✅ 100% |
| [pages/Index.tsx](hired.video/frontend/pages/Index.tsx) | 14 | 0 | ✅ 100% |
| [pages/landing/LifeStageLandingPage.tsx](hired.video/frontend/pages/landing/LifeStageLandingPage.tsx) | 11 | 0 | ✅ 100% |
| [pages/Login.tsx](hired.video/frontend/pages/Login.tsx) | 20 | 0 | ✅ 100% |
| [pages/MagicLinkVerify.tsx](hired.video/frontend/pages/MagicLinkVerify.tsx) | 7 | 0 | ✅ 100% |
| [pages/OAuthCallback.tsx](hired.video/frontend/pages/OAuthCallback.tsx) | 11 | 0 | ✅ 100% |
| [pages/Onboarding.tsx](hired.video/frontend/pages/Onboarding.tsx) | 67 | 0 | ✅ 100% |
| [pages/PostAJob.tsx](hired.video/frontend/pages/PostAJob.tsx) | 27 | 0 | ✅ 100% |
| [pages/ResetPassword.tsx](hired.video/frontend/pages/ResetPassword.tsx) | 29 | 0 | ✅ 100% |
| [pages/Rewards.tsx](hired.video/frontend/pages/Rewards.tsx) | 40 | 0 | ✅ 100% |
| [pages/Search.tsx](hired.video/frontend/pages/Search.tsx) | 1 | 0 | ✅ 100% |
| [pages/tools/AIResumeScorer.tsx](hired.video/frontend/pages/tools/AIResumeScorer.tsx) | 16 | 0 | ✅ 100% |
| [pages/tools/ResumeOptimizer.tsx](hired.video/frontend/pages/tools/ResumeOptimizer.tsx) | 12 | 0 | ✅ 100% |
