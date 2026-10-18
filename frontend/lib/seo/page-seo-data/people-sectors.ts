/**
 * PAGE_SEO slice — screening, People Ops, bookings, events, sectors, content + gamification, interview.
 * Assembled (in order) into PAGE_SEO by lib/seo/page-seo.ts.
 */
import type { SEOData } from "../types";

export const PAGE_SEO_PEOPLE_SECTORS: Record<string, SEOData> = {
  // Candidate screening — recruiter authoring surface + the candidate-facing
  // magic-link portal (the dynamic /screening/:token route resolves to this
  // base key, same pattern as /interview).
  "/services/screening": {
    title: "Candidate Screening — hired.video",
    description:
      "Build a per-role screening checklist once — résumé, contact confirmation, validated AI assessments, competency tests, references, and application questions — then send it to candidates by magic link.",
    keywords:
      "candidate screening, hiring assessments, pre-employment screening, validated assessments, application questions, recruiter tools",
  },
  "/screening": {
    title: "Complete your application screening — hired.video",
    description:
      "Finish your application screening — confirm your details and complete any assessments the employer requested.",
    keywords: "application screening, candidate portal, hiring assessment",
  },
  // CHRO People Operations (hired-video extraction). Marketing surface +
  // the in-app roster / 1:1s pages. Pitches the paid employer suite:
  // roster, org chart, 1:1s, performance, team health — embeddable + multi-tenant.
  "/people-operations": {
    title: "People Operations: the CHRO suite for employers — hired.video",
    description:
      "Run your whole team from one place — roster & org chart, 1:1s with shared agendas and action items, performance, goals, and team health, plus video-first hiring. Multi-tenant and embeddable; a paid employer plan unlocks the full CHRO suite.",
    keywords:
      "people operations, CHRO software, HRIS, org chart software, 1 on 1 software, performance management, team health, OKR tracking, employer HR platform, embeddable HR, headcount planning",
  },
  "/people/roster": {
    title: "Corporate Roster & Org Chart — hired.video People Operations",
    description:
      "Your team directory and org chart — the single source of truth for headcount, departments, managers, and team metrics.",
    keywords: "employee roster, org chart, team directory, headcount, people operations",
  },
  "/people/one-on-ones": {
    title: "1-on-1s — hired.video People Operations",
    description:
      "A recurring 1:1 cadence with shared agendas and follow-up action items so a manager never drops a 1:1.",
    keywords: "1 on 1 meetings, 1:1 software, manager cadence, action items, people operations",
  },
  "/people/goals": {
    title: "Goals & OKRs — hired.video People Operations",
    description:
      "Track company, team, and individual OKRs with key-result progress that rolls up automatically and flags at-risk goals.",
    keywords: "OKR software, goals tracking, key results, objectives, people operations, at-risk goals",
  },
  "/bookings": {
    title: "1:1 Sessions — Bookings — hired.video",
    description:
      "Configure your bookable sessions: offerings, availability, payouts, and a public booking page your audience can use without signing up.",
    keywords: "bookings, 1:1 sessions, coaching calendar, consulting bookings",
  },
  "/book/:handle": {
    title: "Book a session — hired.video",
    description: "Pick a time on the host's public calendar. No sign-up required.",
  },
  "/book/:handle/r/:token": {
    title: "Your reservation — hired.video",
    description: "View, comment, reschedule or cancel your reservation.",
  },
  "/people": {
    // `/people` serves two audiences off one route: the consumer
    // Professional Network (warm intros, coffee chats, free DMs) and the
    // employer-side CHRO People Operations workspace. The two former
    // PAGE_SEO entries were merged here so the route ranks for both
    // networking and HRIS intent.
    title:
      "People — Professional Network — hired.video",
    description:
      "Connect with other job seekers and professionals. Ask any mutual connection for a warm intro, grab coffee, and DM anyone — no InMail credits, no paywall.",
    keywords:
      "professional networking, warm introductions, ask for an intro, coffee chats, free direct messaging, LinkedIn InMail alternative, career connections, people operations, CHRO workspace, HRIS, performance, OKRs, team health, headcount planning, PTO",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "People — hired.video",
      url: "https://hired.video/people",
      dateModified: "2026-05-31",
      description:
        "Professional networking — warm intros through mutual connections, coffee meetups, and free messaging — plus an employer People Operations workspace.",
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
    },
  },
  "/people/team-health": {
    title: "Team Health — hired.video People Operations",
    description:
      "A composite team-health score across engagement, performance, goal alignment, review health, and communication — recomputed from live data.",
    keywords: "team health score, employee engagement, people analytics, attrition risk",
  },
  "/people/tco": {
    title: "Employee TCO Calculator — hired.video People Operations",
    description:
      "Turn a salary into fully-loaded cost with your company's payroll-tax, benefits, perks, and overhead assumptions plus recruiting and training factors.",
    keywords: "employee total cost of ownership, fully loaded cost, TCO calculator, headcount cost",
  },
  // Bullhorn-class agency back-office (#1349). Pitches the workforce
  // module — placements, timesheets, invoice + payout derivation, doc
  // vault, desk margin reporting — to staffing-agency operators.
  "/for-agencies": {
    title: "For Staffing Agencies: Bullhorn-class back-office at $9.95/seat — hired.video",
    description:
      "Place candidates, capture time, approve timesheets, derive invoices, track desk margin — plus a built-in learning content library (AI, RAG, prompt engineering, must-have skills) so placed contractors can upskill on day one. Helcim push live; QuickBooks / Xero / Gusto / DocuSign ready. $9.95 per active employee — one tenth of Bullhorn / Vincere, and LinkedIn Learning is bundled-equivalent at no extra cost.",
    keywords:
      "staffing agency software, bullhorn alternative, vincere alternative, recruiting back office, contractor timesheets, placement management, desk margin reporting, agency CRM, contractor upskilling, SCORM training for contractors, LinkedIn Learning alternative for agencies",
  },
  // Help-center guide for workforce operators (#1349). Step-by-step
  // walkthrough of invite → punch → submit → approve → invoice.
  "/guides/workforce": {
    title: "Workforce & Timesheet Guide — hired.video for Agencies",
    description:
      "How to invite employees, capture time, submit + approve weekly timesheets, generate invoices, manage compliance documents, and track desk margin in hired.video's agency back-office.",
    keywords:
      "timesheet guide, contractor time tracking how-to, agency invoice workflow, recruitment back office guide, placement management tutorial",
  },
  // `/events` (discovery index) and `/map` were folded into `/tasks`
  // (see Tasks.tsx Discover surface). The legacy URLs `<Navigate>`
  // redirect to /tasks?surface=discover; SEO for the public discovery
  // landing now lives on the `/tasks` entry below. Per-event surfaces
  // (`/events/new`, `/events/:idOrSlug`, `/events/:idOrSlug/manage`)
  // keep their own SEO since they're still independent routes.
  "/events/new": {
    title: "Host an Event — Free Networking Events | hired.video",
    description:
      "Host a free networking event in minutes. Invite anyone, accept RSVPs, manage waitlists, and use AI matchmaking to introduce attendees by complementary skills.",
    keywords:
      "host event, free event hosting, meetup hosting, networking event, event management, RSVP",
  },
  "/events/:idOrSlug": {
    title: "Event — hired.video",
    description:
      "Event details, RSVP, and attendee list on hired.video — the career network with AI-matched introductions for every event.",
    keywords: "event, networking, RSVP, attendees, professional event",
  },
  "/events/:idOrSlug/manage": {
    title: "Manage event — hired.video",
    description:
      "Host tools for your event: RSVP funnel, attendee list, CSV export, host blast messaging.",
    keywords: "event host tools, manage event, RSVP analytics, attendee management",
  },
  // AI-resilient sector surfaces (gap #1165). Per the prerender.mjs "keep
  // in sync" note, these must mirror the ROUTES list there. Sector slug
  // list comes from shared/sectors.ts SECTORS.
  "/sectors": {
    title: "AI-Resilient Sectors: Browse Careers AI Can't Replace — hired.video",
    description:
      "Healthcare, skilled trades, law enforcement, beauty, government, and more — sectors built around physical work, licensure, and in-person judgement. Browse jobs, pivot guides, and resume templates by sector.",
    keywords:
      "ai resilient jobs, ai proof careers, ai resistant jobs, skilled trades, healthcare careers, law enforcement careers, government jobs",
  },
  "/sectors/healthcare": {
    title: "Healthcare & Medical Careers: AI-Resilient Jobs — hired.video",
    description:
      "Patient-facing care, licensed clinicians, EMTs, nursing, surgical tech, and allied health roles. Browse jobs, see licensure requirements, and pivot into healthcare from tech.",
    keywords: "healthcare jobs, nursing careers, ai resilient healthcare, medical careers, allied health",
  },
  "/sectors/legal": {
    title: "Legal Careers: Bar-Admitted Roles & Legal Adjacent — hired.video",
    description:
      "Litigators, court reporters, mediators, compliance officers, and title agents. Honest read on which legal roles AI is replacing vs. which remain durable.",
    keywords: "legal careers, attorney jobs, court reporter, compliance jobs, ai resilient legal",
  },
  "/sectors/government": {
    title: "Government & Public Service Careers — hired.video",
    description:
      "Federal, state, and municipal roles — inspectors, public works, cleared cyber, postal carriers, park rangers. Clearance roles remain in high demand.",
    keywords: "government jobs, federal careers, civil service, cleared jobs, ts sci clearance, public works",
  },
  "/sectors/law_enforcement": {
    title: "Law Enforcement Careers: Police, Sheriff, Federal Agents — hired.video",
    description:
      "Sworn officer paths, federal agent roles (FBI/DEA/ATF), corrections, dispatch, and specialty units. POST certification + academy pathways.",
    keywords: "law enforcement jobs, police careers, fbi careers, corrections officer, sheriff deputy",
  },
  "/security": {
    title: "Security & Trust — hired.video",
    description:
      "How hired.video protects your data: encryption in transit and at rest, passkeys/WebAuthn, OAuth, Cloudflare WAF/DDoS, granular access controls, and our compliance roadmap (SOC 2, ISO 27001).",
    keywords:
      "hired.video security, data protection, encryption, passkeys, webauthn, soc 2 roadmap, iso 27001, gdpr, trust center",
  },
  "/sectors/security": {
    title: "Security & Protective Services Careers — hired.video",
    description:
      "Armed and unarmed guards, executive protection, event security, armored transport, GSOC operators. State licensing + firearms endorsement pathways.",
    keywords: "security jobs, executive protection, armed guard, gsoc, protective services",
  },
  "/sectors/skilled_trades": {
    title: "Skilled Trades Careers: Electrician, Plumber, HVAC, Welding — hired.video",
    description:
      "Journeyman and master license pathways for the trades. Union and non-union routes, apprenticeship programs, and the strongest AI-resilient category in the labor market.",
    keywords:
      "skilled trades jobs, electrician careers, plumber jobs, hvac technician, welder, journeyman, apprenticeship, ibew",
  },
  "/sectors/beauty_personal_care": {
    title: "Beauty & Personal Care Careers: Cosmetology, Barbering, Massage — hired.video",
    description:
      "Licensed cosmetologists, barbers, estheticians, nail technicians, massage therapists, tattoo artists. Booth-rental economics + small-business pathways.",
    keywords: "cosmetology jobs, barber careers, esthetician, nail tech, massage therapist, beauty careers",
  },
  "/sectors/gig_work": {
    title: "Gig & On-Demand Work: Rideshare, Delivery, TaskRabbit — hired.video",
    description:
      "Platform-mediated physical work — rideshare, delivery, mobile services. Best fit for income bridging during pivots rather than a 20-year career.",
    keywords: "gig work, rideshare jobs, delivery driver, doordash, uber, lyft, taskrabbit",
  },
  "/sectors/politics_campaigns": {
    title: "Political Campaign & Legislative Staff Careers — hired.video",
    description:
      "Field organizers, comms directors, legislative aides, chiefs of staff, lobbyists. Cycle-driven careers with concrete entry paths from tech and analytics backgrounds.",
    keywords: "political jobs, campaign staff, legislative aide, lobbyist, field organizer",
  },
  "/sectors/politics_civic": {
    title: "Running for Office: First-Time Candidate Guide — hired.video",
    description:
      "Civic education for first-time candidates — school board, city council, state legislature. Filing rules, budget literacy, and candidate video tools.",
    keywords: "run for office, first time candidate, school board, city council, state legislature, civic engagement",
  },
  "/sectors/tech": {
    title: "Technology Careers: Software, Data, IT — hired.video",
    description:
      "Tech roles browsed on hired.video. Included so pivot-from-tech stories have a \"from\" side — many tech roles are AI-exposed today.",
    keywords: "tech jobs, software engineer, it careers, ai exposed roles",
  },
  "/pivot-explorer": {
    title: "AI-Resilient Career Pivot Explorer — hired.video",
    description:
      "Map your current skills against AI-resilient sectors. Ranks healthcare, trades, government, law enforcement, and more by transferable-skill match. Auto-populate from your resume.",
    keywords: "career pivot, ai resilient careers, leaving tech, transferable skills, pivot from coding, career change",
  },
  "/resume-templates": {
    title: "Resume Templates by Sector: Medical, Trade, Law Enforcement & More — hired.video",
    description:
      "Pick a resume template tuned for your sector. Credential-forward for licensed roles, work-product-forward for trades and beauty, story-led for portfolio careers.",
    keywords:
      "resume templates, sector resume templates, medical resume template, trade resume, law enforcement resume, video resume templates",
  },
  "/articles": {
    title: "Career Articles by Sector & Audience — hired.video",
    description:
      "Sector-specific career guides for job seekers. Filter by sector (healthcare, trades, legal, etc.) and audience (job seekers, career changers, resume guides).",
    keywords:
      "career articles, sector guides, job seeker articles, pivot guides, resume guides",
  },
  "/studio/new": {
    title: "Build Your Resume and Video Free — hired.video",
    description:
      "Upload, paste or describe yourself. Get a resume with the right structure and template, plus a video you can post to LinkedIn and YouTube. Free to start.",
    keywords: "resume builder, free resume builder, video resume, ai resume builder, resume from pdf",
  },
  "/templates": {
    title: "Free Resume & Video Templates (ATS-Readable) — hired.video",
    description:
      "Free, ATS-readable resume templates and video templates. Pick a design and your resume pours straight in. Browse by industry, preview with your own resume, and start building free.",
    keywords:
      "free resume templates, ats resume template, resume templates by industry, video resume template, resume design",
  },
  "/feed": {
    title: "Career Feed — hired.video",
    description: "Posts, video resumes and career wins from the hired.video community.",
  },
  "/points": {
    title: "Points & Rewards — hired.video",
    description: "Your points balance, streak, badges and cash-out options.",
    robots: "noindex, nofollow",
  },
  "/rewards": {
    title: "Rewards & Badges: Earn Points, Win Badges, Cash Out — hired.video",
    description:
      "Earn points for every job-hunt step — applications, resumes, AI tools, daily streaks. Trade them for AI credits, a free month of Pro, or a Tremendous gift card. See every badge you can unlock.",
    keywords:
      "job seeker rewards, gamification, earn points, badges, gift cards, ai credits, streak bonus",
  },
  "/tools/resume-roast": {
    title: "Free AI Resume Roast: Brutally Honest Feedback — hired.video",
    description:
      "Upload your resume and get brutally honest, instant AI feedback on what's working, what's weak, and exactly how to fix it. 100% free.",
    keywords:
      "free resume roast, ai resume feedback, resume critique, resume review, resume feedback ai",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Resume Roast",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web Browser",
      url: "https://hired.video/tools/resume-roast",
      dateModified: "2026-04-17",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/xyz-resume-review": {
    title: "Review Your Whole Résumé in XYZ Format — hired.video",
    description:
      "Step through every bullet and summary on your résumé and rewrite each one as Accomplished X, measured by Y, by doing Z. Accept or skip each change, then apply them all as one undo step.",
    keywords:
      "xyz resume format, google xyz formula, resume bullet rewrite, quantify resume achievements, resume review",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video XYZ Résumé Review",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web Browser",
      url: "https://hired.video/tools/xyz-resume-review",
      dateModified: "2026-10-10",
    },
  },
  "/interview": {
    title: "Free AI Interview Practice — hired.video",
    description:
      "Practice live interviews with an AI interviewer tuned to your role. Get instant feedback on your answers, tone, and pacing. Completely free.",
    keywords:
      "ai interview practice, mock interview, interview prep, behavioral interview, ai interviewer",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video AI Interview Practice",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web Browser",
      url: "https://hired.video/interview",
      dateModified: "2026-04-17",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
};
