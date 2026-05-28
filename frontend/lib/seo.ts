import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, PUBLIC_LOCALES, type Locale } from "@shared/i18n";
import { resolvePageSeoKey } from "@/lib/config/page-meta-registry";

export interface SEOData {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
  twitterSite?: string;
  twitterCreator?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  canonical?: string;
  robots?: string;
  author?: string;
  structuredData?: object;
  /** BCP47 tag for the document body's primary language. Reflected onto
   *  `<html lang>`. When omitted, the existing `<html lang>` attribute
   *  is left alone — useSEO supplies the active i18n locale by default. */
  htmlLang?: string;
}

/**
 * Organization schema used as the default structured data payload on
 * marketing pages where a more specific schema (WebApplication,
 * JobPosting, FAQPage) is not provided. Establishes the hired.video
 * brand entity for Google Knowledge Graph, Bing, and AI overviews (GEO).
 */
export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "hired.video",
  alternateName: "Hired.video",
  url: "https://hired.video",
  logo: "https://hired.video/og-image.svg",
  description:
    "hired.video is an AI-powered video resume platform that helps candidates create compelling video resumes and helps recruiters find top talent faster.",
  sameAs: [
    "https://www.linkedin.com/company/hired-video",
    "https://chromewebstore.google.com/detail/hired.video-job-seeker/ohjmknhokdkgfmgbblflmliefoegciol",
    "https://x.com/hired_video",
    "https://www.youtube.com/@hired-video",
    "https://github.com/hired-video",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "info@hired.video",
    availableLanguage: ["English", "Spanish", "French"],
  },
};

/**
 * Default SEO configuration for the application
 */
export const DEFAULT_SEO: SEOData = {
  title:
    "AI Video Resumes, Resume Builder & AI Job Search Platform — hired.video",
  description:
    "hired.video turns your resume into an AI-generated video resume in 60 seconds. Build, score, and tailor resumes for every job — and connect with recruiters through AI-powered matching.",
  keywords:
    "AI video resume, video resume maker, resume builder, AI resume scorer, AI job matching, ATS resume, recruitment platform, job search, career tools, interview practice",
  ogTitle: "AI Video Resumes & AI Job Search — hired.video",
  ogDescription:
    "Create an AI video resume in 60 seconds, tailor your resume for every job, and get matched with recruiters who are actively hiring.",
  ogImage: "https://hired.video/og-image.svg",
  ogUrl: "https://hired.video",
  twitterCard: "summary_large_image",
  twitterSite: "@hired_video",
  twitterCreator: "@hired_video",
  author: "hired.video",
  robots: "index, follow",
  structuredData: ORGANIZATION_SCHEMA,
};

/**
 * Page-specific SEO configurations
 */
export const PAGE_SEO: Record<string, SEOData> = {
  // 3D world play-invite landing (gap #1637). Token route — useSEO
  // resolves the literal path key; the loader overlays the project's
  // label as a runtime customSEO patch.
  "/play/:token": {
    title: "Join the game — hired.video",
    description: "Play a 3D world built in the hired.video studio. WASD to move, space to jump.",
  },
  "/": {
    title:
      "AI Video Resumes, Resume Builder & AI Job Search — hired.video",
    description:
      "Create an AI-generated video resume in 60 seconds, tailor your resume to every job with AI, and get matched with recruiters who are actively hiring. Free to start.",
    keywords:
      "AI video resume, video resume maker, resume builder, AI resume scorer, AI job matching, resume tailoring, career development, professional networking",
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          name: "hired.video",
          url: "https://hired.video",
          description: "AI-powered video resume platform and career tools.",
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: "https://hired.video/jobs?q={search_term_string}" },
            "query-input": "required name=search_term_string",
          },
        },
        {
          "@type": "WebApplication",
          name: "hired.video",
          description:
            "AI-powered video resume platform and AI job search tools — create video resumes, tailor your resume for any job, and match with recruiters.",
          url: "https://hired.video",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web Browser",
          dateModified: new Date().toISOString().slice(0, 10),
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.8",
            ratingCount: "1240",
          },
        },
        ORGANIZATION_SCHEMA,
        {
          "@type": "DefinedTermSet",
          name: "hired.video Career Concepts",
          hasDefinedTerm: [
            {
              "@type": "DefinedTerm",
              name: "Video Resume",
              description: "A short (30–90 second) video where a candidate introduces themselves and highlights key qualifications. Created with AI on hired.video — no camera or editing required.",
            },
            {
              "@type": "DefinedTerm",
              name: "ATS Score",
              description: "A numeric rating measuring how well a resume matches a job posting in an Applicant Tracking System. hired.video's AI Resume Scorer grades resumes across six dimensions: ATS compatibility, content quality, keyword match, formatting, and impact.",
            },
            {
              "@type": "DefinedTerm",
              name: "Job-Resume Match Score",
              description: "A percentage score quantifying the alignment between a resume and a specific job description. Measures hard skills, experience level, soft skills, and industry relevance.",
            },
            {
              "@type": "DefinedTerm",
              name: "AI Token",
              description: "The unit of AI usage on hired.video. Free users receive 50,000 tokens/month; Pro subscribers receive 1,000,000 tokens/month. Tokens power resume scoring, video generation, job matching, and all AI tools.",
            },
          ],
        },
      ],
    },
  },
  "/dashboard": {
    title: "Your Dashboard — hired.video",
    description:
      "Your unified career command center — track resumes, applications, outreach, and your professional network, and share wins with the hired.video community.",
    keywords:
      "career dashboard, job search tracker, career community, resume tracking, professional network",
  },
  "/studio": {
    // Multi-format studio per the canvas-runtime extensibility model
    // (#894 / #927 / #938) — every supported `mediaKind` belongs in
    // the keywords list so we rank for the new formats alongside the
    // legacy "video resume" queries. SEO copy mirrors the Landing's
    // "what you can make" grid (single SoT: `kind-marketing.ts`).
    title: "AI Studio for Videos, Comics, Games & Podcasts — hired.video",
    description:
      "One AI studio for every format. Turn your resume into a video pitch, a 6-page interactive comic, a podcast trailer, or a browser game — AI writes the script and renders the finished piece in 60 seconds.",
    keywords:
      "AI video resume, AI comic generator, AI podcast generator, AI game maker, video resume generator, comic resume, interactive comic, podcast trailer, browser game builder, AI studio",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "hired.video Studio",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      description:
        "AI-powered creator studio — turn any resume into a video pitch, an interactive comic, a podcast trailer, or a browser game. AI writes the script, picks the art direction, and renders the finished piece.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  },
  "/chrome-extension": {
    title: "Chrome Extensions for Job Seekers & Recruiters — hired.video",
    description:
      "Two Chrome extensions, one platform. Job seekers track jobs + score resumes + AI-tailor variations. Recruiters get Loxo-Boost-parity sourcing: profile capture with email / phone / social URL enrichment, bulk capture from search results, click-to-call (recorded VoIP), lists + call queues, outreach sequences, and a tracked-jobs tab — all for $9.95/seat/mo vs. Loxo's $169/user/mo.",
    keywords:
      "chrome extension, linkedin chrome extension, job tracker extension, resume scorer chrome, ATS chrome extension, sourcing tool, loxo alternative, loxo boost alternative, recruiter chrome extension, candidate sourcing extension, contact enrichment extension, click to call extension, recruiter VoIP, outreach sequences, talent pool extension, candidate capture",
  },
  "/affiliate-program": {
    title: "Affiliate Program: Earn 25% — hired.video",
    description:
      "Earn 25% commission on every first-month subscription you refer. Promote AI video resumes and modern career tools to your audience with transparent tracking.",
    keywords:
      "affiliate program, career affiliate, saas affiliate, resume affiliate, referral commission",
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
      "Sector-specific career guides for job seekers and recruiters. Filter by sector (healthcare, trades, legal, etc.) and audience (job seekers, recruiters, pivoters).",
    keywords: "career articles, sector guides, job seeker articles, recruiter playbooks, pivot guides",
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
  "/post-a-job": {
    title: "Post a Job for Free — hired.video",
    description:
      "Post your open role and reach candidates with AI-generated video intros. Google for Jobs indexed, structured-data ready, and free to start.",
    keywords:
      "post a job, free job posting, hire talent, post job, google for jobs",
  },
  "/login": {
    title: "Sign In — hired.video",
    description:
      "Sign in to hired.video to access your AI video resumes, resume scoring history, job matches, and career dashboard. Sign in with Google, LinkedIn, GitHub, Microsoft, or email.",
    robots: "noindex, nofollow",
  },
  "/onboarding": {
    title: "Get Started — hired.video",
    description:
      "Set up your hired.video profile in a few quick steps so the AI coach, resume scorer, and job matcher are tuned to you from day one.",
    robots: "noindex, nofollow",
  },
  "/forgot-password": {
    title: "Reset Password — hired.video",
    description: "Reset your hired.video password.",
    robots: "noindex, nofollow",
  },
  "/reset-password": {
    title: "Set New Password — hired.video",
    description: "Set a new password for your hired.video account.",
    robots: "noindex, nofollow",
  },
  "/signup": {
    title: "Sign Up Free: AI Video Resumes & Career Tools — hired.video",
    description:
      "Create your free hired.video account in under 2 minutes. Get AI resume scoring, a video resume in 60 seconds, job matching, and 10+ career tools — no credit card required.",
    keywords:
      "sign up, create account, video resume registration, free career tools, AI resume, join hired.video",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Sign Up — hired.video",
      url: "https://hired.video/signup",
      dateModified: "2026-04-17",
      description: "Create a free hired.video account. AI video resumes, resume scoring, job matching, and 10+ career tools — no credit card required.",
    },
  },
  "/pricing": {
    title: "Pricing: Plans for Job Seekers, Recruiters & Teams — hired.video",
    description:
      "Start free, upgrade when you're ready. Transparent monthly and annual plans for job seekers, recruiters, and employers — including the built-in Learning Content Library (AI, RAG, prompt engineering, must-have skills) bundled at no extra cost vs LinkedIn Learning's separately-licensed ~$379/seat/yr SKU. Cancel anytime.",
    keywords:
      "hired.video pricing, video resume pricing, resume builder cost, recruiter plan, ats pricing, annual subscription, built-in learning library pricing, LinkedIn Learning alternative pricing, SCORM courses included",
  },
  "/retained-search": {
    title: "Retained Executive Search Firm Directory · hired.video",
    description:
      "Browse leading retained executive-search firms for C-suite and board roles — global firms and specialist boutiques. Built for senior executives.",
    keywords:
      "retained executive search, executive search firms, C-suite recruiters, board search, senior executive recruiters",
  },
  "/tools/comp-analyzer": {
    title: "Executive Compensation Analyzer · hired.video",
    description:
      "Break down a total-comp offer — base, bonus, equity (vested), and sign-on — into one comparable annualized number. Built for senior executives.",
    keywords:
      "executive compensation, total comp calculator, equity vesting calculator, RSU value, offer comparison, comp analyzer",
  },
  "/for": {
    title: "Resource Maps — Find Your Path · hired.video",
    description:
      "Targeted landing pages for every situation: recent grads, job seekers, recruiters, employers, gig workers, veterans, returning workforce, layoff recovery, senior execs, and more. Same platform, different starting point.",
    keywords:
      "career resources, job search by audience, recent graduates job search, layoff recovery, returning to workforce, veterans job search, gig economy jobs, senior executive career, career change resources",
  },
  "/for/:audience": {
    title: "Resource Map · hired.video",
    description:
      "Tools, templates, articles, and jobs tailored to your moment. Pick the situation that fits and we'll show you what's built for it.",
    keywords:
      "career resources, job search resources, resume templates, video resume, job board, career articles, learning paths",
  },
  "/in/:country": {
    title: "Jobs and Career Resources by Country · hired.video",
    description:
      "Jobs, employers, relocation guides, and career resources for the country.",
    keywords: "jobs by country, international jobs, work abroad, visa sponsorship, relocation",
  },
  "/in/:country/:state": {
    title: "Jobs and Career Resources by State/Province · hired.video",
    description:
      "Jobs, employers, and career resources for the state or province.",
    keywords: "state jobs, province jobs, regional employment, local hiring",
  },
  "/in/:country/:state/:city": {
    title: "Jobs in [City] — Employers, Articles, and Career Tools · hired.video",
    description:
      "Local jobs, key employers, relocation guides, and career resources for the city.",
    keywords: "city jobs, local jobs, key employers, relocation guide, neighborhood",
  },
  "/for-recruiters": {
    title:
      "For Recruiters: AI Candidate Sourcing, Screening & Video Resumes — hired.video",
    description:
      "Source candidates from LinkedIn and Indeed, screen applicants with AI match scoring, and evaluate talent 3× faster with video resumes. Built for modern recruiters and talent teams.",
    keywords:
      "recruiter tools, ai candidate sourcing, candidate screening, applicant tracking, video resume screening, talent pool, sourcing chrome extension, ai recruiting software",
  },
  "/about": {
    title: "About: Our Mission & Team — hired.video",
    description:
      "Learn about hired.video's mission to revolutionize recruitment through AI-powered video resumes and talent matching.",
    keywords:
      "about us, company mission, video resume platform, recruitment innovation",
    structuredData: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "AboutPage",
          name: "About hired.video",
          url: "https://hired.video/about",
          dateModified: "2026-04-17",
          mainEntity: {
            "@type": "Organization",
            name: "hired.video",
            url: "https://hired.video",
            description: "AI-powered video resume platform that helps candidates create compelling video resumes and helps recruiters find top talent faster.",
            foundingDate: "2024",
            numberOfEmployees: { "@type": "QuantitativeValue", value: "10" },
          },
        },
        {
          "@type": "Person",
          name: "Sean Hogg",
          jobTitle: "Founder & CEO",
          worksFor: { "@type": "Organization", name: "hired.video" },
          url: "https://hired.video/people/seanhogg",
        },
      ],
    },
  },
  "/careers": {
    title: "Careers — hired.video",
    description:
      "Join hired.video and help revolutionize how people showcase their talents. Explore our open positions and become part of our innovative team.",
    keywords:
      "careers, jobs, hired.video, software engineer, product designer, devops, remote work, tech jobs",
    twitterDescription:
      "Join hired.video and help revolutionize how people showcase their talents. Explore our open positions.",
  },
  "/resumes": {
    title:
      "AI Video Resume Maker & Resume Builder — hired.video",
    description:
      "Create a video resume in 60 seconds with AI, or build a traditional ATS-friendly resume. Track views, tailor variations per job, and share with recruiters — all in one place.",
    keywords:
      "video resume maker, ai video resume, resume builder, ats resume, video resume template, online resume, resume with video, professional resume",
  },
  "/marketplace/templates": {
    title:
      "Resume Template Marketplace — hired.video",
    description:
      "Preview professionally designed resume templates from the hired.video Marketplace. Buy once, apply to any of your resumes, and stand out with industry-specific layouts.",
    keywords:
      "resume templates, professional resume template, ats resume template, modern resume design, resume template marketplace, buy resume template, industry resume templates, finance resume template, executive resume template",
    ogTitle: "Resume Template Marketplace — hired.video",
    ogDescription:
      "Browse, preview, and buy professionally designed resume templates. Apply to your resume in one click — creators earn 95%.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "hired.video Resume Template Marketplace",
      url: "https://hired.video/search?category=templates",
      description:
        "Marketplace of professionally designed, ATS-friendly resume templates. Preview each template against the showcase resume or your own, and unlock once to apply across all your resumes.",
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
    },
  },
  "/jobs": {
    title: "Job Search: AI Job Matching — hired.video",
    description:
      "Find your dream job with AI-powered matching. Browse thousands of opportunities and apply with your video resume.",
    keywords:
      "job search, career opportunities, employment, job listings, AI job matching",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Job Listings — hired.video",
      url: "https://hired.video/jobs",
      dateModified: "2026-04-17",
      description: "Browse job listings with AI-powered match scoring. Apply with your video resume and get matched with recruiters who are actively hiring.",
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
    },
  },
  "/companies": {
    title: "Companies Hiring — hired.video",
    description:
      "Discover top companies hiring through video resumes. Connect with innovative employers and explore career opportunities.",
    keywords:
      "companies, employers, hiring companies, career opportunities, company profiles",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Companies — hired.video",
      url: "https://hired.video/companies",
      dateModified: "2026-04-17",
      description: "Discover companies hiring through hired.video. Browse employer profiles, open roles, and company culture.",
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
    },
  },
  "/people/scorecards": {
    title:
      "Scorecards, Interview Kits, Calibration & Bias Linter — Structured Hiring on hired.video",
    description:
      "Run Greenhouse-grade structured interviews on hired.video: reusable scorecard templates, interview kits, calibration sessions, blind review, AI bias linter, take-home assignments, competency framework, interviewer reliability tracking, and AI question generation — all in one workspace.",
    keywords:
      "structured interview, interview scorecard, scorecard template, interview kit, calibration session, blind interview review, hiring bias linter, take-home assignment, competency framework, interviewer reliability, AI interview questions, hiring panel, hire faster, Greenhouse alternative, Lever alternative, Ashby alternative",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Scorecards & Interview Kits — hired.video",
      url: "https://hired.video/people/scorecards",
      dateModified: "2026-05-26",
      description:
        "Structured-hiring scorecards, multi-evaluator debriefs, interview kits, calibration sessions, blind review, bias linter, take-home assignments, and AI question generation.",
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
    },
  },
  "/people": {
    title: "Professional Network — Warm Intros, Coffee Chats & Direct Messaging — hired.video",
    description:
      "Connect with professionals, recruiters, and industry leaders. Ask any mutual connection for a warm intro, grab coffee with someone open to it, and DM anyone — no InMail credits, no paywall. Build your network and advance your career.",
    keywords:
      "professional networking, warm introductions, ask for an intro, coffee chats, networking events, free direct messaging, LinkedIn InMail alternative, career connections, industry professionals, networking platform",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Professional Network — hired.video",
      url: "https://hired.video/people",
      dateModified: "2026-05-26",
      description:
        "Connect with professionals on hired.video — request warm intros through mutual connections, schedule coffee meetups, and message any user for free.",
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
    },
  },
  "/tasks": {
    // `/tasks` hosts four surfaces — Tasks, My events & coffee, Warm intros,
    // and Discover (events grid + map). Discover is the unauth default, so
    // SEO has to read as a public event-discovery landing first, with
    // task-management + networking commitments as secondary signals.
    title: "Career Events, Coffee Meetups, Warm Intros & Task Hub — hired.video",
    description:
      "Find networking events near you on the map, RSVP to meetups and workshops, accept coffee invites, forward warm intros to your network, and organize your job search with built-in task management. Hosting events is free for everyone.",
    keywords:
      "career events, networking events, events near me, warm introductions, get introduced, coffee chats, professional meetups, career map, AI matchmaking, task management, job search organization, productivity tools",
  },
  "/outreach": {
    title: "Professional Outreach — hired.video",
    description:
      "Manage your professional communications and networking outreach. Build relationships that advance your career.",
    keywords:
      "professional outreach, networking, communication tools, relationship building",
  },
  "/account": {
    title: "Account Management — hired.video",
    description:
      "Manage your account settings, team members, and organization preferences. Complete control over your hired.video experience.",
    robots: "noindex, nofollow",
  },
  "/settings": {
    title: "Settings — hired.video",
    description:
      "Customize your hired.video experience. Manage privacy, notifications, and account preferences.",
    robots: "noindex, nofollow",
  },
  "/privacy-policy": {
    title: "Privacy Policy — hired.video",
    description:
      "Learn how hired.video protects your data and respects your privacy. Review our policies and your rights.",
    keywords:
      "privacy policy, data protection, GDPR compliance, user privacy, data security",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Privacy Policy — hired.video",
      url: "https://hired.video/privacy-policy",
      dateModified: "2026-04-17",
      inLanguage: "en",
      mainEntity: {
        "@type": "DigitalDocument",
        name: "hired.video Privacy Policy",
        creator: { "@type": "Organization", name: "hired.video" },
        inLanguage: "en",
        lastReviewed: "2026-04-17",
      },
    },
  },
  "/terms-of-service": {
    title: "Terms of Service — hired.video",
    description:
      "Understand your rights and responsibilities when using hired.video. Review our platform terms and conditions.",
    keywords: "terms of service, user agreement, legal terms, platform rules",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Terms of Service — hired.video",
      url: "https://hired.video/terms-of-service",
      dateModified: "2026-04-17",
      inLanguage: "en",
      mainEntity: {
        "@type": "DigitalDocument",
        name: "hired.video Terms of Service",
        creator: { "@type": "Organization", name: "hired.video" },
        inLanguage: "en",
        lastReviewed: "2026-04-17",
      },
    },
  },
  "/help": {
    title: "Help & Support — hired.video",
    description:
      "Find answers, browse guides, and contact support to get the most from hired.video.",
    keywords: "help, support, FAQ, user guide, customer service",
  },
  "/guides/getting-started": {
    title: "Getting Started Guide — hired.video",
    description:
      "Step-by-step guide to creating your account, profile, resume, and first video resume on hired.video.",
    keywords: "getting started, setup guide, video resume tutorial, profile setup",
  },
  "/guides/video-best-practices": {
    title: "Video Resume Best Practices — hired.video",
    description:
      "Tips for creating compelling video resumes: lighting, audio, scripting, body language, and AI tools.",
    keywords: "video resume tips, best practices, recording tips, video interview",
  },
  "/guides/networking": {
    title: "Networking Tips — hired.video",
    description:
      "Build professional connections on hired.video. Tips for messaging, engagement, and outreach.",
    keywords: "networking tips, professional connections, outreach, messaging",
  },
  "/guides/job-search": {
    title: "Job Search Strategies — hired.video",
    description:
      "Proven job search strategies using hired.video tools: resume optimization, job alerts, AI coaching.",
    keywords: "job search, job hunting, career strategy, resume optimization, interview prep",
  },
  "/guides/tutorials": {
    title: "Video Tutorials — hired.video",
    description:
      "Watch step-by-step video tutorials to master hired.video features and tools.",
    keywords: "tutorials, video guides, how-to, learn hired.video",
  },
  "/tools": {
    title: "Tools & Learning: AI Career Tools + Built-in SCORM Learning Library — hired.video",
    description:
      "Free AI career tools from hired.video — resume scorer, ATS optimizer, salary calculator, interview practice, and a built-in learning content library (AI, RAG, prompt engineering, must-have skills) with SCORM 1.2 + xAPI + HMAC-signed verifiable certificates. No separate license required.",
    keywords:
      "AI career tools, AI resume scorer, resume optimizer, ATS resume checker, salary calculator, job match, value proposition, free career tools, AI job search, built-in learning content library, SCORM 1.2 player, xAPI LRS, AI courses, RAG course, prompt engineering course, must-have AI skills",
    ogTitle: "Tools & Learning — hired.video",
    ogDescription:
      "Score and optimize your resume with AI, then upskill in the built-in learning library (AI, RAG, prompt engineering). Bundled — no separate license needed.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "hired.video Tools & Learning",
      url: "https://hired.video/tools",
      description:
        "AI-powered career tools (resume scoring, ATS optimization, salary analysis, job-resume matching) plus a built-in learning content library covering AI fundamentals, Retrieval-Augmented Generation, prompt engineering, and the AI-era must-have skills.",
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
    },
  },
  "/learning": {
    title: "Built-in Learning Content Library — AI, RAG, Must-Have Skills (No Separate License) — hired.video",
    description:
      "Platform-seeded SCORM 1.2 courses on AI fundamentals, Retrieval-Augmented Generation, prompt engineering, AI-era must-have skills, and building with the Claude API. Bundled with every plan — LinkedIn Learning is a separate ~$379/seat/yr SKU; ours is included. HMAC-signed verifiable certificates issue on course pass.",
    keywords:
      "built-in learning library, SCORM 1.2 courses, xAPI LRS, AI fundamentals course, RAG course, prompt engineering course, must-have AI skills, Claude API course, LinkedIn Learning alternative, employer training authoring, verifiable certificate",
    ogTitle: "Built-in Learning Content Library — hired.video",
    ogDescription:
      "SCORM-tracked AI, RAG, prompt-engineering and must-have-skills courses bundled with every plan. Verified certificates issue on course pass.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "hired.video Learning Content Library",
      url: "https://hired.video/learning",
      description:
        "Platform-authored SCORM 1.2 courses on AI fundamentals, Retrieval-Augmented Generation, prompt engineering, the AI-era must-have skills, and building with the Claude API. Bundled with every plan — no separate license required.",
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
    },
  },
  "/courses/review-queue": {
    title: "Course Review Queue — hired.video",
    description:
      "Reviewer inbox for course submissions. SuperAdmins and assigned reviewers see every course currently in_review, with deep-links into the threaded review surface.",
    keywords:
      "course review queue, course moderation, learning content review, in_review courses, reviewer inbox",
    ogTitle: "Course Review Queue — hired.video",
    ogDescription:
      "Reviewer inbox for courses awaiting approval — open one to leave threaded comments or approve.",
    ogImage: "https://hired.video/og-image.svg",
    robots: "noindex, nofollow",
  },
  "/verify": {
    title: "Verify Certificate — hired.video",
    description:
      "Verify a hired.video learning certificate. HMAC-signed, tamper-evident, course-pass-issued. Paste a cert number or open a share link to confirm authenticity.",
    keywords:
      "certificate verification, verify hired.video certificate, HMAC-signed certificate, course completion certificate, training certificate verification",
    ogTitle: "Verify Certificate — hired.video",
    ogDescription:
      "HMAC-signed, course-pass-issued certificates — paste a cert number to verify.",
    ogImage: "https://hired.video/og-image.svg",
  },
  "/tools/ai-resume-scorer": {
    title: "AI Resume Scorer: Free ATS Resume Grader — hired.video",
    description:
      "Grade your resume in seconds with our free AI resume scorer. Get an ATS-compatibility score, keyword match, content-quality rating, and targeted recommendations to land more interviews.",
    keywords:
      "AI resume scorer, resume grader, ATS score, resume checker, resume grade, resume quality score, free resume review, AI resume review",
    ogTitle: "AI Resume Scorer — free ATS-ready resume grading",
    ogDescription:
      "Paste your resume. Get a score, a grade, and specific fixes — powered by AI, free to try.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video AI Resume Scorer",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/ai-resume-scorer",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/resume-optimizer": {
    title: "Resume Optimizer: AI ATS Keyword Matcher — hired.video",
    description:
      "Optimize your resume for ATS and any target job in seconds. Our AI resume optimizer mirrors job-description keywords, suggests rewrites, and boosts your match rate.",
    keywords:
      "resume optimizer, ATS optimizer, resume keyword match, AI resume rewrite, tailor resume to job, ATS-friendly resume, resume keywords",
    ogTitle: "AI Resume Optimizer — tailor your resume to any job",
    ogDescription:
      "Paste a resume and a job description. Get an ATS-optimized draft with the right keywords.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Resume Optimizer",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/resume-optimizer",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/salary-calculator": {
    title: "Salary Calculator: AI Compensation Benchmarks — hired.video",
    description:
      "Know your market rate. Our AI salary calculator estimates fair compensation by title, years of experience, location, and industry — with percentile ranges and negotiation tips.",
    keywords:
      "salary calculator, compensation calculator, market salary, pay range, salary benchmark, salary negotiation, what am I worth, salary by experience, salary by location",
    ogTitle: "Salary Calculator — know your market rate",
    ogDescription:
      "Estimate fair compensation by role, experience, and location. Includes p10–p90 percentile bands.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Salary Calculator",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/salary-calculator",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/job-resume-match": {
    title: "Job-Resume Match: AI Fit Score for Any Role — hired.video",
    description:
      "See how well your resume fits any job in seconds. Our AI match tool scores alignment, highlights missing skills, and tells you what to add before you apply.",
    keywords:
      "job resume match, job fit score, resume match score, AI job matching, resume vs job description, skill gap analysis, resume job compatibility",
    ogTitle: "Job-Resume Match — AI fit score for any job",
    ogDescription:
      "Upload a job. Pick a resume. Get a match score plus the specific gaps you need to close.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Job-Resume Match",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/job-resume-match",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/summarize-resume": {
    title: "AI Resume Summarizer: Professional Summaries in Seconds — hired.video",
    description:
      "Turn your resume into a sharp, hireable professional summary with AI. Perfect for LinkedIn, cover letters, and profile bios — generated in seconds, tailored to your target role.",
    keywords:
      "resume summarizer, professional summary generator, AI resume summary, LinkedIn summary, about me generator, career summary, resume intro generator",
    ogTitle: "AI Resume Summarizer — professional summaries in seconds",
    ogDescription:
      "Paste your resume. Get a concise, role-ready summary for LinkedIn, cover letters, and profiles.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Resume Summarizer",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/summarize-resume",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/sentiment-analysis": {
    title: "Resume Sentiment Analysis: AI Tone Checker — hired.video",
    description:
      "Check the tone and confidence of your resume with AI. Our sentiment analysis tool flags passive language, weak phrasing, and opportunities to sound more assertive.",
    keywords:
      "resume sentiment analysis, resume tone checker, AI resume tone, confident resume language, resume wording analysis, action verb checker",
    ogTitle: "Resume Sentiment Analysis — AI tone checker",
    ogDescription:
      "Upload your resume and see how confident, assertive, and impact-driven its language reads.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Resume Sentiment Analysis",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/sentiment-analysis",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/value-proposition": {
    title: "AI Value Proposition Builder: Elevator Pitch Generator — hired.video",
    description:
      "Build a compelling value proposition tailored to your target role. AI combines your resume, the job description, and the company's mission into a personal pitch that wins interviews.",
    keywords:
      "value proposition generator, elevator pitch builder, personal brand statement, AI cover letter, career pitch, unique value proposition, job application pitch",
    ogTitle: "AI Value Proposition Builder — personal pitch in seconds",
    ogDescription:
      "Combine your resume, the job, and the company's mission into a value prop that gets noticed.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Value Proposition Builder",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/value-proposition",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/pdf-to-json": {
    title: "Resume PDF to JSON Converter: AI Resume Parser — hired.video",
    description:
      "Convert any resume PDF to structured JSON. Our AI parser extracts basics, work history, skills, and education in seconds — ideal for builders, ATSes, and data pipelines.",
    keywords:
      "pdf to json, resume parser, AI resume extraction, json resume, resume data extraction, pdf resume converter, structured resume",
    ogTitle: "Resume PDF to JSON — AI parser",
    ogDescription:
      "Drop a PDF. Get clean, structured JSON — schema-compatible and ready to index.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video PDF-to-JSON Resume Parser",
      applicationCategory: "DeveloperApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/pdf-to-json",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/resume-consolidator": {
    title: "Resume Consolidator: Merge Multiple Resumes — hired.video",
    description:
      "Have three resumes? Merge them into one master resume with AI. Dedupes work history, consolidates skills, and preserves every highlight you've ever written.",
    keywords:
      "resume consolidator, merge resumes, combine resumes, master resume, AI resume merge, dedupe resume, resume deduplication",
    ogTitle: "Resume Consolidator — merge multiple resumes into one",
    ogDescription:
      "AI merges your resumes into a single master resume without losing a single highlight.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Resume Consolidator",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/resume-consolidator",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/auto-fill": {
    title: "Application Autofill: AI Job Application Form Filler — hired.video",
    description:
      "Fill any job application form in seconds. AI generates answers from your profile and resume for Greenhouse, Lever, Workday, Ashby, and any custom application form.",
    keywords:
      "job application autofill, application form filler, AI application answers, auto-apply, greenhouse autofill, lever autofill, workday autofill, job application AI",
    ogTitle: "Application Autofill — AI fills any job application",
    ogDescription:
      "Paste an application URL or the questions. AI generates accurate answers using your profile and resume. Works with every major ATS.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Application Autofill",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/auto-fill",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/predictive-assessments": {
    title: "Predictive Assessments (Big Five, Cognitive, EQ, DISC) — hired.video",
    description:
      "Validated-inspired psychometric assessments: Big Five personality, cognitive ability, situational judgment, EQ, and DISC. Free Big Five + cognitive sample; Pro unlocks the full battery and resume → predictive-index match.",
    keywords:
      "predictive assessments, big five personality test, IPIP, cognitive ability test, situational judgment test, EQ assessment, DISC profile, HireVue alternative, Predictive Index alternative, resume role match",
    ogTitle: "Predictive Assessments — Big Five, Cognitive, EQ, DISC",
    ogDescription:
      "Take the free Big Five + cognitive sample in 8 minutes. Pro unlocks SJT, EQ, DISC, and a resume → predictive-index match — with calibrated percentile bands once the platform's norms cache has the sample.",
    ogImage: "https://hired.video/og-image.svg",
    canonical: "https://hired.video/tools/predictive-assessments",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Predictive Assessments",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/predictive-assessments",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/employer-research": {
    title: "Employer Research: Reviews + Role × City Salary in 10 Minutes — hired.video",
    description:
      "Pressure-test a company and an offer in 10 minutes. Multi-axis employee reviews — culture, leadership, work-life balance, compensation, growth, diversity — alongside role × city salary data from active listings. Free, no signup required.",
    keywords:
      "employer research, company reviews, glassdoor alternative, multi-axis ratings, salary by city, before you accept an offer, salary negotiation, company culture research, role × city salary",
    ogTitle: "Employer Research — reviews + role × city salary, side by side",
    ogDescription:
      "Run a 10-minute pre-offer audit. Reviews + role × city salary in one tool — pressure-test before you sign.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Employer Research",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/employer-research",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/skill-extractor": {
    title: "Skill Extractor: AI Skill Parser for Resumes & Job Posts — hired.video",
    description:
      "Pull every skill from a job description or resume in seconds. Free AI skill extractor — grouped, deduplicated, and categorized so you can compare candidate-to-role coverage at a glance.",
    keywords:
      "skill extractor, AI skill parser, resume skill extraction, job description parser, skill taxonomy, skill gap analysis, resume keyword finder",
    ogTitle: "Skill Extractor — pull every skill from a resume or job",
    ogDescription:
      "Paste a resume or job description. Get a deduplicated, categorised skill list — free, no signup required.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Skill Extractor",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/skill-extractor",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/vendor-sync": {
    title: "LinkedIn & Profile Sync: One Master Resume, Every Vendor — hired.video",
    description:
      "Keep your LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, Wellfound, Dice, and GitHub profiles aligned with one master resume. Chrome extension extracts profile edits, merges them into your master, and auto-fills Headline + Summary back into supported vendor editors. Track which variant landed where.",
    keywords:
      "linkedin profile sync, resume sync, profile updater, linkedin auto-fill, profile copilot, indeed profile sync, glassdoor profile sync, ziprecruiter sync, monster profile sync, github profile sync, wellfound sync, dice profile sync",
    ogTitle: "LinkedIn & Profile Sync — one master resume, every job-board profile",
    ogDescription:
      "Render paste-ready blocks for 9 vendors; extract profile edits back via the Chrome extension on 8 of them; auto-fill Headline + Summary on LinkedIn / Indeed / Glassdoor / ZipRecruiter / Wellfound / Dice / Monster.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video LinkedIn & Profile Sync",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/vendor-sync",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/interview-templates": {
    title: "Interview Templates: Reusable Async Video Screening Sets — hired.video",
    description:
      "Build interview question sets once, attach to any job posting. Every applicant gets the same screening interview — AI-scored, proctored, decision-ready. Out-perform HireVue and VidCruiter on a free tier.",
    keywords:
      "interview templates, async video interview, screening interview, HireVue alternative, VidCruiter alternative, AI interview scoring, structured interview questions",
    ogTitle: "Interview Templates — reusable async video screening for every job",
    ogDescription:
      "Author once, attach to any job, AI-score every answer. Free.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Interview Templates",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/interview-templates",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/video-pitch-lab": {
    title: "Video Pitch Lab: 60-Second AI-Coached Elevator Pitch — hired.video",
    description:
      "Workshop the elevator pitch every recruiter asks for. AI drafts a script from your resume, you record with a teleprompter + prep timer, then paste the URL into any application. Free.",
    keywords:
      "video pitch, elevator pitch, video resume, tell me about yourself video, AI pitch script, candidate video introduction",
    ogTitle: "Video Pitch Lab — record the perfect 60-second elevator pitch",
    ogDescription:
      "AI script, teleprompter, prep timer, retake — one portable pitch URL for every job.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Video Pitch Lab",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/video-pitch-lab",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/career-360": {
    title: "Career 360: AI Career Planner with Gap Analysis & Roadmap — hired.video",
    description:
      "Pick the role you want next. Career 360 reads your profile, scores eight recruiter signals, and builds a 30/60/90/180-day roadmap to close every gap. Free AI career planning.",
    keywords:
      "career planner, AI career roadmap, career gap analysis, career goals, career path planning, skill gap analysis, career development plan, AI career coach",
    ogTitle: "Career 360 — AI career planner, gap analysis, and roadmap",
    ogDescription:
      "Pick where you want to go. We'll show the gaps and the plan to get there — and track every score as you close them.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Career 360",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/career-360",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/tools/resume-tailor": {
    title: "Resume Tailor: AI Custom Resume for Every Job — hired.video",
    description:
      "Tailor your resume to any job in seconds. AI rewrites your bullets, rearranges sections, and injects the right keywords — all while keeping your voice and facts intact.",
    keywords:
      "resume tailor, customize resume for job, tailor resume to job description, AI resume customization, per-job resume, resume variants",
    ogTitle: "Resume Tailor — AI custom resume for every job",
    ogDescription:
      "Upload your resume and a job. Get a tailored version that matches the role without making things up.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video Resume Tailor",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      url: "https://hired.video/tools/resume-tailor",
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    },
  },
  "/contact": {
    title: "Contact Us — hired.video",
    description:
      "Get in touch with hired.video support. We're here to help you succeed in your career journey.",
    keywords:
      "contact us, customer support, help, video resume support, career assistance, hired.video contact",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "ContactPage",
      name: "Contact hired.video",
      description:
        "Contact page for hired.video - AI-powered video resume platform",
      url: "https://hired.video/contact",
      mainEntity: {
        "@type": "Organization",
        name: "hired.video",
        email: "info@hired.video",
        url: "https://hired.video",
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer service",
          email: "info@hired.video",
          availableLanguage: "English",
        },
      },
    },
  },
  "/blog": {
    title: "Career Guides & AI Tool Tutorials — hired.video",
    description:
      "Actionable guides to help you score, optimize, and tailor your resume, land more interviews, and negotiate the salary you deserve. Powered by hired.video's free AI career tools.",
    keywords:
      "resume tips, career advice, AI resume tools, interview preparation, salary negotiation, video resume guide, ATS tips, job search strategy",
    ogTitle: "Career Guides & AI Tool Tutorials — hired.video",
    ogDescription:
      "Free guides on resume scoring, ATS optimization, salary negotiation, interview prep, and video resumes.",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "hired.video Blog",
      url: "https://hired.video/blog",
      description:
        "Career guides and AI tool tutorials from hired.video — the AI-powered video resume and career tools platform.",
      publisher: {
        "@type": "Organization",
        name: "hired.video",
        url: "https://hired.video",
      },
    },
  },

};

// Canonical origin (prefer apex domain over www)
const CANONICAL_ORIGIN = "https://hired.video";

// Map legacy/duplicate routes to canonical equivalents. The tools are
// registered at both PascalCase (/Tools/AIResumeScorer) and kebab-case
// (/tools/ai-resume-scorer) paths — kebab-case is canonical for SEO so
// every PascalCase variant is aliased here. Keep this in sync with
// App.tsx's route table when new tools are added.
export function canonicalizePath(pathname: string): string {
  const p = pathname || "/";
  const aliasMap: Record<string, string> = {
    "/Tools/AIResumeScorer": "/tools/ai-resume-scorer",
    "/Tools/ResumeOptimizer": "/tools/resume-optimizer",
    "/Tools/SalaryCalculator": "/tools/salary-calculator",
    "/Tools/SentimentAnalysis": "/tools/sentiment-analysis",
    "/Tools/JobResumeMatch": "/tools/job-resume-match",
    "/Tools/SummarizeResume": "/tools/summarize-resume",
    "/Tools/ValueProposition": "/tools/value-proposition",
    "/Tools/pdftojson": "/tools/pdf-to-json",
    "/Tools/PdfToJson": "/tools/pdf-to-json",
    "/Tools/ResumeConsolidator": "/tools/resume-consolidator",
    "/Tools/ResumeTailor": "/tools/resume-tailor",
    "/Tools/AutoFill": "/tools/auto-fill",
    "/tools/form-autofill": "/tools/auto-fill",
    "/tools/autofill": "/tools/auto-fill",
    "/resume-roast": "/tools/resume-roast",
    "/privacy": "/privacy-policy",
    "/terms": "/terms-of-service",
    // Legacy discovery URLs consolidated into /tasks Discover surface.
    "/events": "/tasks",
    "/map": "/tasks",
  };

  if (aliasMap[p]) return aliasMap[p];
  if (p.startsWith("/resume/")) return "/resumes/" + p.slice("/resume/".length);
  if (p.startsWith("/Tools/")) return p.replace(/^\/Tools\//, "/tools/");
  return p;
}


/**
 * Update document meta tags
 */
export function updateMetaTags(seoData: SEOData): void {
  // Update title
  if (seoData.title) {
    document.title = seoData.title;
  }

  // Helper function to update or create meta tag
  const updateMetaTag = (name: string, content: string, property = false) => {
    const attribute = property ? "property" : "name";
    let meta = document.querySelector(`meta[${attribute}="${name}"]`);

    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute(attribute, name);
      document.head.appendChild(meta);
    }

    meta.setAttribute("content", content);
  };

  // Update meta tags
  if (seoData.description) updateMetaTag("description", seoData.description);
  if (seoData.keywords) updateMetaTag("keywords", seoData.keywords);
  if (seoData.author) updateMetaTag("author", seoData.author);
  if (seoData.robots) updateMetaTag("robots", seoData.robots);

  // Update Open Graph tags
  if (seoData.ogTitle) updateMetaTag("og:title", seoData.ogTitle, true);
  if (seoData.ogDescription)
    updateMetaTag("og:description", seoData.ogDescription, true);
  if (seoData.ogImage) updateMetaTag("og:image", seoData.ogImage, true);
  if (seoData.ogUrl) updateMetaTag("og:url", seoData.ogUrl, true);
  updateMetaTag("og:type", "website", true);

  // Update Twitter Card tags
  if (seoData.twitterCard) updateMetaTag("twitter:card", seoData.twitterCard);
  if (seoData.twitterSite) updateMetaTag("twitter:site", seoData.twitterSite);
  if (seoData.twitterCreator)
    updateMetaTag("twitter:creator", seoData.twitterCreator);
  if (seoData.twitterTitle)
    updateMetaTag("twitter:title", seoData.twitterTitle);
  if (seoData.twitterDescription)
    updateMetaTag("twitter:description", seoData.twitterDescription);
  if (seoData.twitterImage)
    updateMetaTag("twitter:image", seoData.twitterImage);

  // Update canonical URL
  if (seoData.canonical) {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", seoData.canonical);
  }

  // Inject hreflang alternate links. Each supported locale gets its own
  // <link rel="alternate" hreflang="X" href="...?lang=X"> plus one
  // `x-default` pointing at the bare URL (which the cookie/detector
  // resolves to the visitor's preferred locale). This is the signal
  // Google Search uses to surface the right language version per user
  // — without it, Mexican / Quebec Google never sees the localized
  // catalogue and only indexes the en variant.
  //
  // We use ?lang= query strings instead of /es/* /fr-CA/* path prefixes
  // because the SPA routes are flat and the i18n bootstrap already
  // honours ?lang= (see frontend/lib/i18n/i18n.ts). Each locale variant
  // is a separately-indexable URL with the same content surface.
  if (seoData.canonical) {
    // Wipe any prior hreflang links so navigating from /pricing to /jobs
    // doesn't leak stale alternates.
    document
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .forEach((el) => el.remove());

    const baseUrl = seoData.canonical.split("?")[0];
    const addAlternate = (hreflang: string, href: string) => {
      const link = document.createElement("link");
      link.setAttribute("rel", "alternate");
      link.setAttribute("hreflang", hreflang);
      link.setAttribute("href", href);
      document.head.appendChild(link);
    };

    addAlternate("x-default", baseUrl);
    for (const loc of PUBLIC_LOCALES) {
      const href = loc === DEFAULT_LOCALE ? baseUrl : `${baseUrl}?lang=${loc}`;
      addAlternate(loc, href);
    }
  }

  // Reflect the active UI locale on <html lang> so screen readers and
  // crawlers know which language the body renders in. Falls back to the
  // page's existing attribute if no locale was supplied.
  if (seoData.htmlLang) {
    document.documentElement.setAttribute("lang", seoData.htmlLang);
  }

  // Add structured data
  if (seoData.structuredData) {
    // Remove existing structured data
    const existingScript = document.querySelector(
      'script[type="application/ld+json"]',
    );
    if (existingScript) {
      existingScript.remove();
    }

    // Add new structured data
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(seoData.structuredData);
    document.head.appendChild(script);
  }
}

/**
 * React hook for managing SEO.
 *
 * Locale-aware: the active i18n locale is reflected onto `<html lang>`,
 * baked into the canonical / og:url (`?lang=es` for non-default
 * locales), and used to look up `seo.<path>.title` / `seo.<path>.description`
 * catalogue keys that override the static English PAGE_SEO entries when
 * present. hreflang alternates are emitted unconditionally — the
 * non-English URL variants are always advertised to crawlers.
 */
export function useSEO(pathname: string, customSEO?: Partial<SEOData>): void {
  const { i18n, t } = useTranslation();
  const activeLocale = (PUBLIC_LOCALES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Locale)
    : DEFAULT_LOCALE;

  useEffect(() => {
    // Canonicalize route path and normalize origin
    const canonicalPath = canonicalizePath(pathname);

    // Resolve the effective SEO key. An exact PAGE_SEO entry wins; if
    // there isn't one (dynamic / detail routes like /studio/editor/:id,
    // /jobs/:id, /articles/:slug), fall back to the parent surface's key
    // declared in the page-meta registry so the route inherits real
    // title / description / structured data instead of generic
    // DEFAULT_SEO (gap #1622). PAGE_SEO stays the single SEO store.
    const fallbackKey = resolvePageSeoKey(pathname);
    const effectiveSeoKey = PAGE_SEO[canonicalPath]
      ? canonicalPath
      : fallbackKey && PAGE_SEO[fallbackKey]
        ? fallbackKey
        : canonicalPath;

    // Get page-specific SEO or use defaults
    const pageSEO = PAGE_SEO[effectiveSeoKey] || {};

    // Merge default, page-specific, and custom SEO data
    const seoData: SEOData = {
      ...DEFAULT_SEO,
      ...pageSEO,
      ...customSEO,
    };

    // Build canonical + og:url. Non-default locales get a `?lang=X`
    // canonical so each language variant is a separately indexable URL.
    const baseUrl = `${CANONICAL_ORIGIN}${canonicalPath}`;
    const localizedUrl =
      activeLocale === DEFAULT_LOCALE ? baseUrl : `${baseUrl}?lang=${activeLocale}`;
    if (!seoData.canonical) {
      seoData.canonical = localizedUrl;
    }
    if (!seoData.ogUrl) {
      seoData.ogUrl = localizedUrl;
    }
    if (!seoData.htmlLang) {
      seoData.htmlLang = activeLocale;
    }

    // Locale-aware title + description overrides. When the catalogue
    // carries `seo.<canonicalPath>.title` / `.description`, they win
    // over the static English PAGE_SEO entry — so a Spanish or French
    // visitor sees translated meta tags in the browser tab and in
    // shared/social previews. Missing keys silently fall back to the
    // English defaults (no flash of raw key — `defaultValue: ""`).
    const titleKey = `seo.${effectiveSeoKey}.title`;
    const descKey = `seo.${effectiveSeoKey}.description`;
    const localizedTitle = t(titleKey, { defaultValue: "" });
    const localizedDesc = t(descKey, { defaultValue: "" });
    if (localizedTitle) {
      seoData.title = localizedTitle;
      seoData.ogTitle = seoData.ogTitle ?? localizedTitle;
      seoData.twitterTitle = seoData.twitterTitle ?? localizedTitle;
    }
    if (localizedDesc) {
      seoData.description = localizedDesc;
      seoData.ogDescription = seoData.ogDescription ?? localizedDesc;
      seoData.twitterDescription = seoData.twitterDescription ?? localizedDesc;
    }

    // Update meta tags
    updateMetaTags(seoData);

    // Cleanup function to reset to defaults when component unmounts
    return () => {
      // Only reset if we're navigating away from the current page
      if (window.location.pathname !== pathname) {
        updateMetaTags(DEFAULT_SEO);
      }
    };
  }, [pathname, customSEO, activeLocale, t]);
}

/**
 * Injects a BreadcrumbList JSON-LD script alongside (not replacing) the
 * page's primary structured data. Cleaned up on unmount.
 *
 * Usage in a tool page:
 *   useBreadcrumbs([
 *     { name: "Tools", url: "/tools" },
 *     { name: "AI Resume Scorer", url: "/tools/ai-resume-scorer" },
 *   ]);
 */
export function useBreadcrumbs(
  items: { name: string; url: string }[],
): void {
  useEffect(() => {
    const scriptId = "breadcrumb-jsonld";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = scriptId;
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(generateBreadcrumbs(items));

    return () => {
      const existing = document.getElementById(scriptId);
      if (existing) existing.remove();
    };
  }, [items]);
}

/**
 * Generate structured data for different content types
 */
/**
 * Input shape for the JobPosting structured-data builder. Mirrors the
 * common subset of fields available on UI Job objects throughout the
 * frontend (JobDetail, JobCard, public listings, etc).
 *
 * This is the canonical shape — pass the full job, not pre-flattened
 * strings. Anything that consumes the resulting JSON-LD (Google for
 * Jobs, the hired.video Chrome extension's `parseJobFromPage`, third
 * parties) will read the same schema.org fields.
 */
export interface JobPostingInput {
  id?: string;
  title: string;
  description: string;
  /** ISO-8601 date string. */
  postedDate?: string | Date;
  /** ISO-8601 date string. */
  validThrough?: string | Date;
  employmentType?: string; // e.g. "full_time", "Contract"
  companyName: string;
  companyLogoUrl?: string;
  companyWebsite?: string;
  /** Set true for fully-remote roles — emits jobLocationType=TELECOMMUTE. */
  isRemote?: boolean;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  /** Numeric salary in dollars (annual unless `salaryUnit` is set). */
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string; // ISO 4217, defaults to USD
  /** YEAR | MONTH | WEEK | DAY | HOUR — defaults to YEAR. */
  salaryUnit?: "YEAR" | "MONTH" | "WEEK" | "DAY" | "HOUR";
  /** Canonical URL for the job posting (defaults to hired.video/jobs/{id}). */
  url?: string;
  /** Skills, requirements — emitted as `skills` if present. */
  skills?: string[];
}

/**
 * Schema.org employment type values accepted by Google for Jobs.
 * Maps from our internal slugs (full_time, part_time, contract, …)
 * to the spec values (FULL_TIME, PART_TIME, …).
 */
function normalizeEmploymentType(value?: string): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[\s-]+/g, "_").toUpperCase();
  const allowed = new Set([
    "FULL_TIME",
    "PART_TIME",
    "CONTRACTOR",
    "CONTRACT",
    "TEMPORARY",
    "INTERN",
    "INTERNSHIP",
    "VOLUNTEER",
    "PER_DIEM",
    "OTHER",
  ]);
  // Spec uses CONTRACTOR; our app uses CONTRACT — map both.
  if (normalized === "CONTRACT") return "CONTRACTOR";
  if (normalized === "INTERN") return "INTERNSHIP";
  return allowed.has(normalized) ? normalized : "OTHER";
}

function toIsoString(value?: string | Date): string | undefined {
  if (!value) return undefined;
  try {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
  } catch {
    return undefined;
  }
}

export const generateStructuredData = {
  /**
   * Build a schema.org JobPosting object. Used both for SEO (Google
   * for Jobs) and as the source of truth that the hired.video Chrome
   * extension's `parseJobFromPage` reads when extracting job pages.
   */
  jobPosting: (job: JobPostingInput) => {
    const datePosted = toIsoString(job.postedDate) ?? new Date().toISOString();
    // Google for Jobs requires validThrough; default to 30 days out
    // when the caller doesn't supply one.
    const validThrough =
      toIsoString(job.validThrough) ??
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const address: Record<string, string> = { "@type": "PostalAddress" };
    if (job.city) address.addressLocality = job.city;
    if (job.state) address.addressRegion = job.state;
    if (job.country) address.addressCountry = job.country;
    if (job.postalCode) address.postalCode = job.postalCode;

    const jobLocation = job.isRemote
      ? undefined
      : {
          "@type": "Place",
          address: Object.keys(address).length > 1 ? address : { "@type": "PostalAddress", addressCountry: "US" },
        };

    const applicantLocationRequirements = job.isRemote
      ? { "@type": "Country", name: job.country || "US" }
      : undefined;

    const baseSalary =
      job.salaryMin || job.salaryMax
        ? {
            "@type": "MonetaryAmount",
            currency: job.salaryCurrency || "USD",
            value: {
              "@type": "QuantitativeValue",
              minValue: job.salaryMin,
              maxValue: job.salaryMax,
              unitText: job.salaryUnit || "YEAR",
            },
          }
        : undefined;

    const url =
      job.url ||
      (job.id ? `https://hired.video/jobs/${job.id}` : undefined);

    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      title: job.title,
      description: job.description,
      datePosted,
      validThrough,
      employmentType: normalizeEmploymentType(job.employmentType),
      hiringOrganization: {
        "@type": "Organization",
        name: job.companyName,
        ...(job.companyWebsite ? { sameAs: job.companyWebsite } : {}),
        ...(job.companyLogoUrl ? { logo: job.companyLogoUrl } : {}),
      },
      ...(jobLocation ? { jobLocation } : {}),
      ...(job.isRemote
        ? {
            jobLocationType: "TELECOMMUTE",
            ...(applicantLocationRequirements
              ? { applicantLocationRequirements }
              : {}),
          }
        : {}),
      ...(baseSalary ? { baseSalary } : {}),
      ...(job.id ? { identifier: { "@type": "PropertyValue", name: "hired.video", value: job.id } } : {}),
      ...(url ? { url, directApply: true } : {}),
      ...(job.skills && job.skills.length > 0 ? { skills: job.skills.join(", ") } : {}),
    };

    return data;
  },

  organization: (company: any) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: company.name,
      description: company.description,
      url: company.website,
      logo: company.logo,
      address: company.address,
    };
    if (
      typeof company.reviewCount === "number" &&
      company.reviewCount > 0 &&
      typeof company.reviewAvgOverall === "number"
    ) {
      data.aggregateRating = {
        "@type": "AggregateRating",
        ratingValue: company.reviewAvgOverall.toFixed(1),
        reviewCount: String(company.reviewCount),
        bestRating: "5",
        worstRating: "1",
      };
    }
    return data;
  },

  person: (person: {
    name: string;
    title?: string;
    bio?: string;
    avatar?: string;
    id: string;
    knowsAbout?: string[];
  }) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: person.name,
      jobTitle: person.title,
      description: person.bio,
      image: person.avatar,
      url: `https://hired.video/people/${person.id}`,
    };
    if (person.knowsAbout && person.knowsAbout.length > 0) {
      data.knowsAbout = person.knowsAbout;
    }
    return data;
  },

  article: (input: {
    type?: "Article" | "BlogPosting" | "NewsArticle";
    headline: string;
    description?: string;
    image?: string;
    datePublished?: string;
    dateModified?: string;
    authorName?: string;
    authorUrl?: string;
    keywords?: string[];
    url: string;
    wordCount?: number;
  }) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": input.type ?? "Article",
      headline: input.headline,
      mainEntityOfPage: { "@type": "WebPage", "@id": input.url },
      publisher: {
        "@type": "Organization",
        name: "hired.video",
        logo: { "@type": "ImageObject", url: "https://hired.video/og-image.svg" },
      },
    };
    if (input.description) data.description = input.description;
    if (input.image) data.image = input.image;
    if (input.datePublished) data.datePublished = input.datePublished;
    if (input.dateModified) data.dateModified = input.dateModified;
    if (input.authorName) {
      data.author = {
        "@type": "Person",
        name: input.authorName,
        ...(input.authorUrl ? { url: input.authorUrl } : {}),
      };
    }
    if (input.keywords && input.keywords.length > 0) data.keywords = input.keywords.join(", ");
    if (typeof input.wordCount === "number") data.wordCount = input.wordCount;
    return data;
  },

  course: (input: {
    name: string;
    description?: string;
    image?: string;
    instructorName?: string;
    instructorUrl?: string;
    url: string;
  }) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Course",
      name: input.name,
      provider: { "@type": "Organization", name: "hired.video", sameAs: "https://hired.video" },
      url: input.url,
    };
    if (input.description) data.description = input.description;
    if (input.image) data.image = input.image;
    if (input.instructorName) {
      data.instructor = {
        "@type": "Person",
        name: input.instructorName,
        ...(input.instructorUrl ? { url: input.instructorUrl } : {}),
      };
    }
    return data;
  },

  product: (input: {
    name: string;
    description?: string;
    image?: string;
    category?: string;
    priceCents?: number;
    currency?: string;
    url: string;
  }) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: input.name,
      brand: { "@type": "Organization", name: "hired.video" },
      url: input.url,
    };
    if (input.description) data.description = input.description;
    if (input.image) data.image = input.image;
    if (input.category) data.category = input.category;
    if (typeof input.priceCents === "number") {
      data.offers = {
        "@type": "Offer",
        price: (input.priceCents / 100).toFixed(2),
        priceCurrency: input.currency ?? "USD",
        availability: "https://schema.org/InStock",
        url: input.url,
      };
    }
    return data;
  },

  videoObject: (input: {
    name: string;
    description?: string;
    thumbnailUrl?: string;
    uploadDate?: string;
    contentUrl?: string;
    embedUrl?: string;
    url: string;
  }) => {
    const data: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "VideoObject",
      name: input.name,
      url: input.url,
    };
    if (input.description) data.description = input.description;
    if (input.thumbnailUrl) data.thumbnailUrl = input.thumbnailUrl;
    if (input.uploadDate) data.uploadDate = input.uploadDate;
    if (input.contentUrl) data.contentUrl = input.contentUrl;
    if (input.embedUrl) data.embedUrl = input.embedUrl;
    return data;
  },

  /**
   * ProfilePage with embedded Person mainEntity — the Google-preferred
   * markup for someone's resume / public profile page.
   */
  profilePage: (input: {
    name: string;
    headline?: string;
    description?: string;
    image?: string;
    url: string;
    knowsAbout?: string[];
  }) => {
    const person: Record<string, unknown> = {
      "@type": "Person",
      name: input.name,
    };
    if (input.headline) person.jobTitle = input.headline;
    if (input.description) person.description = input.description;
    if (input.image) person.image = input.image;
    if (input.knowsAbout && input.knowsAbout.length > 0) person.knowsAbout = input.knowsAbout;
    return {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      url: input.url,
      mainEntity: person,
    };
  },
};

/**
 * Build a schema.org BreadcrumbList for SERP breadcrumb trails.
 *
 * Usage:
 *   generateBreadcrumbs([
 *     { name: "Tools", url: "/tools" },
 *     { name: "AI Resume Scorer", url: "/tools/ai-resume-scorer" },
 *   ])
 */
export function generateBreadcrumbs(
  items: { name: string; url: string }[],
): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${CANONICAL_ORIGIN}${item.url}`,
    })),
  };
}

/**
 * Build a schema.org Product with multiple Offer entries for SaaS pricing.
 * Used on the Pricing page for rich snippets.
 */
export function generatePricingSchema(plans: {
  name: string;
  description: string;
  monthlyPrice: number;
  annualPrice?: number;
  currency?: string;
  features?: string[];
}[]): object {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "hired.video",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web Browser",
    url: "https://hired.video",
    offers: plans.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      description: plan.description,
      price: String(plan.monthlyPrice),
      priceCurrency: plan.currency || "USD",
      ...(plan.annualPrice != null
        ? {
            priceSpecification: [
              {
                "@type": "UnitPriceSpecification",
                price: String(plan.monthlyPrice),
                priceCurrency: plan.currency || "USD",
                unitText: "MONTH",
                referenceQuantity: { "@type": "QuantitativeValue", value: "1", unitCode: "MON" },
              },
              {
                "@type": "UnitPriceSpecification",
                price: String(plan.annualPrice),
                priceCurrency: plan.currency || "USD",
                unitText: "YEAR",
                referenceQuantity: { "@type": "QuantitativeValue", value: "1", unitCode: "ANN" },
              },
            ],
          }
        : {}),
    })),
  };
}
