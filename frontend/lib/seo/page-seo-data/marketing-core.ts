/**
 * PAGE_SEO slice — home, studio, platform marketing, legal/privacy surfaces.
 * Assembled (in order) into PAGE_SEO by lib/seo/page-seo.ts.
 */
import { ORGANIZATION_SCHEMA } from "../defaults";
import type { SEOData } from "../types";

export const PAGE_SEO_MARKETING_CORE: Record<string, SEOData> = {
  // 3D world play-invite landing (gap #1637). Token route — useSEO
  // resolves the literal path key; the loader overlays the project's
  // label as a runtime customSEO patch.
  "/play/:token": {
    title: "Join the game — hired.video",
    description: "Play a 3D world built in the hired.video studio. WASD to move, space to jump.",
  },
  "/": {
    title:
      "Free Resume Builder & Video Resume Maker — Post to LinkedIn & YouTube | hired.video",
    description:
      "Upload your resume (PDF, Word, text or a photo) or describe yourself in a sentence. hired.video builds a clean resume, turns it into a video resume, and lets you post it to LinkedIn and YouTube. Free to start — no account needed to preview.",
    keywords:
      "resume builder, free resume builder, video resume, video resume maker, AI resume, resume to video, LinkedIn video, YouTube video resume, post resume to LinkedIn, Shorts resume",
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
    title:
      "Chrome Extension for Job Seekers, Recruiters & Sellers — hired.video",
    description:
      "One free Chrome extension: tailor your resume, cover letter and autofill on any job; pair a candidate with a job; pitch prospects and reply to posts with video. It fills the box, you press Send.",
    keywords:
      "chrome extension, job tracker extension, resume tailoring extension, autofill job applications, recruiter chrome extension, linkedin sourcing extension, video prospecting extension, video reply linkedin",
  },
  "/affiliate-program": {
    title: "Affiliate Program: Earn 25% — hired.video",
    description:
      "Earn 25% commission on every first-month subscription you refer. Promote AI video resumes and modern career tools to your audience with transparent tracking.",
    keywords:
      "affiliate program, career affiliate, saas affiliate, resume affiliate, referral commission",
  },
  // SCORM + xAPI hosting platform — the SCORM-Cloud alternative. Migrate
  // training in and out without lock-in; host and track SCORM/xAPI content.
  "/learning-platform": {
    title: "SCORM & xAPI Hosting Platform — hired.video",
    description:
      "Move your training in — and out — without lock-in. Host, play, and track SCORM 1.2/2004 and xAPI (Tin Can) content with a conformant LRS, plus full import/export. A SCORM Cloud alternative.",
    keywords:
      "SCORM hosting, xAPI, Tin Can API, LRS, learning record store, SCORM Cloud alternative, SCORM import export, cmi5, AICC, LMS migration",
  },
  // Authenticated migration console — export a tenant's courses/records or
  // import an xAPI archive from another platform. Behind auth.
  "/learning/portability": {
    title: "Import & Export Learning Data — hired.video",
    description:
      "Export your courses, learner results, and xAPI statement history in portable formats, or import an xAPI archive from another platform. No lock-in.",
    keywords:
      "learning data export, xAPI export, SCORM import, LMS migration, learner records portability",
  },
  // Partner platform consent screen. A partner sends the job seeker here to
  // approve connecting to their existing account. Noindex-adjacent (behind
  // auth) but still needs a real title/description for the tab + share cards.
  "/connect/authorize": {
    title: "Authorize connection — hired.video",
    description:
      "Review and approve a partner platform's request to connect to your hired.video account.",
  },
  // Owner reference management (#1677). Confidential, selectively-shared
  // references for the senior-exec audience — moved here from an inline
  // useSEO override on References.tsx (gap #1968).
  "/references": {
    title: "Reference Management · hired.video",
    description:
      "Manage confidential references and share NDA-gated reference packets selectively.",
  },
  // AI Career Coach handoff surface (route /ai-coach, alias /chat). Was
  // relying on DEFAULT_SEO via a bare useSEO(pathname) call — now has a
  // real registry entry (gap #1968).
  "/ai-coach": {
    title: "AI Career Coach: Interview Prep, Resume Review & Career Guidance — hired.video",
    description:
      "Chat with your personal AI career coach for interview practice, resume feedback, salary negotiation, and networking strategy — personalized to your profile and target role.",
    keywords:
      "AI career coach, AI interview prep, resume review AI, career guidance, salary negotiation, networking advice, AI CHRO",
  },
  // Programmatic salary SEO index (/salary). Static meta moved off the
  // inline useSEO override on SalaryIndexPage (gap #1968). Canonical is
  // pinned so the index doesn't fight the /salary/:role leaf pages.
  "/salary": {
    title: "Salary Guides by Role & City — hired.video",
    description:
      "Browse salary data for hundreds of roles and cities. Real ranges from active job listings on hired.video, updated continuously.",
    canonical: "https://hired.video/salary",
  },
  // Location sitemap landing (/sitemap/locations). Static meta moved off
  // the inline useSEO override on SitemapLocations.tsx (gap #1968).
  "/sitemap/locations": {
    title: "All Locations — Jobs Worldwide · hired.video",
    description:
      "Browse jobs and career resources by country, state, province, and city. Comprehensive sitemap of every region we cover.",
    ogTitle: "Hired.video — Browse Jobs by Location",
    ogDescription:
      "Find jobs and career resources in every country, state, and major city. Click through to local employers, relocation guides, and open roles.",
  },
  // Competitor comparison (/vs-competitors). Static meta moved off the
  // inline useSEO override on Competitors.tsx (gap #1968). structuredData
  // stays a runtime override on the page since it's built by
  // buildComparisonStructuredData() (no static literal to inline here).
  "/vs-competitors": {
    title:
      "How hired.video Compares for Job Seekers — hired.video",
    description:
      "Most tools stop at the resume. hired.video builds it, turns it into a video, and posts it to your social channels — free to start, with an AI posting agent on Pro.",
    keywords:
      "video resume tool comparison, resume builder alternative, resume to video, post resume to LinkedIn",
  },
  // CCPA / CPRA "Do Not Sell or Share" self-service page (#1149). Indexed
  // so the legally-required opt-out is discoverable (gap #1968/#1969).
  "/privacy/opt-out": {
    title: "Do Not Sell or Share My Personal Information — hired.video",
    description:
      "Exercise your CCPA / CPRA right to opt out of the sale or sharing of your personal information for targeted advertising. Self-service, signed in or anonymous.",
    keywords:
      "do not sell my personal information, CCPA opt out, CPRA opt out, do not share, privacy opt out, global privacy control",
  },
  // Data deletion instructions — the URL the Meta / TikTok / X developer
  // consoles require for social posting (gap #2299). Indexed so it's findable.
  "/data-deletion": {
    title: "Delete Your Data — hired.video",
    description:
      "Delete your hired.video account, disconnect the TikTok, Instagram, Facebook, X, LinkedIn or YouTube accounts you connected, or ask us to erase your data.",
    keywords:
      "delete hired.video account, data deletion, remove connected accounts, disconnect TikTok, disconnect Instagram, GDPR erasure",
  },
};
