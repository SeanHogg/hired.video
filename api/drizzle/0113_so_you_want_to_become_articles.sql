-- Migration 0113 — "So You Want to Become a..." editorial article series.
--
-- Seeds 14 long-form articles aimed at recent high-school graduates,
-- highlighting AI-resilient careers (skilled trades, allied healthcare,
-- beauty + personal care, public service) with the specific schools,
-- certifications, apprenticeships, and licensure paths required to enter
-- each one. Every article links back to the hired.video Studio so
-- readers can immediately spin up a 60-second video resume that pairs
-- with their fresh cert / apprenticeship application.
--
-- Why these live in the DB rather than `frontend/data/blog-posts.ts`:
--   - They need to surface in UnifiedSearch + /jobs?sector= filters
--     keyed off `articles.sector` (skilled_trades / healthcare /
--     beauty_personal_care / law_enforcement / government).
--   - The articles table is the SSoT for the SuperAdmin review queue --
--     editorial content lives in the same moderation pipeline as
--     creator-authored content.
--
-- The articles route in `api/src/routes/articles.ts` gates public
-- visibility on (a) `articles.status = 'published'`, (b)
-- `users.email_verified = true`, and (c) `isCreatorVisible(userId)` --
-- which previously required an active Pro subscription. We add
-- `users.is_system` here so editorial accounts bypass the paywall
-- without faking subscription rows. The predicate change lives in
-- `api/src/services/creators/visibility.ts`.
--
-- The editorial author user is owned by the platform; only migrations
-- and SuperAdmin tooling may set `is_system = true`.

-- --- Editorial / house author flag -------------------------------------
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_system" BOOLEAN NOT NULL DEFAULT false;

-- --- Seed the editorial author user ------------------------------------
-- Deterministic UUID derived from email so re-runs are stable and the
-- INSERTs below can reference it without a SELECT round-trip.
INSERT INTO "users" (
  "id",
  "email",
  "name",
  "email_verified",
  "is_active",
  "is_system",
  "role",
  "created_at",
  "updated_at"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'editorial@hired.video',
  'hired.video Editorial',
  true,
  true,
  true,
  'job_seeker',
  NOW(),
  NOW()
)
ON CONFLICT ("email") DO UPDATE
  SET "is_system" = true,
      "email_verified" = true,
      "name" = EXCLUDED."name",
      "updated_at" = NOW();

-- --- Article body inserts ----------------------------------------------
-- Idempotent on (user_id, slug) via uq_articles_user_slug. Re-running
-- the migration is a no-op for already-seeded rows. To replace a body,
-- delete the row and re-run.
--
-- Common shape:
--   category  = 'Career Strategy'
--   audience  = 'job_seeker'       (post-HS pivot into the workforce)
--   sector    = matching slug from shared/sectors.ts
--   kind      = 'guide'            (long-form how-to-enter-the-field)
--   status    = 'published'
--   tags      = role + ['ai-resilient','new-grad','no-degree']

-- == 1. Electrician (skilled_trades) ===================================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-an-electrician',
  'So You Want to Become an Electrician: The Apprenticeship Path AI Cannot Take',
  $body$You just walked across the stage. You are looking at a $40,000-$120,000 college bill, four years that will not pay rent, and the realization that the "knowledge-work" economy AI is eating first is exactly the one your guidance counselor was steering you toward.

There is another path. Electrical work is one of the most durable careers in the United States -- and the standard route into it pays you while you train.

## Why this career is AI-resilient

Pulling wire through a 200-amp service panel, terminating EMT inside a finished wall, troubleshooting why a hospital generator will not transfer -- none of this is automatable. Estimating and bidding are getting AI-assisted, but the on-tools work that turns a permit into power is physical, in-person, judgment-driven, and protected by state licensure. Master electricians have more leverage today than they had a decade ago -- every data center, hospital wing, and solar farm needs them and there are not enough.

## What you actually do

Day-to-day, an electrician reads prints, pulls and terminates conductors, installs panels and devices, troubleshoots faults with a meter, and signs work that has to pass an inspector. Residential, commercial, industrial, and lineman tracks all use the same first three years of training but specialize after. Expect early mornings, real weather, a 50-lb tool bag, and the satisfaction of leaving a job lit up that was not.

## What you will earn

Apprentices typically start at 40-50% of journeyman scale and step up every 6 months. In most metros that is $18-$28/hr in year one with full benefits inside a union local. Journeymen run $35-$55/hr base ($70k-$110k). Master electricians and foremen on prevailing-wage work routinely clear $130k+. Owners of small shops are the high end. Lineman scale is higher still ($45-$80/hr) for the physical risk premium.

## The path from high school

### Option 1 - Union apprenticeship (recommended)
- **Length:** 4-5 years, paid throughout
- **Cost:** $0-$1,000 (books + some tools). You earn while you learn.
- **Who runs it:** IBEW + NECA via the [Electrical Training Alliance](https://www.electricaltrainingalliance.org/). Application is through your nearest JATC (Joint Apprenticeship Training Committee).
- **How to get in:** Apply at your local JATC, take the aptitude test (algebra + reading comprehension), interview, get ranked, accept a slot. Some locals run an annual application window -- check yours now.

### Option 2 - Non-union / open-shop apprenticeship
- **Length:** 4 years
- **Cost:** Low (employer-sponsored)
- **Who runs it:** [ABC](https://www.abc.org/) (Associated Builders and Contractors) or [IEC](https://www.ieci.org/) (Independent Electrical Contractors). A local shop hires you as an apprentice and pays for your classroom hours.

### Option 3 - Trade school first, then apprenticeship
- **Length:** 6-18 months of school, then start counting apprentice hours
- **Cost:** $5k-$20k (community college trade programs are the cheap end)
- **When this makes sense:** You want shop time before committing, or your local apprenticeship is competitive and you want a stronger application.

## Certifications and licensing you need

- **State journeyman license** after 8,000 supervised hours + state exam (NEC + state amendments).
- **Master electrician license** after 2,000+ additional journeyman hours + exam, in most states.
- **OSHA 10** (entry) and **OSHA 30** (foreman track) -- get OSHA 10 before you apply.
- **EPA 608** if you are touching refrigerant on HVAC/R service calls.
- **CPR/First Aid** -- required at most jobsites.

## Courses to take before you commit

- Free: [Mike Holt's YouTube channel](https://www.youtube.com/@MikeHoltNEC) on the National Electrical Code.
- Community college: an "Intro to Electrical Trades" or "Electrical I" course (1 semester, ~$500) doubles as evidence on your apprenticeship application.
- Math: brush up on algebra, fractions, and Ohm's law. The IBEW aptitude test leans hard on math reasoning.
- Pre-apprenticeship: programs like [MC3](https://www.bctd.org/Apprenticeship-Programs/Pre-Apprenticeship/MC3) get you classroom hours that count.

## How to land your first apprenticeship (and how hired.video helps)

JATCs interview hundreds of applicants and pick maybe 10-30 per cohort. The candidates who get picked share three things: they showed up early to every step, they have a concrete reason for choosing the trade, and they look like someone a foreman would put on a 5-person crew. A written application cannot show any of that. A 60-second video resume can.

Open the [Video Resume Studio](/studio) and pick the **Hook-Led** template. Record:
- **Hook (0:00-0:05):** the one sentence that explains why electrical, not why "a job". ("I helped my dad rewire our basement last summer. I want to do this for the next 30 years.")
- **Body (0:05-0:45):** any hands-on you have done -- auto shop, robotics, theatre lighting, construction, family business -- plus your math/OSHA 10/pre-apprenticeship coursework.
- **Close (0:45-0:60):** the specific local you are applying to and when you can start.

Attach the clip to your [hired.video profile](/profile) and share the link in the "anything else?" field of your JATC application. Foremen and apprenticeship coordinators on the platform can find you via [skilled-trades jobs](/jobs?sector=skilled_trades) before you have even passed the exam.

## FAQ

**Do I need a college degree?**
No. A high-school diploma or GED is the only academic prerequisite for almost every U.S. apprenticeship. A degree will not make you a better candidate; relevant work, math scores, and showing up early will.

**How long until I can support myself?**
First paycheck inside an apprenticeship covers rent and groceries in most metros. By year 3 you are at journeyman-adjacent pay. By year 5 you are licensed and free to move shops, contract independently, or specialize.

**Is there a ceiling?**
No. Foreman, general foreman, superintendent, estimator, shop owner is the typical promotion ladder. Owners of small electrical shops in growing metros routinely clear $250k+ once they have 5-10 crews working.$body$,
  'How to become an electrician straight out of high school -- the IBEW + non-union apprenticeship paths, what they pay, the licenses you need, and how to use a video resume to stand out on your JATC application.',
  'Career Strategy',
  '["electrician","skilled-trades","apprenticeship","ai-resilient","new-grad","no-degree","trades","IBEW"]'::jsonb,
  'skilled_trades',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 2. HVAC Technician (skilled_trades) ===============================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-an-hvac-technician',
  'So You Want to Become an HVAC Technician: EPA 608, NATE, and the Fastest Trade Path',
  $body$You graduated, summer is hot, and your AC stopped working. So did your neighbor's, and so did the office tower across town. There are not enough HVAC technicians in the United States to keep up with the AC, refrigeration, and heat-pump load on the grid -- and no amount of AI is going to lift a 40-lb condenser onto a roof.

HVAC is the fastest trade to enter, the easiest to specialize from later, and one of the most recession-resistant careers in the country.

## Why this career is AI-resilient

Every diagnosis happens on a roof, in a crawlspace, or on a residential service call. Refrigerant work is federally regulated. Heat-pump conversion is a multi-decade build-out tied to grid electrification. Estimating and dispatching are getting AI-assisted, but the wrench work is in-person and judgment-driven. Service techs with five years in are some of the most stable, mobile workers in the labor market.

## What you actually do

Install + commission residential and commercial HVAC equipment, run service calls (no cool air, no hot water, weird noise, refrigerant leak), perform seasonal maintenance, troubleshoot controls and refrigeration cycles, document work for warranty and EPA records. Specialization tracks: residential service, commercial / VRF, industrial refrigeration, controls and BMS, heat-pump retrofit.

## What you will earn

Apprentice / helper: $16-$22/hr. Journeyman service tech: $28-$42/hr ($60k-$90k). Senior commercial / VRF / controls techs in major metros: $45-$60/hr ($95k-$130k). Industrial refrigeration (ammonia) is the highest paid track. Owners of two-truck shops typically clear $200k+ within a few years.

## The path from high school

### Option 1 - Trade school + employer apprenticeship (fastest)
- **Length:** 6-24 months of school, then a 2-5 year apprenticeship at a contractor
- **Cost:** $4k-$15k for community-college HVAC certificates; private trade schools cost more. Many employers reimburse.
- **Who runs it:** community colleges, [HVAC Excellence](https://www.escogroup.org/HVACExcellence/), [NATE](https://www.natex.org/)-prep programs.

### Option 2 - Union apprenticeship (UA / SMART / IBEW controls)
- **Length:** 4-5 years, paid throughout
- **Cost:** $0
- **Who runs it:** [UA Local](https://ua.org/) (pipefitter/HVAC service track) or [SMART](https://smart-union.org/) (sheet-metal / HVAC install). Strongest in commercial markets.

### Option 3 - Manufacturer programs
- **Length:** 6-18 months
- **Who runs it:** [Carrier](https://www.carrieruniversity.com/), Trane, Lennox, Daikin all run technician academies, often with placement guarantees. Best if you already know you want a service-tech career and have a local dealer to land with.

## Certifications and licensing you need

- **EPA Section 608** -- federal cert for handling refrigerant. Universal cert is the goal. Required before you turn a wrench on a sealed system. Test fee ~$25.
- **NATE Core + Specialty** ([North American Technician Excellence](https://www.natex.org/)) -- the industry gold standard. Specialties: AC, heat pump, gas furnace, oil, hydronics, light commercial, commercial refrigeration.
- **HVAC Excellence Certified Specialist** -- alternative to NATE; some employers prefer.
- **R-410A / R-454B handling certs** -- get the latest A2L training as the industry transitions.
- **State HVAC license** -- required in many states (TX, FL, CA, NC, etc.). Usually 4 years experience + exam.
- **OSHA 10**, **CPR/First Aid**, **EPA 609** (auto AC, optional).

## Courses to take before you commit

- Free: [HVAC School](https://hvacrschool.com/) podcast and YouTube (Bryan Orr). Best free curriculum in the trade.
- Community college: "HVAC Fundamentals" -- 1 semester, ~$500-$800. Pairs with EPA 608 prep.
- Hands-on: refrigeration-cycle workbook + a $40 manifold gauge set. Tear apart a window unit. Diagnose a thermostat.
- Math: basic algebra, pressure-temperature charts, electrical Ohm's law.

## How to land your first job (and how hired.video helps)

Service managers hire for two things: can you talk to a homeowner whose AC is dead on a 95-degree day, and will you call before you tear into a system you do not understand? Both of those are visible in a 60-second video and invisible on a paper resume.

Open the [Video Resume Studio](/studio) and pick the **Story-Led** template. Show:
- **Hook:** "I just finished my EPA 608 Universal cert and I am looking for a residential service truck to ride along with." -- that one sentence ranks above 90% of resumes.
- **Middle:** a brief story of any hands-on you have done -- a school capstone, a brake job, helping a relative replace a furnace. Does not have to be HVAC. Show you can hold a multimeter.
- **Close:** what you want -- "looking for a service-tech apprenticeship at a residential dealer that runs the Carrier / Trane / Daikin line."

Pair the video with your hired.video profile and apply through [skilled-trades jobs](/jobs?sector=skilled_trades). Service managers see your face, hear your tone, and know if they would put you in front of a customer before they call you back.

## FAQ

**Do I need a college degree?**
No. A high-school diploma + EPA 608 is the floor. A community-college certificate accelerates everything that comes next.

**How fast can I start earning?**
Helper rates start the day you walk on a truck. EPA 608 + a 6-month cert is enough to land an entry job in most metros within 8-12 weeks of finishing school.

**Best long-term track?**
Commercial / VRF / controls + an EPA 608 Universal + a controls cert (BACnet, Tridium) is the highest ceiling track. Industrial ammonia refrigeration is niche but pays more than almost any other trade.$body$,
  'How to become an HVAC technician straight out of high school -- the trade-school + apprenticeship paths, EPA 608 + NATE certifications, what you will earn, and how a 60-second video resume gets you on a service truck fastest.',
  'Career Strategy',
  '["hvac","skilled-trades","apprenticeship","epa-608","ai-resilient","new-grad","no-degree","trades"]'::jsonb,
  'skilled_trades',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 3. Plumber (skilled_trades) =======================================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-a-plumber',
  'So You Want to Become a Plumber: The UA Apprenticeship, Licensing, and Why You Will Out-Earn Most College Grads',
  $body$Every house, every hospital, every restaurant, every brewery, every data center has a problem that only a licensed plumber can legally fix. The country is short tens of thousands of plumbers. The boomers who built the existing systems are retiring faster than new apprentices come up. This is the most under-supplied trade in America, and AI is not going to crawl under your kitchen sink.

## Why this career is AI-resilient

Wet work happens in person. Code-compliant installations require a licensed human signature. Service calls require diagnosis under uncertainty -- root in a lateral, hidden slab leak, weird DWV venting. Master plumbers run their own shops with 50%+ margins because licensing creates a real barrier to entry and supply has shrunk every year since 2008.

## What you actually do

Install, service, and repair potable water, drain-waste-vent (DWV), gas, hydronic heating, and medical gas systems in residential, commercial, and industrial buildings. Read prints, pull permits, work alongside inspectors. Specialization tracks: residential service, commercial / new construction, industrial pipefitter, gas service, hydronic heating, medical gas, backflow.

## What you will earn

Apprentices start ~$18-$24/hr. Journeymen run $35-$55/hr base ($75k-$115k). Foremen and master plumbers on commercial / prevailing-wage projects clear $130k+. Service plumbers running their own truck routinely net $150k-$250k+ once they have a customer book. Backflow + medical-gas specialists command a premium.

## The path from high school

### Option 1 - UA apprenticeship (recommended)
- **Length:** 5 years, paid throughout
- **Cost:** $0
- **Who runs it:** [United Association](https://ua.org/) (UA) -- covers plumbers, pipefitters, sprinkler fitters, HVAC service. Apply at your nearest UA Local. Strongest in commercial markets.

### Option 2 - Non-union apprenticeship
- **Length:** 4-5 years
- **Who runs it:** [PHCC](https://www.phccweb.org/) (Plumbing-Heating-Cooling Contractors Association) and individual master-plumber shops. Apply directly at a local shop and ask to start as a helper / apprentice.

### Option 3 - Trade school + apprenticeship
- **Length:** 9-24 months school, then start the apprenticeship clock
- **Cost:** $4k-$18k (community-college plumbing programs are cheapest)
- **When this makes sense:** Competitive local UA, or you want shop fundamentals before going on a truck.

## Certifications and licensing you need

- **State journeyman plumber license** after 8,000-10,000 supervised hours + state exam (IPC or UPC + state amendments).
- **State master plumber license** after 2,000+ additional journeyman hours + business-law exam, in most states.
- **Backflow Prevention** certification (ASSE 5110/5130) -- high-margin specialty.
- **Medical Gas Installer** (ASSE 6010) -- required for any hospital work.
- **Gas Fitter** license -- separate ticket in many states.
- **OSHA 10**, **CPR/First Aid**.

## Courses to take before you commit

- Free: [Roger Wakefield](https://www.youtube.com/@RogerWakefield) and [The Expert Plumber](https://www.youtube.com/@TheExpertPlumber) on YouTube.
- Community college: "Plumbing I / Pipe Trades" (1 semester, ~$500).
- Code book: get a used copy of the IPC or UPC for your state. Reading code is the day job.
- Math: fractions, decimals, basic algebra, geometry (pipe offsets).

## How to land your first apprenticeship (and how hired.video helps)

Shop owners and UA apprenticeship boards screen for one thing: will you still be here in two years? They have watched too many promising hires quit because the work is wet, cold, sometimes literally inside someone's septic situation. Show up looking like the person who will not quit.

Open the [Video Resume Studio](/studio) and pick the **Hook-Led** template. Show:
- **Hook:** "I helped my uncle re-pipe his rental property last spring. I want a UA Local 12 apprenticeship and a 30-year career." Specific, local, intentional.
- **Body:** any hands-on you have done, math/OSHA prep, the code book you have been reading.
- **Close:** "I can be at your shop next Monday."

Share via your hired.video profile and apply through [skilled-trades jobs](/jobs?sector=skilled_trades). Service managers and journeymen-turned-recruiters see your face and your intent on the first impression.

## FAQ

**Do I need to be strong?**
You need to be willing. Most service plumbing is dexterity + diagnosis, not deadlift. Heavy pipefitting work in industrial is genuinely physical; residential service is more about getting into tight spaces.

**Best long-term track?**
Master plumber + own your truck and book is the highest-leverage outcome. Medical gas, backflow, hydronics, and natural-gas tickets are the highest-paid specialties.

**Will AI dispatch eliminate jobs?**
Dispatch + scheduling will keep automating. Wrench time will not.$body$,
  'How to become a plumber from a high-school diploma -- the UA + non-union apprenticeship paths, journeyman + master licensure, what you will earn, and how to use a video resume to get on a service truck.',
  'Career Strategy',
  '["plumber","skilled-trades","apprenticeship","ua-local","ai-resilient","new-grad","no-degree","trades"]'::jsonb,
  'skilled_trades',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 4. Welder (skilled_trades) ========================================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-a-welder',
  'So You Want to Become a Welder: AWS Certifications, Pipeline Pay, and the Fastest Trade Cert Path',
  $body$Pipeline. Shipyard. Aerospace. Structural steel. Nuclear. Subsea. There is no shortage of welders in the United States -- there is a shortage of *certified* welders who can pass a coupon test on the first try, and the gap is widening as the boomers who built American industry retire.

If you can hold a torch steady and read a print, you can be making six figures in your mid-20s with no college debt.

## Why this career is AI-resilient

Welding is the textbook in-person, judgment-under-variability craft. A robot can MIG a 1/4" fillet weld in a factory all day, but it cannot crawl into a confined space on a pipeline, qualify itself with an X-ray test, or repair a structural defect in the field. The certified field-welder market is more under-supplied than it was a decade ago, not less.

## What you actually do

Read prints and weld procedure specifications (WPS), prep joints, run beads (SMAW / GMAW / GTAW / FCAW), inspect your own work, pass coupon tests for the procedures you are hired on. Specialization tracks: structural / ironwork, pipeline, pipe / process, shipyard, aerospace, underwater, nuclear, racing / motorsports.

## What you will earn

Entry shop welder: $18-$26/hr. Certified structural / fab shop: $25-$40/hr ($55k-$85k). Certified pipe welder (6G TIG): $35-$70/hr ($80k-$160k) -- and per-diem road work piles on top. Pipeline rig welders on union jobs can clear $200k+ in a good season. Underwater welders are the highest single-job rates in the trades (hazard premium). Aerospace + nuclear are more stable than pipeline but pay slightly less.

## The path from high school

### Option 1 - Community-college / trade-school welding program (recommended)
- **Length:** 6-18 months for a certificate, 2 years for an AAS degree
- **Cost:** $3k-$15k (community college) to $20k+ (private)
- **What you get:** Booth time, multiple processes, an AWS-aligned curriculum, prep for certification tests. Best ROI in the trade.
- **Top programs:** Tulsa Welding School, Hobart Institute, [community colleges with AWS Accredited Test Facility status](https://www.aws.org/).

### Option 2 - Union apprenticeship
- **Length:** 3-4 years, paid throughout
- **Who runs it:** [Ironworkers](https://www.ironworkers.org/) (structural), [UA](https://ua.org/) (pipe welders / pipefitters), [Boilermakers](https://boilermakers.org/), [Pipeliners 798](https://pipeliners798.com/) (the legendary pipeline local -- competitive).

### Option 3 - Get a job in a fab shop and learn on the bench
- **Length:** Open-ended
- **Cost:** $0
- **Reality:** Faster paycheck, slower skill curve. Works best if you already have basic torch time from a HS shop class.

## Certifications and licensing you need

Welding is *cert-driven*. Procedures, not licenses. Hired off the bench each job.

- **AWS D1.1** -- Structural steel. Most common cert in the country.
- **AWS D1.5** -- Structural bridges.
- **API 1104** -- Pipeline.
- **ASME Section IX** -- Pressure piping + boilers. The pipe welder's ticket.
- **AWS D17.1** -- Aerospace.
- **6G position TIG** -- The pipe welder's bragging right; opens the highest pay tracks.
- **CWI** ([Certified Welding Inspector](https://www.aws.org/certification/page/cwi)) -- Senior career move; the inspector watches the welders.

## Courses to take before you commit

- Free: [Weld.com](https://www.youtube.com/@weldDOTcom), Tim Welds, [This Old Tony](https://www.youtube.com/@ThisOldTony) for fabrication mindset.
- Community college: "Intro to Welding" -- 1 semester, ~$400. Lets you find out if you actually like booth time before you commit a year of tuition.
- Symbols + prints: get the AWS A2.4 standard. Reading welding symbols is half the job.
- Math: geometry (joint prep angles), basic trig, fractions.

## How to land your first job (and how hired.video helps)

Fab shops want to see your weld before they call you in for a coupon test. A 60-second video resume that *includes a clip of you running a bead* is dramatically more powerful than a written resume.

Open the [Video Resume Studio](/studio) and pick the **Hook-Led** template. Show:
- **Hook (0:00-0:05):** B-roll of you running a stringer, voice-over: "AWS D1.1 certified. 6 months of booth time. Looking for a structural fab shop."
- **Body (0:05-0:45):** the certs you have, the certs you are testing for next, processes you are comfortable with (SMAW 6010/7018, MIG, TIG).
- **Close (0:45-0:60):** "I can be on the floor next Monday."

Post the video on your hired.video profile and apply through [skilled-trades jobs](/jobs?sector=skilled_trades). Shop foremen on the platform can see your weld before they read your name.

## FAQ

**Do I need to be strong?**
Helps, but precision matters more than power. TIG welders and aerospace welders are precision-driven; rig welders on a pipeline are tougher physical work.

**Pipeline vs. structural?**
Pipeline pays the most but requires road life, weather, and per-diem stretches away from home. Structural is steadier life, lower ceiling. Aerospace + nuclear are highest stability per dollar.

**How fast to six figures?**
Pipe welder with 6G TIG + per-diem work can clear $100k inside 24 months of finishing trade school. Structural takes 4-6 years to reach foreman scale.$body$,
  'How to become a welder out of high school -- AWS-certified trade-school routes, union apprenticeships, the certifications that unlock pipeline + aerospace pay, and how to use a video resume that shows you actually weld.',
  'Career Strategy',
  '["welder","welding","skilled-trades","aws-certification","pipeline","ai-resilient","new-grad","no-degree","trades"]'::jsonb,
  'skilled_trades',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 5. EMT / Paramedic (healthcare) ===================================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-an-emt',
  'So You Want to Become an EMT or Paramedic: NREMT, State License, and the Fastest Healthcare Entry',
  $body$Sirens at 2am. A car wreck on I-95. A diabetic in a stairwell. A grandmother having a stroke in her kitchen. Somebody has to be the first medically trained person to put their hands on the patient. AI will not. A paramedic will.

EMT is the fastest credentialed entry into healthcare. You can be on an ambulance within 6 months of finishing high school.

## Why this career is AI-resilient

Patient assessment, vitals, airway, hemorrhage control, splinting, IV access, cardiac monitoring, drug administration under uncertainty in a moving vehicle -- there is no automating any of this in the foreseeable future. The shortage of paramedics in the U.S. is acute; rural systems are paying signing bonuses, urban systems are paying overtime that doubles base.

## What you actually do

Respond to 911 calls, run hospital interfacility transfers, work festivals and stadiums, ride flight crews, or work as a tactical medic with SWAT teams. Every shift is unpredictable. EMT-Basic stabilizes. Paramedic does advanced airway, IV / IO access, cardiac rhythm interpretation, drug administration. Most fire departments require a paramedic cert.

## What you will earn

- **EMT-Basic:** $16-$24/hr ($33k-$50k). Often a stepping stone, not a destination.
- **Paramedic:** $22-$38/hr ($45k-$80k). Critical-care + flight medics top $90k.
- **Fire-medic (dual cert):** $60k-$110k+ depending on department.
- **Tactical / industrial / offshore medic:** $80k-$150k+ for high-stakes settings.

## The path from high school

### Option 1 - EMT-Basic, then Paramedic (recommended)
- **EMT-Basic:** 120-200 classroom + clinical hours. Most students finish in 8-16 weeks at a community college or technical school. Cost: $800-$2,500.
- **Paramedic bridge:** After ~6-12 months of EMT-B field experience, enroll in a paramedic program. ~1,200-1,800 hours over 12-24 months. Cost: $5k-$15k (community college) to $25k (private). Many fire departments pay you to attend.

### Option 2 - Direct paramedic program (some states)
- **Length:** 2 years (AAS in Emergency Medical Services)
- **Cost:** $5k-$15k at a community college
- **Why:** Stack everything in one program; come out hire-ready as a medic.

### Option 3 - Fire academy + paramedic dual track
- **Length:** 1-2 years
- **Why:** Most municipal fire jobs require paramedic. Some departments hire you, then send you to medic school on payroll.

## Certifications and licensing you need

- **NREMT** ([National Registry of EMTs](https://www.nremt.org/)) -- the universal entrance exam for both EMT and Paramedic.
- **State EMT license** -- required to practice. Reciprocity is usually straightforward if you hold NREMT.
- **BLS / ACLS / PALS / PHTLS** -- standard layered certs as you advance.
- **AEMT** (Advanced EMT) -- optional intermediate level in some states.
- **CCP-C** or **FP-C** -- critical care + flight paramedic certifications; pay premium.

## Courses to take before you commit

- Free: [Limmer Education](https://www.limmereducation.com/) practice tests for NREMT; [EMTprep](https://emtprep.com/) on YouTube.
- Pre-EMT: a basic anatomy + physiology course (community college, 1 semester, ~$400) shortens the EMT class learning curve.
- CPR / First Aid (American Heart Association) -- get the [BLS Provider](https://cpr.heart.org/) cert before class starts.
- Volunteer: ride along with a local fire/EMS service to confirm you can stomach the work.

## How to land your first ambulance job (and how hired.video helps)

EMS hiring managers want to know two things: can you keep your head when the call is bad, and can you talk to a frightened family member without making them more frightened. Both of those come across in a 60-second video and disappear on a paper resume.

Open the [Video Resume Studio](/studio) and pick the **Story-Led** template. Show:
- **Hook:** "Just NREMT-certified. Looking for a 911 shift at a busy ALS service."
- **Middle:** one calm story -- a clinical rotation moment, a high-pressure school sports save, a volunteer ride-along where you handled the scene tone.
- **Close:** "I am ready to start clearing field training next pay period."

Attach the video to your hired.video profile and apply through [healthcare jobs](/jobs?sector=healthcare). EMS chiefs and fire-department recruiters who use the platform see your bearing before they read your resume.

## FAQ

**Do I need a degree?**
No. An NREMT cert + state license is enough to work as an EMT or paramedic. An AAS helps if you want to climb to fire-captain or move into nursing later.

**EMS vs. fire?**
Same path early, branches after paramedic. Fire is municipal civil service with pension. EMS-only roles are private (AMR, Falck) or hospital-based, less benefits but more clinical autonomy.

**Bridge to nursing?**
Common. Paramedic-to-RN bridge programs are 12-18 months. Many paramedics go RN for the pay and schedule.$body$,
  'How to become an EMT or paramedic straight out of high school -- the NREMT path, EMT-Basic to paramedic timeline, state licensure, what you will earn, and how a 60-second video resume gets you on a 911 truck.',
  'Career Strategy',
  '["emt","paramedic","healthcare","nremt","ai-resilient","new-grad","no-degree","ems"]'::jsonb,
  'healthcare',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 6. CNA (healthcare) ===============================================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-a-cna',
  'So You Want to Become a CNA: A 4-12 Week Path Into Healthcare That AI Cannot Replace',
  $body$Touch is not automatable. Helping an elderly patient get out of bed safely, recognizing a change in mental status before the nurse rounds, comforting a family member when their parent is dying -- AI will not do any of this. CNAs do, and the country needs about a million more of them than it has.

It is the fastest credentialed step into healthcare. Done in 4-12 weeks, often free.

## Why this career is AI-resilient

Long-term care, hospitals, hospice, rehab, home health -- every facility runs on CNAs. Direct patient care, lifting, vitals, ADLs (activities of daily living), turning patients to prevent pressure injuries -- these are the irreducibly physical bedside tasks that show up before nurses and after physicians, and they keep facilities legally compliant.

## What you actually do

Help patients bathe, dress, eat, transfer, toilet, and ambulate. Take vitals. Document intake / output. Reposition immobile patients every 2 hours. Recognize and report changes (a new cough, confusion, a fall risk). Communicate with nurses + family.

## What you will earn

- **CNA:** $15-$22/hr ($31k-$45k). Higher in metros, hospital settings, and night/weekend differentials.
- **Travel CNA:** $25-$40/hr + stipends, after 1 year of experience.
- **Med Tech / CMA** (medication aide -- a CNA add-on in many states): +$2-$5/hr.
- **CNA-to-LPN/RN bridge:** doubles to triples pay in 12-24 months of additional school.

## The path from high school

### Option 1 - State-approved CNA program (recommended)
- **Length:** 4-12 weeks (75-180 hours, varies by state)
- **Cost:** $400-$1,800. Often free through:
  - Nursing homes that hire-and-train (you sign a 6-12 month commitment).
  - Hospitals running their own CNA academies (Banner, HCA, Kaiser, many regionals).
  - Workforce development programs ([American Job Center](https://www.careeronestop.org/), state Department of Labor).
  - High-school dual-enrollment "Health Sciences" tracks (free if you take it senior year).
- **Where to look:** [Red Cross CNA programs](https://www.redcross.org/take-a-class/cna), community colleges, large hospital systems.

### Option 2 - Hospital-sponsored apprenticeship
- **Length:** 4-12 weeks of class, then on-the-floor under preceptor
- **Cost:** Often $0 -- you are an employee from day one.

### Option 3 - HS Health Sciences track
- **Length:** Part of senior year
- **Cost:** Free
- **Why:** Walk across the stage already CNA-eligible.

## Certifications and licensing you need

- **State CNA registry listing** after passing the NNAAP-aligned state exam (written + skills evaluation).
- **CPR / BLS Provider** (AHA) -- required at every facility.
- **HIPAA training** -- usually included in your program.
- **Optional add-ons:** Med Tech (CMA), Restorative Aide, Dementia / Alzheimer's specialty, Hospice, Phlebotomy crossover.

## Courses to take before you commit

- Free: [RegisteredNurseRN](https://www.youtube.com/@RegisteredNurseRN) on YouTube for vitals + nursing fundamentals.
- Volunteer: shadow at a nearby nursing home or hospital -- 4 hours tells you whether the work is for you.
- Basic anatomy course (community college, 1 semester, ~$400). Shortens your CNA program.
- CPR: get a Red Cross or AHA BLS card before your program -- saves time in week one.

## How to land your first floor job (and how hired.video helps)

Charge nurses and HR coordinators hire CNAs on one signal: will this person treat my patients gently. A 60-second video resume conveys warmth and presence in a way a paper resume never will.

Open the [Video Resume Studio](/studio) and pick the **Story-Led** template. Show:
- **Hook:** "I just got my CNA registry listing this month and I am ready to start on a med-surg floor."
- **Middle:** one story about caring for someone -- a grandparent, a sibling with special needs, a clinical rotation moment. Why the work matters to you.
- **Close:** "I can pick up nights or weekends and I am committed to staying through the year."

Attach to your hired.video profile and apply through [healthcare jobs](/jobs?sector=healthcare). Hospital HR + DON (Director of Nursing) recruiters see your bearing first.

## FAQ

**Is the work physically hard?**
Yes. Lifting, transferring, long shifts on your feet. Most facilities use Hoyer lifts and gait belts, but the work is real labor.

**Bridge to nurse?**
The CNA-to-LPN (12-18 months) and LPN-to-RN (18-24 months) ladders are the standard. Many hospitals pay tuition once you are on staff.

**Best setting to start in?**
Hospital med-surg if you can land it -- highest exposure to skills + nurses willing to teach + clearer paths up. Long-term care is steadier, slower-paced, and often more stable hours.$body$,
  'How to become a CNA out of high school -- the 4-12 week state-approved programs, free hospital-sponsored paths, certifications, what you will earn, and how a video resume helps you land a med-surg floor job.',
  'Career Strategy',
  '["cna","nurse-aide","healthcare","ai-resilient","new-grad","no-degree","nursing"]'::jsonb,
  'healthcare',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 7. Phlebotomist (healthcare) ======================================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-a-phlebotomist',
  'So You Want to Become a Phlebotomist: A 4-8 Week Path Into Healthcare AI Cannot Replace',
  $body$Every blood draw in every hospital, clinic, lab, donor center, plasma center, and mobile draw site requires a calm human with a steady hand. AI cannot find a vein in a dehydrated 87-year-old or hold a screaming toddler still. Phlebotomists can, and the U.S. needs tens of thousands more.

This is the fastest credential in the healthcare sector. Most students finish in 4-8 weeks.

## Why this career is AI-resilient

Vein selection under variability, needle skill under emotional pressure, sterile technique, patient identification, sample labeling under chain-of-custody rules. None automatable. Lab automation has actually *increased* phlebotomy demand because labs can process more samples than ever -- they just need somebody to draw them.

## What you actually do

Draw blood (venipuncture, capillary, pediatric), perform basic specimen processing, label and document samples per chain-of-custody, manage difficult sticks (pediatric, geriatric, oncology), occasionally assist with EKGs / urinalysis / specimen collection. Settings: hospitals (in-patient + outpatient draw stations), reference labs (LabCorp, Quest), plasma donor centers (CSL, Grifols, Octapharma), blood banks (Red Cross), mobile phlebotomy, physician offices.

## What you will earn

- **Entry phlebotomist:** $16-$22/hr ($33k-$45k)
- **Hospital phlebotomist (with night/weekend differentials):** $20-$28/hr
- **Plasma center supervisor:** $25-$35/hr ($55k-$72k)
- **Mobile / per-diem (self-scheduled):** $30-$45/hr in some markets

## The path from high school

### Option 1 - Community-college / Red Cross phlebotomy program (recommended)
- **Length:** 4-12 weeks (60-120 classroom + clinical hours)
- **Cost:** $700-$2,500
- **Who runs it:** community colleges, [Red Cross](https://www.redcross.org/take-a-class/cna), [National Phlebotomy Association](https://nationalphlebotomy.org/), private vocational schools.
- **Includes:** ~25-100 successful supervised draws (varies by program / state) -- required to sit for certification.

### Option 2 - Plasma center hire-and-train
- **Length:** 4-8 weeks paid training
- **Cost:** $0 -- they pay you to learn.
- **Trade-off:** Tied to one center for a commitment period; only learn venipuncture, not capillary or specialty.

### Option 3 - CNA / MA + phlebotomy stack
- **Length:** Stack the phlebotomy cert on an existing CNA or MA credential
- **Why:** Doubles your callable shifts and your shift differentials.

## Certifications and licensing you need

- **National certification** -- not federally required, but ~every employer wants one:
  - [ASCP](https://www.ascp.org/) PBT (most respected)
  - [NHA](https://www.nhanow.com/) CPT
  - [AMT](https://www.americanmedtech.org/) RPT
  - [NCCT](https://www.ncctinc.com/) NCPT
- **State license** -- required in California, Washington, Nevada, Louisiana (and varies elsewhere).
- **CPR / BLS** -- required at every facility.

## Courses to take before you commit

- Free: [Phlebotomy Coach](https://www.youtube.com/@phlebotomycoach) on YouTube; ASCP practice question banks.
- Anatomy + physiology basics (community-college 1-semester course, ~$400) -- not required, but accelerates everything.
- CPR / BLS Provider -- get the AHA card before class.
- Volunteer at a hospital draw station: confirms you can handle the work and gets a recommendation letter.

## How to land your first draw-station job (and how hired.video helps)

Lab supervisors hire phlebotomists on one signal: will this person stay composed when the patient panics. A video resume shows that. A paper resume cannot.

Open the [Video Resume Studio](/studio) and pick the **Story-Led** template. Show:
- **Hook:** "I just passed my ASCP PBT exam. Ready for a draw-station shift."
- **Middle:** one short story -- a tough stick during clinicals, a pediatric draw, a moment you de-escalated a nervous patient.
- **Close:** "I can be in scrubs for orientation Monday."

Pair with your hired.video profile and apply through [healthcare jobs](/jobs?sector=healthcare). Hospital lab + reference-lab recruiters see your tone and presence on the first impression.

## FAQ

**Do I need a degree?**
No. A state-approved program + national certification + (in some states) state licensure is all you need.

**Are needles scary?**
You normalize quickly. The harder skill is staying calm when the *patient* is scared.

**Bridge to other roles?**
Phlebotomy + CNA opens medical-assistant roles. Phlebotomy + EKG / lab assistant opens hospital lab tech tracks. Phlebotomy is also a common pre-nursing credential.$body$,
  'How to become a phlebotomist out of high school -- the 4-8 week programs, national certifications (ASCP, NHA, AMT), state licensure where required, what you will earn, and how a video resume helps you land a hospital draw station.',
  'Career Strategy',
  '["phlebotomist","phlebotomy","healthcare","ai-resilient","new-grad","no-degree","ascp"]'::jsonb,
  'healthcare',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 8. Surgical Tech (healthcare) =====================================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-a-surgical-tech',
  'So You Want to Become a Surgical Tech: CAAHEP Programs, CST Cert, and a 12-24 Month Path Into the OR',
  $body$The lights come up over the table. The surgeon scrubs in. Somebody on the other side of the drape has already set up every instrument, knows what is coming next, and will hand it over before the surgeon asks. That somebody is a surgical technologist. AI is not stepping into the sterile field.

## Why this career is AI-resilient

Sterile technique under pressure, instrument anticipation, count accuracy with patient lives on it, real-time adaptation to surgical findings -- the entire role is bedside, in-person, judgment-driven, and protected by certification + hospital credentialing. Demand has outpaced supply for over a decade.

## What you actually do

Set up sterile field + instrument tables before procedures. Pass instruments to the surgeon. Maintain sterility. Anticipate next steps. Hold retractors. Perform sponge / instrument / needle counts. Help with specimen handling. Specialties: cardiothoracic, ortho, neuro, trauma, OB, pediatric, robotic-assisted (da Vinci), ENT, vascular.

## What you will earn

- **New CST:** $22-$32/hr ($46k-$66k)
- **Experienced CST:** $32-$45/hr ($65k-$95k)
- **Specialty (cardiothoracic, neuro, trauma):** $40-$55/hr ($85k-$115k+)
- **Travel CST:** $50-$80/hr + stipends ($120k-$180k contract-to-contract)
- **First Assistant (CSFA / RNFA bridge):** $80k-$130k+

## The path from high school

### Option 1 - CAAHEP-accredited surgical tech program (required for cert)
- **Length:** 12-24 months for a certificate, 2 years for an AAS
- **Cost:** $5k-$25k (community college on the low end, private school higher)
- **Who runs it:** community colleges, hospital-based programs, [accredited schools listed on the ARC/STSA registry](https://www.arcstsa.org/).
- **Note:** Effective 2021+, [NBSTSA](https://www.nbstsa.org/) CST eligibility requires graduation from a CAAHEP- or ABHES-accredited program. Make sure your program is on the list before you enroll.

### Option 2 - Military-trained surgical tech
- **Length:** Initial training is short, gain experience during service
- **Cost:** $0 -- the military pays + trains.
- **Branches:** Army 68D, Navy / Marines HM-8483, Air Force 4N1X1. Translates directly to civilian CST after.

### Option 3 - Hospital-sponsored program
- **Length:** 12-18 months
- **Cost:** Often free / paid in exchange for a service commitment after.
- **Where to look:** large hospital systems (HCA, Ascension, Kaiser, Banner) routinely run their own surgical tech academies.

## Certifications and licensing you need

- **CST** ([Certified Surgical Technologist](https://www.nbstsa.org/)) from NBSTSA -- the standard credential, required by most hospitals.
- **TS-C** (Tech in Surgery -- Certified) from NCCT -- alternative cert; some employers prefer.
- **State licensure / registration** -- required in some states (TX, MA, NY pending, etc.); check your state.
- **BLS / ACLS** -- required.
- **CSFA** (Certified Surgical First Assistant) -- senior career step; adds wound closure, retraction, vessel ligation; pays $80k+.

## Courses to take before you commit

- Free: [Surgical Technology Mastery](https://www.youtube.com/@surgicaltechmastery) on YouTube; NBSTSA practice question banks.
- Anatomy + physiology + medical terminology (community-college 1-semester, ~$400 each) -- usually prerequisites anyway.
- Volunteer at a hospital surgical services unit. Most hospitals offer "Operation Walk" or local volunteer programs that get you in the door.
- CPR / BLS Provider before program start.

## How to land your first OR job (and how hired.video helps)

OR managers hire surgical techs on one signal: will this person stay calm and focused when the room is. A video resume conveys composure better than any paragraph.

Open the [Video Resume Studio](/studio) and pick the **Story-Led** template. Show:
- **Hook:** "Just passed the NBSTSA CST exam. Looking for an OR position at a level-I trauma center."
- **Middle:** one moment from clinicals -- a long case where you held the count, a transition you anticipated, a difficult instrument hand-off.
- **Close:** "I can start orientation Monday."

Attach to your hired.video profile and apply through [healthcare jobs](/jobs?sector=healthcare). OR managers and surgical-services recruiters see your tone first.

## FAQ

**Hardest part of the job?**
Standing 8-12 hours, often without breaks, while staying alert. Some specialties (neuro, ortho) are physically heavier.

**CST vs. RN in the OR?**
CST is the sterile-field expert; RN circulates outside the field, documents, manages meds, and bridges to surgeon + anesthesia. Different jobs. CST is faster to enter; RN has a longer career ceiling.

**Best long-term track?**
CSFA (first assistant) opens $80k-$130k+ roles. Travel CST works too: 13-week contracts can clear $130k-$180k once you have 1-2 years of cases under your belt.$body$,
  'How to become a surgical tech out of high school -- CAAHEP-accredited programs, NBSTSA CST certification, state licensure, OR specialty tracks, what you will earn, and how a video resume gets you into an OR.',
  'Career Strategy',
  '["surgical-tech","surgical-technologist","healthcare","cst","ai-resilient","new-grad"]'::jsonb,
  'healthcare',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 9. Cosmetologist (beauty_personal_care) ===========================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-a-cosmetologist',
  'So You Want to Become a Cosmetologist: State Board, Booth Rental, and the Six-Figure Chair',
  $body$Hair color, cuts, styling, chemical services, nails, skin -- every service in this category requires physical touch, in-person consultation, and creative judgment. AI cannot give a balayage. The country licenses about 750,000 cosmetologists, and the top 10% of chairs are running six-figure books in major metros.

## Why this career is AI-resilient

Touch + creativity + in-person consultation = unautomatable. AI tools help cosmetologists with bookings, marketing, and color formulation prep, but the chair-time itself is the product. Booth-rental economics give cosmetologists small-business leverage similar to skilled trades.

## What you actually do

Cuts, color (single-process, dimensional, corrective), chemical services (perms, relaxers, smoothing), styling, blowouts, basic nails / skin (depending on license scope), consultations, retail recommendations, client retention. Specialization tracks: color specialist, extensions, editorial / bridal, salon ownership, platform artist for a brand.

## What you will earn

- **Apprentice / new licensee at a salon:** $14-$20/hr or 40-50% commission ($28k-$45k year 1)
- **Established stylist (W-2 commission):** $45k-$80k
- **Booth-rental stylist:** $60k-$150k+ (you control your prices + hours)
- **Salon owner:** $80k-$300k+ depending on chairs + services
- **Platform artist (Redken / L'Oreal / Wella):** $80k-$150k+ touring + teaching

## The path from high school

### Option 1 - State-licensed cosmetology school (required everywhere)
- **Length:** 1,000-1,600 instructional hours -- typically 9-15 months full-time, 18-24 months part-time
- **Cost:** $5k-$20k (community college / vocational) to $20k-$30k+ (private academies like Paul Mitchell, Aveda, Empire). Many qualify for federal financial aid.
- **What you get:** Classroom + clinic floor on real clients + prep for state board exams.

### Option 2 - Apprenticeship (available in some states)
- **Length:** Equivalent supervised hours (typically 3,000-3,500) under a licensed cosmetologist
- **Cost:** $0 -- you earn while you learn
- **States that allow:** California, Florida, Virginia, and a handful of others. Check your state board.

### Option 3 - HS cosmetology track (CTE)
- **Length:** Part of high school
- **Cost:** Free (public CTE programs)
- **Why:** Walk across the stage with hours already banked toward your state-board exam.

## Certifications and licensing you need

- **State cosmetology license** -- two-part exam (written + practical) administered through your state board after completing required hours. [PSI / NIC](https://www.nictesting.org/) is the most common exam provider.
- **License renewal** -- continuing education hours every 1-2 years, varies by state.
- **Reciprocity** -- moving states sometimes requires re-testing or additional hours; check ahead.
- **Optional add-ons:** Color certifications from major brands (Redken, Wella, Goldwell), extension certifications (Bellami, Great Lengths), Brazilian blowout / smoothing certs.

## Courses to take before you commit

- Free: [Sam Villa](https://www.youtube.com/@SamVillaHair) on YouTube (cutting fundamentals); [Color Kristina](https://www.youtube.com/@colorkristina) for color theory.
- Visit 3-5 schools before enrolling. Tour the clinic floor. Talk to current students about kit cost, hours, and placement.
- Build a portfolio Instagram now -- before you have your license, post inspiration boards, mood boards, and any model work.
- Get a model: practice cutting + braiding on willing friends. Document.

## How to land your first chair (and how hired.video helps)

Salon owners and booth managers hire on three signals: portfolio, presence, and consistency. A 30-60 second video resume showcases all three.

Open the [Video Resume Studio](/studio) and pick the **Hook-Led** template. Show:
- **Hook:** B-roll of you finishing a model's color or blowout, voice-over: "Just licensed cosmetologist. Color and dimensional work specialty. Looking for a chair at a salon that does education."
- **Middle:** scroll through 3-4 of your best portfolio looks; mention any certifications (a specific color brand, an extension method).
- **Close:** "I can demo a service for the manager this week."

Attach to your hired.video profile alongside your Instagram + portfolio link, and apply through [beauty + personal-care listings](/jobs?sector=beauty_personal_care). Salon owners see your craft and your tone before they call you in.

## FAQ

**Booth rental vs. commission?**
Start commission (W-2) to build a book + learn the business. Move to booth rental once you have 60-100 regular clients. Booth-rental keeps 90-100% of your service revenue but you pay your own taxes, supplies, and marketing.

**Will AI hurt the industry?**
No. AI is a tool. Booking, marketing, color simulation, and retail recommendations get faster. Chair time itself becomes more, not less, valuable.

**Highest-leverage long-term move?**
Build a personal brand on Instagram / TikTok while still in school. A 50k-follower local stylist with a strong portfolio earns 3-5x what an equally skilled stylist without an audience earns. Bridal + color specialty have the highest per-service margins.$body$,
  'How to become a cosmetologist out of high school -- state-licensed schools, 1,000-1,600 hour requirements, state-board licensure, what you will earn on commission vs booth rental, and how a video resume + portfolio reel lands a chair.',
  'Career Strategy',
  '["cosmetologist","cosmetology","beauty","hair-stylist","ai-resilient","new-grad","no-degree","licensed"]'::jsonb,
  'beauty_personal_care',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 10. Barber (beauty_personal_care) =================================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-a-barber',
  'So You Want to Become a Barber: Barber School, State License, and the Chair That Pays the Mortgage',
  $body$The barbershop is one of the oldest small businesses in America and one of the few professions AI cannot touch. Skin fades, beard sculpting, hot-towel shaves, hair-loss consultation -- in-person, hands-on, judgment-driven craft. The country licenses about 100,000 barbers and the chair-rental economics give masters of the craft an owner-operator path most college grads will never get.

## Why this career is AI-resilient

Cutting, blending, shaving, beard design -- physical craft on a human head. The customer relationship is the product. AI helps with bookings + marketing + content creation; chair time stays the high-margin core.

## What you actually do

Cuts (taper, fade, scissor over comb, classic), beard trim + design, hot-towel straight-razor shaves, hair-loss consultation, occasional color / camo gray. Settings: traditional barbershops, modern grooming lounges (The Art of Shaving, Hammer & Nails), franchise (Sport Clips, Floyd's), booth-rental shops, hotel + corporate accounts, personal mobile barbering.

## What you will earn

- **New licensee (commission):** $30k-$50k year 1
- **Established commission barber:** $50k-$90k
- **Booth-rental barber:** $70k-$150k+ (you keep most of every cut)
- **Shop owner:** $90k-$300k+ depending on chairs
- **Celebrity / editorial barber:** open-ended; top barbers in NYC/LA clear $300k+

## The path from high school

### Option 1 - Barber school (required in most states)
- **Length:** 1,000-1,500 instructional hours (8-15 months full-time)
- **Cost:** $5k-$20k. Federal financial aid often available.
- **What you get:** Classroom + clinic floor on paying clients + state-board exam prep.

### Option 2 - Barber apprenticeship (where allowed)
- **Length:** 1,500-3,000 supervised hours under a licensed master barber
- **Cost:** $0 -- you earn (typically tips + small wage)
- **States that allow:** varies; check your state board.

### Option 3 - Cosmetologist crossover
- **Length:** Add a barber crossover course (~300-500 hours) if you are already a cosmetologist
- **Why:** Expands your scope to straight-razor shaves and adds barbershop clientele.

## Certifications and licensing you need

- **State barber license** -- two-part exam (written + practical). Most states use the [NIC](https://www.nictesting.org/) national-board exam materials.
- **Renewal CE** -- typically every 1-2 years, varies by state.
- **Optional:** straight-razor / hot-towel shave certification (often part of barber school), Hair Loss Restoration (HRT) cert for scalp/hair-loss consulting, master barber license (additional hours + exam in some states for liquid waxing / chemical services).

## Courses to take before you commit

- Free: [360 Jeezy](https://www.youtube.com/@360Jeezy), [Vic Blends](https://www.youtube.com/@VicBlends), [Chris Bossio](https://www.youtube.com/@chrisbossio) on YouTube. The best free barber curriculum on the planet.
- Tour 3+ schools. The clinic floor is everything -- you want one with real foot traffic so you cut real heads.
- Buy a cheap mannequin head + clipper set ($150 total). Practice fades on it before school starts.
- Build an Instagram. Post your practice cuts now.

## How to land your first chair (and how hired.video helps)

Shop owners hire on portfolio + presence. Both come across instantly in a 30-second video, and not at all on paper.

Open the [Video Resume Studio](/studio) and pick the **Hook-Led** template. Show:
- **Hook:** B-roll of you finishing a fade on a client; voice-over: "Just licensed barber. Skin fade + beard work specialty. Looking for a booth at a shop that does education."
- **Middle:** 3-5 of your best cuts (Instagram-style carousel inside the video).
- **Close:** "I can demo a cut for the owner this week."

Attach to your hired.video profile alongside your IG + portfolio. Apply through [beauty + personal-care listings](/jobs?sector=beauty_personal_care). Shop owners see your craft and your tone first.

## FAQ

**Best place to start?**
A high-volume shop with a mentor master barber. The cuts-per-week number is what builds your skill. Avoid slow shops your first year.

**Booth rental when?**
After you have 80-150 regular clients of your own (typically 12-24 months in). Booth rental keeps almost 100% of your revenue but you carry your own marketing + supplies + taxes.

**How does AI affect barbering?**
Booking, retention, content creation get faster. Cutting heads does not.$body$,
  'How to become a barber out of high school -- barber school requirements, apprenticeship paths, state-board licensure, what you will earn on commission vs booth rental, and how a video reel lands a chair.',
  'Career Strategy',
  '["barber","barbering","beauty","mens-grooming","ai-resilient","new-grad","no-degree","licensed"]'::jsonb,
  'beauty_personal_care',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 11. Esthetician (beauty_personal_care) ============================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-an-esthetician',
  'So You Want to Become an Esthetician: 600-1,000 Hour Path, State License, and the Skincare Boom',
  $body$Skincare is the fastest-growing personal-care category in the U.S. Medical spas, dermatology offices, plastic-surgery practices, day spas, and standalone esthetics studios are all competing for licensed estheticians faster than the schools can graduate them. AI is not steaming a face or extracting a comedone.

This is the shortest beauty-license track in most states. 600-1,000 hours, often under a year.

## Why this career is AI-resilient

Touch + diagnostic skin analysis + product application + extraction technique = unautomatable. Skin-analysis cameras and AI tools enhance the consultation -- they do not replace the human esthetician's hands, eyes, or ability to read a client's stress reaction in real time.

## What you actually do

Facials (classic, chemical peel, hydrafacial, microdermabrasion, microcurrent, LED, dermaplaning), waxing (body + face), brow + lash services (tinting, lifts, extensions in some states), product recommendation, and client skin coaching. Master esthetician + medical esthetician roles add deeper peels, laser-adjacent work, post-procedure care.

## What you will earn

- **New licensee (commission at a spa):** $14-$22/hr + commission + tips ($30k-$50k year 1)
- **Established commission esthetician:** $45k-$70k
- **Booth-rental esthetician:** $60k-$120k+ (you control your menu + pricing)
- **Medical esthetician (med spa / dermatology):** $50k-$85k W-2 with steady volume + benefits
- **Studio owner:** $80k-$200k+ depending on chairs + retail attach rate

## The path from high school

### Option 1 - State-licensed esthetics school (required everywhere)
- **Length:** 600-1,000 hours (3-9 months full-time depending on state)
- **Cost:** $4k-$15k. Federal financial aid often available.
- **Top programs:** Aveda, Paul Mitchell, Christine Valmy, your local community college's esthetics track.

### Option 2 - Master esthetician program (some states -- WA, VA, UT, DC)
- **Length:** 1,200-1,800 hours total
- **Why:** Adds scope (chemical peels, advanced modalities, more retail medical work).

### Option 3 - Cosmetology license then crossover
- **Length:** Adds esthetician hours on top of cosmetology license
- **Why:** Maximum service-menu breadth + flexibility to switch focus.

## Certifications and licensing you need

- **State esthetician license** -- two-part exam (written + practical) via your state board, usually based on [NIC](https://www.nictesting.org/) standards.
- **Renewal CE** -- continuing education every 1-2 years.
- **Specialty certifications:**
  - Lash extensions (3-5 day course + brand certification)
  - Brow lamination + microblading (PMU / Permanent Makeup -- usually separate license)
  - Chemical peels at the legal scope of your state
  - Hydrafacial / dermaplaning / LED / microcurrent device certs
  - Medical esthetician add-on (laser hair removal, deeper peels) requires master license in some states
- **CPR + Bloodborne Pathogens** -- required at most facilities.

## Courses to take before you commit

- Free: [Lab Muffin Beauty Science](https://www.youtube.com/@LabMuffinBeautyScience) for ingredient science; [Cassandra Bankson](https://www.youtube.com/@CassandraBankson) for practical skincare technique.
- Build an Instagram with before/after photos as soon as you start practicing on classmates.
- Get a model: practice cleansing, extractions, masking technique on a willing friend; document each session.
- Tour 2-3 schools before enrolling. Visit the clinic floor. Ask about retail commission %.

## How to land your first treatment room (and how hired.video helps)

Spa owners hire estheticians on three signals: technique, presence, retail-attach. A video resume shows the first two and references the third.

Open the [Video Resume Studio](/studio) and pick the **Hook-Led** template. Show:
- **Hook:** B-roll of a facial closing shot (no faces if not consented); voice-over: "Just licensed esthetician. Acne + chemical peel focus. Looking for a treatment room at a spa with retail education."
- **Middle:** 3-4 before/after photos from school clinic; mention specific brands + modalities you are certified in.
- **Close:** "I can demo a 30-minute service for the manager this week."

Attach to your hired.video profile + Instagram + portfolio. Apply through [beauty + personal-care listings](/jobs?sector=beauty_personal_care). Spa owners see your tone + technique before they call you in.

## FAQ

**Spa vs. med spa?**
Day spa = lower base, higher tips, more service freedom. Med spa = higher base + benefits, narrower scope (often nurse-led laser work), more steady schedule.

**Booth rental when?**
Once you have 50-80 regular clients. Booth rental is the most leveraged path -- retail commission goes 100% to you and you set your prices.

**What about PMU / lash extensions?**
Both are real careers in their own right -- both require separate certifications (and in many states, separate licenses). Estheticians often stack one as a specialty.$body$,
  'How to become an esthetician out of high school -- 600-1,000 hour state-licensed schools, state-board licensure, specialty certifications (lashes, chemical peels, hydrafacial), what you will earn, and how a video reel lands a treatment room.',
  'Career Strategy',
  '["esthetician","esthetics","skincare","beauty","ai-resilient","new-grad","no-degree","licensed"]'::jsonb,
  'beauty_personal_care',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 12. Police Officer (law_enforcement) ==============================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-a-police-officer',
  'So You Want to Become a Police Officer: Academy, POST Certification, and a Sworn Career AI Cannot Touch',
  $body$Sworn law-enforcement authority is conferred on humans, by a state, after a background investigation and an academy. AI does not have arrest authority. AI does not testify in court. AI does not respond to a domestic at 3am. Departments across the U.S. are short tens of thousands of officers and most are offering hiring bonuses, take-home cars, and education benefits to recruits.

## Why this career is AI-resilient

Patrol, investigations, traffic enforcement, K9, SWAT, gang/narcotics, dignitary protection, school resource, corrections-adjacent -- all sworn roles that require statutory authority, physical presence, and judgment under uncertainty. Civilian analyst, dispatch, and records roles are partially exposed to automation but the sworn pipeline is durable.

## What you actually do

Respond to calls for service, conduct traffic stops, investigate crimes, make arrests, write reports, testify in court, maintain a beat. Specialties open up after 2-5 years of patrol: detective (property, persons, special victims, financial), K9, SWAT, traffic / DUI enforcement, narcotics, school resource officer, community policing, dignitary protection, training cadre, internal affairs.

## What you will earn

- **Academy / probationary officer:** $50k-$70k (in academy with full benefits)
- **Patrol officer (year 1-3):** $55k-$90k base, more in major metros
- **Senior patrol / detective:** $80k-$120k base
- **Sergeant / lieutenant:** $100k-$150k+
- **Federal agent (FBI, DEA, ATF, USSS):** GS-10 to GS-13 starting ($60k-$110k base + locality + LEAP +25%)
- **Overtime, court time, off-duty work, take-home car, pension** add significantly to gross compensation.

## The path from high school

### Option 1 - Apply directly to a department (recommended)
- **Length:** Application -> background -> physical -> psych -> polygraph -> academy (6-9 months) -> field training (3-6 months)
- **Cost:** $0 -- departments pay you to attend the academy.
- **Who runs it:** Your local PD / SO / state troopers + their POST-accredited academy.
- **Requirements:** HS diploma or GED (some departments require 60 college credits or 2 years military service for entry), 21+ at appointment (some states 20.5), clean background, valid driver's license, US citizen.

### Option 2 - Pre-service / open-enrollment academy
- **Length:** 6-9 months
- **Cost:** $3k-$8k (you pay)
- **Why:** Makes you POST-certified before you apply, which dramatically improves hiring odds in competitive markets (CA, FL).

### Option 3 - Military -> law enforcement
- **Length:** 4-6 years military + standard hiring pipeline
- **Why:** Most departments give preference points; some federal agencies require military / 4-year degree.

### Option 4 - 2-year criminal justice + apply
- **Length:** 2 years AAS + standard pipeline
- **Why:** Many departments give educational pay (+5-10%) for an associate degree; required at some federal agencies.

## Certifications and licensing you need

- **State POST certification** ([Peace Officer Standards and Training](https://www.iadlest.org/)) -- the universal sworn credential. Earned by completing your state's academy + passing the POST exam. Reciprocity varies by state.
- **Field Training Officer (FTO) sign-off** -- the post-academy on-the-job evaluation period (~3-6 months).
- **Specialty certifications:** SWAT / TEMS / patrol rifle / K9 handler / drone (FAA Part 107) / breath-test operator / CIT (Crisis Intervention) -- earned in service.

## Courses to take before you commit

- Free: [Office Hours with Sgt. Sean Larkin](https://www.youtube.com/@SgtSeanLarkin) and [Backup Officer](https://www.youtube.com/@BackupOfficer); your state's POST website + sample exam questions.
- Physical training: most academies require you to pass a PT standard on day one. Start running 1.5 miles and doing push-ups + sit-ups now.
- Criminal justice 101 (community college, 1 semester, ~$400) -- the curriculum mirrors academy classroom material.
- Volunteer / Explorer / Cadet program at your local department -- the highest-leverage thing you can do as a 17-19 year old.
- Clean your social media. The background check reads it.

## How to land your academy seat (and how hired.video helps)

Recruiters and background investigators hire on one signal: will this person make sound judgment calls under pressure. A video resume is one of the best instruments to show that, paired with a clean background, strong PT, and a clear "why".

Open the [Video Resume Studio](/studio) and pick the **Pivot-Led** template (it works just as well for "I am 18 and I have known I wanted this since I was 12"). Show:
- **Hook:** "I have been an Explorer with [department] for three years. I am applying for the next academy class."
- **Middle:** what you have done -- ride-alongs, criminal justice classes, military prep, PT, community volunteer work.
- **Close:** "I plan to spend my career here."

Attach the clip to your hired.video profile. Many municipal departments and academies post openings in [law-enforcement listings](/jobs?sector=law_enforcement) -- recruiters scan your bearing first.

## FAQ

**Do I need college?**
Depends. Many municipal departments hire at HS diploma + 21 with no degree. Federal agencies (FBI, DEA, ATF) typically require a 4-year degree or 3 years specialized experience.

**How risky is the job?**
Real, but statistically lower than commercial fishing, logging, or roofing. Mental-health risk (cumulative trauma, PTSD) is the bigger long-term factor; departments are getting better about it slowly.

**Best long-term track?**
Detective / investigations is the most common career pivot after patrol. Federal lateral (FBI, DEA, USSS) is the prestige move. Training cadre is the highest-impact internal role.$body$,
  'How to become a sworn police officer out of high school -- the academy + POST certification path, departmental vs pre-service academies, federal-agent tracks, what you will earn, and how a video resume strengthens your recruiter packet.',
  'Career Strategy',
  '["police-officer","law-enforcement","post","academy","ai-resilient","new-grad","no-degree","sworn"]'::jsonb,
  'law_enforcement',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 13. Corrections Officer (law_enforcement) =========================
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-a-corrections-officer',
  'So You Want to Become a Corrections Officer: Academy, State Cert, Federal Track',
  $body$Every U.S. jail, prison, and federal correctional institution runs on a corrections-officer post. Custody, security, count, transports, supervision in a population that does not want to be there. AI does not unlock cells, run inmate movement, or de-escalate a tier disturbance. Federal and state systems are hiring aggressively with signing bonuses, education benefits, and pensions.

## Why this career is AI-resilient

Custody and direct supervision are the most in-person jobs in public safety. Camera + sensor + AI surveillance augments the role; it does not replace the officer on the tier who has to maintain order, run count, manage transports, and recognize a developing problem before it becomes an incident.

## What you actually do

Run count, conduct cell + area searches, supervise meal + recreation + visitation movement, escort inmates to medical / court / programming, document incidents, complete reports, testify when needed, maintain post integrity. Specialty assignments after 2-3 years: emergency response team (CERT / SORT), K9, transport, intelligence, training, gang / STG (security threat group), industries, classification.

## What you will earn

- **County corrections officer:** $42k-$70k base + OT (often considerable) + pension
- **State corrections officer:** $48k-$80k base + OT + pension
- **Federal BOP correctional officer:** GL-5 to GL-7 start ($45k-$60k base) + locality + LEAP (25% law-enforcement availability pay) -- typically $55k-$80k total entering
- **Sergeant / Lieutenant:** $70k-$110k
- **Federal supervisory + special-investigative / SIA roles:** $90k-$130k+

## The path from high school

### Option 1 - Apply directly to a county / state / federal agency (recommended)
- **Length:** Application -> background -> medical -> psych -> academy (4-12 weeks state; 3 weeks at [FLETC Glynco](https://www.fletc.gov/) for federal) -> field training
- **Cost:** $0 -- they pay you to attend the academy.
- **Requirements:** HS diploma or GED, 18+ (federal BOP minimum 20), clean background, valid driver's license, US citizen for federal.

### Option 2 - Federal Bureau of Prisons
- **Pathway:** Apply at [usajobs.gov](https://www.usajobs.gov/) for BOP correctional officer openings. Pass background + medical + psych. 200 hours of initial training at FLETC Glynco + on-the-job institutional training.
- **Why:** Stable career, federal benefits, pension, GS scale + LEAP. One of the most accessible federal law-enforcement entry points without a degree.

### Option 3 - Criminal justice degree + apply
- **Length:** 2 years AAS / 4 years BA
- **Why:** Educational pay differential, faster promotion to sergeant / lieutenant, lateral path to probation / parole / federal investigator tracks.

## Certifications and licensing you need

- **State corrections officer certification** -- via your state academy + state exam.
- **Federal BOP credential** -- earned after FLETC + institutional training.
- **CPR / First Aid / AED** -- required.
- **Optional specialty:** CERT / SORT (emergency response), K9, hostage negotiation, intelligence / STG analyst, transport, instructor cadre.

## Courses to take before you commit

- Free: [Corrections.com](https://www.corrections.com/) news + forums; YouTube channels by current/former officers about day-to-day life inside.
- Physical training: most academies require a PT standard at day one. Run 1.5 miles + push-ups + sit-ups.
- Criminal justice 101 (community college, 1 semester, ~$400).
- Tour a county jail program if your local sheriff's office offers it.
- Clean your social media. Background investigators read it.

## How to land your job (and how hired.video helps)

Hiring managers and background investigators hire on one signal: composure under stress. A 60-second video showing your tone is one of the most efficient ways to communicate that.

Open the [Video Resume Studio](/studio) and pick the **Hook-Led** template. Show:
- **Hook:** "I am applying for the next BOP correctional-officer cohort at [institution]."
- **Middle:** what you have done -- PT, criminal justice classes, military prep, any custody-adjacent work, mental-health first aid.
- **Close:** "I am ready for FLETC."

Attach the clip to your hired.video profile and apply through [law-enforcement listings](/jobs?sector=law_enforcement). Federal + state corrections recruiters use the platform; bearing and composure are visible immediately.

## FAQ

**Is it dangerous?**
Real, but lower than the public perception. Most days are routine. The risk is concentrated in incidents -- which is exactly why composure under stress matters.

**Corrections -> patrol pathway?**
Common. Many municipal PDs and sheriff's offices give preference to current / former corrections officers, and the academies are sometimes shorter.

**Federal vs. state vs. county?**
Federal (BOP) = highest pay + benefits + retirement, more rigid mission, sometimes remote facility locations. State = best pension + steadier post assignments, mid pay. County jail = highest exposure + variety, lowest pay, but the fastest entry.$body$,
  'How to become a corrections officer out of high school -- county / state / federal BOP pathways, academy + FLETC training, what you will earn, and how a video resume strengthens your recruiter packet.',
  'Career Strategy',
  '["corrections-officer","corrections","law-enforcement","federal","bop","ai-resilient","new-grad","no-degree"]'::jsonb,
  'law_enforcement',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;

-- == 14. Firefighter (government -- see Gap Register entry) ============
INSERT INTO "articles" (
  "user_id", "slug", "title", "body_md", "summary", "category", "tags",
  "sector", "audience", "kind", "status", "published_at", "read_minutes"
) VALUES (
  (md5('editorial@hired.video'))::uuid,
  'so-you-want-to-become-a-firefighter',
  'So You Want to Become a Firefighter: Fire Academy, EMT, and Civil Service',
  $body$Structure fires. Wildland season. Hazmat. Vehicle extrication. Cardiac arrests. Water rescues. Every emergency that requires somebody to run *toward* the problem in a 70-lb turnout coat. AI does not pull a hose into a burning building. Firefighters do, and municipal departments + wildland federal agencies are short tens of thousands of recruits going into the next decade.

## Why this career is AI-resilient

Fire suppression, technical rescue, hazmat, and emergency medical response are physical, in-person, judgment-driven, and require the same person to perform under conditions that no automation can yet operate in. Drones + AI assist incident command; they do not replace the line firefighter on the nozzle.

## What you actually do

Respond to fires (structure, wildland, vehicle), EMS calls (most departments run dual-role medics, ~70-80% of calls are medical), motor-vehicle extrication, hazmat, technical rescue (rope, water, confined space, trench), fire-prevention inspections, public education, station maintenance + apparatus checks. Specialty tracks: paramedic, hazmat, technical rescue, arson investigation, training, fire prevention, command staff.

## What you will earn

- **Recruit / probationary firefighter:** $40k-$65k (in academy, with full benefits)
- **Firefighter 1-3:** $55k-$95k base + overtime + special pays
- **Fire-medic / Paramedic / Engineer:** $70k-$110k+
- **Captain:** $90k-$135k+
- **Battalion Chief:** $120k-$170k+
- **Top-step + OT** at major-metro departments routinely brings sworn firefighters above $150k W-2.
- **Federal wildland (USFS / BLM / NPS):** GS-3 to GS-6 start ($35k-$55k seasonal); permanent GS-7 to GS-11 ($55k-$95k) + hazard pay + OT during fire season.

## The path from high school

### Option 1 - Apply directly to a department (most competitive metros)
- **Length:** Civil service exam -> background -> CPAT -> oral board -> medical / psych -> academy (12-30 weeks) -> probation (12 months)
- **Cost:** $0 -- they pay you to attend the academy.
- **Requirements:** HS diploma or GED, 18+ (some departments 21+ at appointment), valid driver's license, clean background, [CPAT](https://www.cpat.org/) certification, EMT cert (most departments require it for application; some give 6-12 months after hire to obtain).

### Option 2 - Pre-service / open-enrollment fire academy
- **Length:** 12-30 weeks (community-college based)
- **Cost:** $3k-$10k
- **Why:** Most competitive markets (CA, FL, TX major metros) effectively require you to walk in with Fire Academy + EMT certs to be competitive. Some require Paramedic too.

### Option 3 - Wildland / federal entry
- **Pathway:** Apply at [usajobs.gov](https://www.usajobs.gov/) (USFS, BLM, NPS) for wildland fire crew positions (Type 2 / Type 1 hand crews, engine crews, hotshots, smokejumpers, helitack). Seasonal work + sometimes a path to permanent.
- **Why:** Fastest physical entry, builds resume + fire experience for municipal lateral.

### Option 4 - Military + apply
- **Length:** Military first, then standard pipeline. Many departments give veterans' preference points.
- **Why:** Education benefits + preference + maturity in the oral board.

## Certifications and licensing you need

- **Fire Academy completion** -- meets [NFPA 1001](https://www.nfpa.org/) Firefighter I + II standards.
- **EMT-Basic** (and increasingly Paramedic) -- required by most municipal departments.
- **CPAT** ([Candidate Physical Ability Test](https://www.cpat.org/)) -- standardized 8-event timed test; most departments require it.
- **Hazmat Awareness + Operations** (NFPA 472) -- included in academy.
- **Wildland Firefighter S-130/S-190 + L-180** -- required for federal wildland work.
- **Specialty in service:** Technical Rescue (rope, confined, trench, water), Arson Investigator, Officer Development (NFPA 1021), Driver / Engineer / Apparatus Operator.

## Courses to take before you commit

- Free: [The Fire Inside Me](https://www.youtube.com/@TheFireInsideMe) for application strategy; [STATter911](https://www.statter911.com/) for incident review; your state Fire Marshal site for academy listings.
- Physical training: start running + lifting now. CPAT is achievable for the average healthy 18-year-old but only with consistent training.
- EMT-Basic course (community college or Red Cross, 8-16 weeks, ~$1,000-$2,500). Highest-leverage single thing you can do at 18.
- Fire Explorer / Cadet program at your local department. The pipeline starts here.
- Tour 2-3 community-college fire programs in your region.

## How to land your academy seat (and how hired.video helps)

Hiring panels score recruits on three axes: physical readiness, fire-service "fit", and clarity of purpose. A video resume conveys "fit" and "purpose" more efficiently than the entire written application.

Open the [Video Resume Studio](/studio) and pick the **Pivot-Led** template (works even for a candidate who has wanted the job since age 8). Show:
- **Hook:** "I have been a fire explorer with [department] since I was 16. I have my EMT cert and my CPAT card."
- **Middle:** show your training -- runs you have done, ride-alongs, the academy classes you have taken, why you are committing your career to the fire service in *this* department.
- **Close:** "I am applying for your spring academy."

Attach to your hired.video profile and apply through [public-service listings](/jobs?sector=government). Department recruiters see your tone and presence before the oral board.

## FAQ

**Do I need to be a paramedic?**
Helps. About 70-80% of fire department calls are medical. Many competitive departments require paramedic for hire or shortly after; others sponsor your medic school once you are on payroll.

**Wildland vs. structural?**
Wildland = seasonal, outdoors, more travel, faster entry, less pay early. Structural / municipal = stable W-2 with pension, 24/48-hour shifts, much higher long-term comp. Many career firefighters do both -- wildland in college summers, then municipal full-time.

**How competitive is the academy?**
Major metros: very. 2,000+ applicants for 30-60 seats per cohort. Rural and mid-size departments: much more accessible. Your first job does not have to be your forever department -- lateral after 3 years is common.$body$,
  'How to become a firefighter out of high school -- the municipal academy + EMT path, CPAT, federal wildland entry, what you will earn, and how a video resume strengthens your oral-board packet.',
  'Career Strategy',
  '["firefighter","fire-service","emt","cpat","wildland","ai-resilient","new-grad","no-degree","public-service"]'::jsonb,
  'government',
  'job_seeker',
  'guide',
  'published',
  NOW(),
  5
)
ON CONFLICT ON CONSTRAINT "uq_articles_user_slug" DO NOTHING;
