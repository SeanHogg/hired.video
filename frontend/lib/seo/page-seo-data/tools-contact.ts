/**
 * PAGE_SEO slice — AI tool pages (part 2), contact, blog.
 * Assembled (in order) into PAGE_SEO by lib/seo/page-seo.ts.
 */
import type { SEOData } from "../types";

export const PAGE_SEO_TOOLS_CONTACT: Record<string, SEOData> = {
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
