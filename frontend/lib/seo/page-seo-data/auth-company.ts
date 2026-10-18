/**
 * PAGE_SEO slice — auth/checkout flows, pricing, audiences, about/careers, jobs, companies, settings, legal.
 * Assembled (in order) into PAGE_SEO by lib/seo/page-seo.ts.
 */
import type { SEOData } from "../types";

export const PAGE_SEO_AUTH_COMPANY: Record<string, SEOData> = {
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
  "/signup-success": {
    title: "Check Your Email — hired.video",
    description: "Confirm your email to finish creating your hired.video account.",
    robots: "noindex, nofollow",
  },
  "/verify-email": {
    title: "Verify Your Email — hired.video",
    description: "Verify your email address to continue using hired.video.",
    robots: "noindex, nofollow",
  },
  "/confirm-email": {
    title: "Confirm Email — hired.video",
    description: "Confirm your hired.video email address.",
    robots: "noindex, nofollow",
  },
  "/accept-invitation": {
    title: "Accept Invitation — hired.video",
    description: "Accept your invitation to join a team on hired.video.",
    robots: "noindex, nofollow",
  },
  "/persona-selection": {
    title: "Choose Your Profile — hired.video",
    description: "Tell hired.video what you're here for so we can set things up.",
    robots: "noindex, nofollow",
  },
  "/checkout": {
    title: "Checkout — hired.video",
    description: "Complete your hired.video purchase.",
    robots: "noindex, nofollow",
  },
  "/checkout/success": {
    title: "Payment Complete — hired.video",
    description: "Your hired.video payment is complete.",
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
    title: "Create a Free Account — hired.video",
    description:
      "Create your free hired.video account to download your resume and post it as a video to LinkedIn, YouTube and more. No credit card required.",
    keywords:
      "sign up, create account, video resume registration, free career tools, AI resume, join hired.video",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "Sign Up — hired.video",
      url: "https://hired.video/signup",
      dateModified: "2026-04-17",
      description: "Create a free hired.video account. Build your resume, turn it into a video and post it to your social networks. No credit card required.",
    },
  },
  "/pricing": {
    title:
      "Pricing: Free and Pro for Job Seekers — hired.video",
    description:
      "Build your resume, turn it into a video, and post it free to up to 2 social channels. Pro removes the watermark, unlocks unlimited posting, and adds an AI agent that posts for you. Monthly or annual billing — cancel anytime.",
    keywords:
      "hired.video pricing, video resume pricing, resume builder cost, free resume builder, resume to video, post resume to social media",
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
      "hired.video helps job seekers create a resume, turn it into a video, and post it to their social channels.",
    keywords:
      "about us, company mission, video resume platform, job seekers",
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
      "Join hired.video and help build tools that get job seekers seen. Explore our open positions.",
    keywords:
      "careers, jobs, hired.video, software engineer, product designer, devops, remote work, tech jobs",
    twitterDescription:
      "Join hired.video and help build tools that get job seekers seen. Explore our open positions.",
  },
  "/resumes": {
    title:
      "AI Video Resume Maker & Resume Builder — hired.video",
    description:
      "Create a video resume in 60 seconds with AI, or build a traditional ATS-friendly resume. Track views, tailor variations per job, and share it to LinkedIn and your other networks — all in one place.",
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
      url: "https://hired.video/templates",
      description:
        "Marketplace of professionally designed, ATS-friendly resume templates. Preview each template against the showcase resume or your own, and unlock once to apply across all your resumes.",
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
    },
  },
  "/jobs": {
    title: "Job Search: AI Job Matching — hired.video",
    description:
      "Find your dream job with AI-powered matching. Browse open roles, tailor your resume to each one, and apply with your video resume.",
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
  "/recruiter/placements": {
    title: "Placements & Commission — hired.video",
    description:
      "Track every placement you've made, commission earned across fee splits, and bulk-record multiple placements against a job.",
    keywords:
      "placements, recruiter commission, fee splits, placement tracking, staffing back office",
  },
  "/team": {
    title: "Team Activities — hired.video",
    description:
      "Assign paid activities to the people you've hired — hourly or fixed — track their time, approve the work, and pay them. The simple way to put a new hire to work, even part-time.",
    keywords:
      "assign work, paid activities, hourly tasks, timesheet approval, pay contractors, part-time work",
  },
  "/recruit/pipeline": {
    title: "Candidate Pipeline — hired.video",
    description:
      "Work every candidate across all your jobs in one cross-job kanban. Drag candidates through stages, bulk-move, and export — the recruiter pipeline that spans your whole desk.",
    keywords:
      "candidate pipeline, recruiting kanban, ATS pipeline, cross-job pipeline, applicant tracking",
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
  "/studio/distribution": {
    title: "Distribution Hub — hired.video",
    description:
      "Schedule one video to TikTok, YouTube, Instagram, LinkedIn, X, Facebook and the hired.video feed, and follow every post in one queue.",
    robots: "noindex, nofollow",
  },
  "/settings/connections": {
    title: "Connected accounts — hired.video",
    description:
      "Connect your TikTok, YouTube, Instagram, LinkedIn, Facebook, and X accounts to publish your Studio content directly to them.",
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
};
