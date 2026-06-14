# PRD — EnergizeLMS Feature Parity & Gap Analysis (AI-powered, gamified learning)

**Owner:** hired.video Platform / Learning.
**Status:** Spec + gap analysis. Source product (`energizelms/`) is a React+Vite **prototype** (localStorage Zustand stores, simulated AI, many stub pages) that crystallizes a target feature set for an *AI-powered, gamified, marketplace-style LMS*. This PRD inventories that feature set, maps each capability to what hired.video already ships, and isolates the **net-new gaps**.
**Opened:** 2026-06-14.
**Headline finding:** hired.video already **meets or exceeds** EnergizeLMS on the overwhelming majority of its feature surface — courses, modules/lessons, learning paths (DAG), SCORM 1.2/2004 + xAPI LRS, cohorts/assignments, verifiable certificates, gamification (points/streaks/badges + fraud + cashout), subscriptions/billing, cart/checkout/wishlist, multi-faceted marketplace + revenue split/payouts, creator/manager/admin tooling, and a real LLM gateway. EnergizeLMS surfaces a **small, high-leverage set of genuine gaps** (§4) plus a UI-completion backlog where hired.video has the data layer but not the learner/educator-facing screens.

**Surfaces touched by the gaps (§4):**
- Learner learning experience: course/lesson player ([CourseLearner.tsx](../../frontend/pages/CourseLearner.tsx)), a context-aware **AI Learning Coach** drawer, a learner **learning dashboard / progress analytics** screen.
- Course authoring: structured **learning outcomes / requirements** fields; optional standalone **quiz authoring**.
- Educator: cohort **gradebook** roll-up UI.
- Engagement: **leaderboard** (global + cohort); learning-event → typed-notification wiring.
- AI: **goal → generated learning plan/path** (LLM), LLM-ranked recommendations.

---

## 0. Strategic framing

EnergizeLMS is a self-contained prototype of a consumer LMS with four roles — **learner, creator, manager, admin** — and a Duolingo-style, AI-forward pitch ("tell our AI what you want to learn → personalized path", streaks/XP/badges, an always-available AI coach, a course marketplace with cart/wishlist/subscriptions). It is *not* a production system: state lives in `localStorage`, "AI" responses are hardcoded canned strings, and roughly a third of the role pages (Course Builder, Creator/Manager/Admin dashboards, Learning Journeys, Team Management) are `coming soon` stubs.

Its value here is as a **requirements mirror**. Read as a spec, it asserts that a complete AI-LMS needs: (a) a course catalog + detail + enrollment + progress; (b) learning paths; (c) SCORM playback; (d) gamification; (e) an AI coach + AI recommendations + AI learning-plan generation from a free-text goal; (f) subscriptions + cart + wishlist + checkout; (g) a creator economy (build/sell courses, earnings); (h) manager/team learning (assign content, track team progress); (i) admin (users/content/analytics); (j) certificates; (k) notifications.

hired.video already operates a **production-grade** version of almost all of this — its LMS foundation ([[project_learning_pathways]], [[project_learning_cohorts]]), gamification ([[project_gamification]]), marketplace + payouts ([[project_gig_marketplace]], [[project_voice_marketplace]], [[project_template_marketplace]]), billing/token pricing ([[project_token_pricing]]), role/feature access ([[project_role_feature_access_manager]]), and LLM gateway ([[project_llm_gateway_models]]) collectively cover it. So this document is deliberately **not** a build-from-scratch plan. It is a parity confirmation plus a tight gap list, so we spend effort only where EnergizeLMS reveals something hired.video genuinely lacks.

**Role mapping (EnergizeLMS → hired.video [[feedback_role_means_user_role]]):**

| EnergizeLMS role | hired.video role(s) | Notes |
|---|---|---|
| `learner` | `job_seeker` (in learning mode) / cohort **student** | Student is a learning-mode of job_seeker, not a new role ([[project_learning_cohorts]]). |
| `creator` | `creator` | Course authoring is a creator program ([[project_creator_persona_model]]). |
| `manager` | `employer` (+ cohort **educator**) | Team-learning manager = employer running People Ops + cohort owner. |
| `admin` | `admin` / `super_admin` | Platform admin + SuperAdmin RBAC. |

No new roles are required. EnergizeLMS's flat four-role model is **subsumed** by hired.video's eight-role taxonomy + cohort sub-roles.

---

## 1. EnergizeLMS feature inventory (what the prototype asserts)

Derived from `energizelms/src` — routing ([App.jsx](../../../energizelms/src/App.jsx)), the Zustand stores, the sidebar nav, and the implemented pages. "Real" = has working logic; "Stub" = `coming soon` placeholder.

| Area | Capability | Prototype depth |
|---|---|---|
| **Catalog** | Course entity (title, description, instructor + bio, price/originalPrice, rating, reviewCount, students, duration, level, category, language, lastUpdated, features, requirements, learningOutcomes, curriculum[sections→topics], reviews[]) | Real (sample data) |
| | Catalog with filter/search (category, level, price free/paid, rating, text) + sort | Real (`coursesStore.getFilteredCourses`) |
| | Wishlist (add/remove, by-category, count, total value) | Real (`wishlistStore`) |
| | Shopping cart (add/remove, subtotal, 8% tax, savings, total, item count) | Real (`cartStore`) |
| | Checkout + purchased courses + payment history + billing info | Real (`subscriptionStore`, Checkout page) |
| **Subscriptions** | Plans Free / Pro $29/mo / Enterprise $99/mo; trial; cancel/reactivate; usage stats; total spent | Real (store) + marketing Pricing page |
| **Learning** | Enroll, per-course progress %, completed lessons, quiz scores, time-spent, last lesson | Real (`coursesStore`) |
| | Course view / Lesson view / Quiz view | Lesson/Quiz = **stub**; CourseView real |
| | SCORM player (lesson nav, simulated progress tick, mark-complete, completion, sidebar curriculum) | Real but **simulated** (no real SCORM runtime) |
| | Learning analytics (enrolled/completed/in-progress/not-started, completion rate, avg progress, total time) | Real (`coursesStore.getAnalytics`) |
| **Gamification** | XP + levels (1000 XP/level), streaks (daily), badges, achievements (level/streak/course milestones), activity-point table, leaderboard[] | Real except **leaderboard** (array declared, unused) |
| **AI** | AI Coach button + drawer + page; context-aware; role-aware canned responses; conversation history | Real UI, **simulated** responses (`aiConversationStore`) |
| | AI Recommendations page (wishlist tab + "recommended" tab) | Real UI, trivial algo (first-N) |
| | Learning-goal capture on homepage → "personalized plan" | Real capture; `generateAILearningPlan` returns **canned** 3-step plan |
| **Notifications** | In-app center; types achievement/course/streak; read/unread; unread count; action URLs; typed creators (achievement/recommendation/streak) | Real (`notificationsStore`) |
| **Creator** | Creator Dashboard, Course Builder, Creator Analytics, Earnings | **All stubs** |
| **Manager** | Manager Dashboard, Team Management, Learning Journeys (assign content, team progress, feedback, recommend) | **All stubs** |
| **Admin** | Admin Dashboard, User Management, Content Management, Analytics | **All stubs** |
| **Certificates** | `certificateEarned` flag on purchase; "Certificate of completion" feature copy | Flag only; no issuance/verify |
| **Misc** | Markdown rendering (`markdownConverter`); RBAC by role (route guards + permission map); multi-language (marketing claim) | Real RBAC; markdown real; i18n claim only |

---

## 2. Capability mapping — EnergizeLMS vs hired.video (grounded in code)

Legend: ✅ hired.video meets/exceeds · ⚠️ partial (data layer present, surface/wiring incomplete) · ❌ genuine gap.

| EnergizeLMS capability | hired.video status | Evidence (hired.video) |
|---|---|---|
| Course entity (modules → lessons) | ✅ | `courses`, `course_modules`, `course_lessons` ([schema/courses.ts](../../api/src/db/schema/courses.ts)), mig `0041_courses_foundation.sql` |
| Course catalog / marketplace + search/filter | ✅ | `GET /api/courses/public`, [CoursePublicDetail.tsx](../../frontend/pages/marketplace/CoursePublicDetail.tsx), UnifiedSearch category/difficulty/price/rating filters |
| Course detail: instructor bio, reviews/ratings, curriculum | ✅ | author profile join + denormalized `ratingAvg`/`ratingCount`; polymorphic `reviews` (mig 0032) |
| Course **learning outcomes** + **requirements** as structured fields | ❌ | Only free-text `description`; no structured arrays → **GAP-1** |
| Learning paths (sequential / DAG) | ✅ (exceeds) | `learning_paths`, `learning_path_courses`, `course_prerequisites` (DAG + cycle check), `learning_path_enrollments` ([learning.ts](../../api/src/db/schema/learning.ts), mig 0126). EnergizeLMS "Learning Journeys" is a stub. |
| SCORM playback | ✅ (exceeds) | SCORM 1.2/2004 CMI runtime `scorm_cmi_states`, [ScormPlayer.tsx](../../frontend/components/courses/ScormPlayer.tsx); EnergizeLMS player is simulated |
| xAPI LRS + external forwarding | ✅ (net-new vs Energize) | `xapi_statements`, `external_lrs_targets`, [lrs-forwarder.ts](../../api/src/services/learning/lrs-forwarder.ts), mig 0183 |
| Enrollment + progress + scores + time-spent | ✅ | `course_enrollments` (progress JSONB per-lesson, `final_score_pct`, `passed`), routes `/enroll`, `/enrollments/:id/progress` |
| Cohorts / classrooms + assignments | ✅ (exceeds) | `learning_cohorts`, `cohort_members`, `learning_assignments` (mig 0194), [cohorts.ts](../../api/src/routes/cohorts.ts), AssignmentService fan-out → enrollments |
| Certificates + verification | ✅ (exceeds) | `course_certificates` (signed payload, snapshot, expiry, revoke), public `GET /api/verify/:certNumber`; EnergizeLMS has only a boolean flag |
| Gamification: XP, levels, streaks, badges, achievements | ✅ (exceeds) | `points-engine.ts`, `streak-engine.ts`, `badge-engine.ts`, `fraud-engine.ts`, `redemption-engine.ts`; `points_ledger`, `points_streaks`, `badges`, `user_badges`, `point_redemptions` ([[project_gamification]]) |
| **Learner / XP leaderboard** (global / cohort points ranking) | ❌ | Leaderboards exist for *other* domains — creator discovery (`/api/discovery/creators/leaderboard`) and recruiter pipeline activity ([TeamLeaderboardPanel.tsx](../../frontend/components/companies/TeamLeaderboardPanel.tsx)) — but none ranks learners by points/XP. EnergizeLMS declares (unused) `leaderboard[]` → **GAP-4** |
| AI Coach (context-aware, role-aware, conversation) | ⚠️ | `career-coach.ts` CHRO prompt + chat infra ([chat-socket.ts](../../api/src/routes/chat-socket.ts), ChatRoom DO) + [HelpDrawer.tsx](../../frontend/components/help/HelpDrawer.tsx) exist, but **no learning-scoped coach drawer** that knows the current course/lesson/path → **GAP-2** |
| AI recommendations | ⚠️ | Deterministic keyword match over courses for a goal; LLM-ranked variant already tracked as a gap → **GAP-9** |
| Learning-goal capture | ✅ | `learning_goals` (mig 0199), [learning-goals.ts](../../api/src/routes/learning-goals.ts) |
| **Goal → generated learning plan/path** (LLM) | ❌ | Goal capture + keyword course recs only; no LLM that synthesizes a multi-step plan or materializes a `learning_path` → **GAP-3** |
| Subscriptions / plans / billing / invoices | ✅ | `subscriptionPlans`, `invoices`, `paymentMethods`, `companySubscriptions` ([schema/billing.ts](../../api/src/db/schema/billing.ts)). Pricing is hired.video's ($9.95 Pro + token packs [[project_token_pricing]], [[project_pricing_seats]]) — EnergizeLMS's $29/$99 tiers do **not** apply. |
| Cart + checkout (tax/totals) | ✅ | [cart-context.tsx](../../frontend/lib/cart-context.tsx), `course-checkout.ts`, `boost-checkout.ts` |
| Wishlist | ✅ | polymorphic `lists` (`kind='wishlist'`) incl. `course` item kind, [Wishlist.tsx](../../frontend/pages/Wishlist.tsx) |
| One-time purchase vs subscription / lifetime access | ✅ | `course_enrollments` paid snapshot + entitlement checks; licenses for voice/templates |
| Marketplace + revenue split + earnings + payouts | ✅ (exceeds) | voice/template/course/gig marketplaces; `platformFeeBps` snapshot; PayoutLedgerService; Helcim/Tremendous payouts |
| Creator course builder / dashboard / analytics / earnings | ✅ | Studio authoring + `/api/creators` opt-in (`courses` program), creator analytics, payout profile; EnergizeLMS pages are stubs |
| Manager team mgmt / assign content / team progress | ✅ | Cohorts (assign course/path, due dates, required) + People Ops roster/1:1s/goals ([[project_chro_people_ops]]); EnergizeLMS pages are stubs |
| Admin users / content / analytics / role-feature access | ✅ (exceeds) | admin dashboard, UserManagement, role-feature access manager ([[project_role_feature_access_manager]]); EnergizeLMS pages are stubs |
| Notifications center (read/unread, types, action URLs) | ✅ infra; ⚠️ wiring | `notifications` table + routes + ETag caching exist; typed **learning-event** notifications (achievement/streak/course-rec) not wired from the learning/gamification engines → **GAP-8** |
| Learner **learning dashboard / progress analytics UI** | ⚠️ | Progress data fully captured; a learner-facing dashboard (enrolled/in-progress/completed, completion rate, time-spent, streak) is not consolidated → **GAP-5** |
| Educator **gradebook** roll-up UI | ❌ | Cohort + enrollment + score data exist; no gradebook view → **GAP-6** |
| Standalone **quiz/assessment authoring** (question bank) | ⚠️ | Knowledge checks reuse `studio_video_forms`; predictive assessments separate; no general quiz builder → **GAP-7** |
| Markdown content | ✅ | text_md lessons; studio document model |
| Multi-language | ✅ | en/es/fr-CA tools localization ([[project_tools_localization]]) |

---

## 3. Conclusion of the analysis

EnergizeLMS describes a product hired.video has **already built and surpassed** at the platform layer. Of ~30 capability lines, **~21 are ✅ at parity-or-better**, **5 are ⚠️ partial** (data present, learner/educator surface or wiring incomplete), and **3 are ❌ genuine gaps** (structured outcomes/requirements, goal→generated-plan, leaderboard). Two additional items (LLM-ranked recs, learning-scoped AI coach) refine things hired.video already partially does.

The realistic work is therefore **completion + a few net-new capabilities**, not a rebuild. EnergizeLMS's main contribution is its **learner-facing AI + engagement framing** (goal→plan, an always-on learning coach, leaderboards, a consolidated progress dashboard) — the places hired.video's strong backend isn't yet matched by a learner-facing experience.

---

## 4. Prioritized gaps (net-new + completion)

Each maps to a Consolidated Gap Register entry (see §6). Effort is relative; all reuse existing seams per the DRY rule.

### GAP-1 — Structured course learning outcomes & requirements *(P3, Small)*
Add `learningOutcomes: string[]` and `requirements: string[]` to the `courses` schema (or a `course_meta` JSONB) and surface them on [CoursePublicDetail.tsx](../../frontend/pages/marketplace/CoursePublicDetail.tsx) + the course authoring form. EnergizeLMS treats these as first-class detail-page sections; hired.video buries them in free-text description. **Reuse:** course author form + public detail renderer already exist; this is additive fields, not new infra.

### GAP-2 — Context-aware AI Learning Coach drawer *(P2, Medium)*
A learner-facing coach drawer (mirrors EnergizeLMS `AICoachButton`/`AICoachdrawer`) that is **scoped to the current learning context** — course, lesson, path, progress — and answers "explain this", "quiz me", "what's next", "I'm stuck". **Reuse, don't rebuild:** ride the existing LLM gateway ([providers.ts](../../api/src/services/adapters/providers.ts) — add a `learning_coach` use-case profile), the `career-coach.ts` prompt pattern, the chat Durable Object for history, and the `AIContextType` seam already used by [HelpDrawer.tsx](../../frontend/components/help/HelpDrawer.tsx) ([[project_context_aware_help]]). The gap is a **learning-scoped context payload + a single shared coach drawer**, not net-new chat infra. Self-gating shared component (renders only inside learning surfaces) per [[feedback_extract_on_duplication]].

### GAP-3 — Goal → AI-generated learning plan / path *(P2, Medium)*
Today a `learning_goal` yields keyword-matched course suggestions. EnergizeLMS's pitch ("our AI creates a personalized learning path") implies generating an **ordered, multi-step plan** that can materialize a real `learning_path` (sequenced existing courses + milestones). **Reuse:** `learning_goals` + `learning_paths`/`learning_path_courses` + LLM gateway (new `learning_plan` use-case profile, JSON-schema-conformed output → validated → persisted as a draft path the learner can enroll in). Cache the generated plan per goal version (read-through `getOrSetCached`) — generation is expensive and the goal is stable. This is the single highest-leverage AI gap (the prototype's headline feature).

### GAP-4 — Learner / XP leaderboard (global + cohort) *(P3, Small–Medium)*
A ranked board over the existing `points_ledger` / `user_points_balance`, filterable by scope (global, cohort, time-window). hired.video already ships leaderboards for *other* domains — creator discovery and recruiter pipeline activity — so the **ranking-panel pattern is reusable**; what's missing is a learner/XP board. EnergizeLMS declares a `leaderboard` but never implements it. **Reuse:** points repository + a cached, windowed ranking query (version-token key on the points keyspace per the perf rule — never recompute per request); cohort scope joins `cohort_members`. Honor fraud suspension state (exclude suspended users).

### GAP-5 — Learner learning dashboard / progress analytics *(P2, Medium)*
Consolidate the data hired.video already stores into a learner-facing screen mirroring EnergizeLMS `Dashboard`/`Progress`/`coursesStore.getAnalytics`: enrolled / in-progress / completed counts, completion rate, total time-spent, current streak + XP/level, continue-learning resume card, recent certificates. **Reuse:** enrollment + gamification + certificate read models; serve through the read-through cache, invalidate on progress write.

### GAP-6 — Educator cohort gradebook UI *(P3, Medium)*
A roll-up grid for cohort owners (`/cohorts/:id/gradebook`): members × assignments matrix with status / score / due-date / overdue flags, drawing on `learning_assignments` + `course_enrollments`. Data exists; no view. **Reuse:** CohortService + AssignmentService read paths; cached per-cohort with invalidation on enrollment progress.

### GAP-7 — Standalone quiz / assessment authoring *(P3, Medium–Large; validate demand first)*
EnergizeLMS has a `QuizView` (stub) and per-lesson `quizScores`. hired.video does in-video knowledge checks via `studio_video_forms` and separate predictive assessments, but no general **question-bank quiz builder** (MCQ/true-false/short-answer, pass threshold, attempts, per-question feedback) attachable to a lesson. **Decision needed:** extend `studio_video_forms` vs a dedicated `quizzes`/`quiz_questions` schema. Lower priority — knowledge checks already cover the common case; only build if course authors ask for graded quizzes.

### GAP-8 — Learning-event → typed notification wiring *(P3, Small)*
EnergizeLMS fires typed notifications (achievement unlocked, course recommendation, streak reminder) with action URLs. hired.video has the notification center + the gamification/learning engines, but the **engine → notification** emit for learning milestones (badge earned, streak-at-risk, new recommendation, assignment due/overdue, certificate issued) is not consistently wired. **Reuse:** notifications aggregate + existing engines; add emit points. Pairs with #1949 (resume-feedback notifications) — same notifications seam.

### GAP-9 — LLM-ranked recommendations *(P3, Small; already tracked)*
Already a known gap in hired.video (keyword match shipped; LLM-ranked variant tracked). Note here for completeness; fold into GAP-3's plan generator where possible (same gateway profile family).

**Explicitly NOT gaps (do not rebuild):** SCORM/xAPI runtime, learning paths/DAG, cohorts/assignments, certificates + verification, gamification engine, subscriptions/billing/cart/wishlist/checkout, marketplace/payouts/earnings, creator/manager/admin tooling, role-feature access, LLM gateway, notification center infra, multi-language. EnergizeLMS's pricing tiers ($29/$99) and its localStorage/simulated-AI architecture are prototype artifacts and must **not** be ported.

---

## 5. Sequencing

1. **GAP-3 (goal→plan)** + **GAP-2 (learning coach)** — the AI differentiators; share the LLM-gateway profile work.
2. **GAP-5 (learner dashboard)** + **GAP-4 (leaderboard)** + **GAP-8 (notifications)** — engagement loop; all read off existing data.
3. **GAP-1 (outcomes/requirements)** — quick additive polish on course detail.
4. **GAP-6 (gradebook)** — educator completion.
5. **GAP-7 (quiz builder)** — only after validating author demand.

---

## 6. Gap Register linkage

Tracked as a single parent entry plus children in the [Consolidated Gap Register](../../README.md#consolidated-gap-register): parent **#2068** (this analysis), children **GAP-1…GAP-8** as enumerated. GAP-9 already exists in the register (LLM-ranked recommendations). See README for canonical status.

## 7. References
- Source prototype: `energizelms/` (React+Vite, Zustand, `src/store/*`, `src/pages/*`).
- hired.video learning: [[project_learning_pathways]], [[project_learning_cohorts]], [schema/courses.ts](../../api/src/db/schema/courses.ts), [schema/learning.ts](../../api/src/db/schema/learning.ts).
- Engagement: [[project_gamification]]. AI: [[project_llm_gateway_models]], [[project_context_aware_help]], [[project_resume_feedback_coaching]]. Commerce: [[project_token_pricing]], [[project_pricing_seats]]. Roles: [[feedback_role_means_user_role]], [[project_creator_persona_model]].
