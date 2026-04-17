import { useEffect } from "react";

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
    availableLanguage: ["English"],
  },
};

/**
 * Default SEO configuration for the application
 */
export const DEFAULT_SEO: SEOData = {
  title:
    "hired.video — AI Video Resumes, Resume Builder & AI Job Search Platform",
  description:
    "hired.video turns your resume into an AI-generated video resume in 60 seconds. Build, score, and tailor resumes for every job — and connect with recruiters through AI-powered matching.",
  keywords:
    "AI video resume, video resume maker, resume builder, AI resume scorer, AI job matching, ATS resume, recruitment platform, job search, career tools, interview practice",
  ogTitle: "hired.video — AI Video Resumes & AI Job Search",
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
  "/": {
    title:
      "hired.video — AI Video Resumes, Resume Builder & AI Job Search",
    description:
      "Create an AI-generated video resume in 60 seconds, tailor your resume to every job with AI, and get matched with recruiters who are actively hiring. Free to start.",
    keywords:
      "AI video resume, video resume maker, resume builder, AI resume scorer, AI job matching, resume tailoring, career development, professional networking",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "hired.video",
      description:
        "AI-powered video resume platform and AI job search tools — create video resumes, tailor your resume for any job, and match with recruiters.",
      url: "https://hired.video",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web Browser",
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
  },
  "/home": {
    title: "Your Career Home — hired.video",
    description:
      "Your unified career command center — track resumes, applications, outreach, and your professional network, and share wins with the hired.video community.",
    keywords:
      "career dashboard, job search tracker, career community, resume tracking, professional network, career home",
  },
  "/studio": {
    title: "AI Video Resume Studio — hired.video",
    description:
      "Generate a polished AI video resume in 60 seconds. Paste your resume, our AI writes the script, and you export a 1080p video — no camera, no editing required.",
    keywords:
      "AI video resume, video resume generator, video resume maker, AI video studio, video resume creator, video resume template",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "hired.video Studio",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web Browser",
      description:
        "AI-powered video resume studio — turns any resume into a 60-second video with AI-generated scripts, animated scenes, and one-click export to MP4 or YouTube.",
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
      "Track jobs, score resumes, and source candidates on LinkedIn, Indeed, Glassdoor and 16+ job boards — without leaving the page. Free Chrome extension.",
    keywords:
      "chrome extension, linkedin chrome extension, job tracker extension, resume scorer chrome, ATS chrome extension, sourcing tool",
  },
  "/affiliate-program": {
    title: "Affiliate Program — Earn 25% with hired.video",
    description:
      "Earn 25% commission on every first-month subscription you refer. Promote AI video resumes and modern career tools to your audience with transparent tracking.",
    keywords:
      "affiliate program, career affiliate, saas affiliate, resume affiliate, referral commission",
  },
  "/resume-roast": {
    title: "Free AI Resume Roast — Brutally Honest Resume Feedback",
    description:
      "Upload your resume and get brutally honest, instant AI feedback on what's working, what's weak, and exactly how to fix it. 100% free.",
    keywords:
      "free resume roast, ai resume feedback, resume critique, resume review, resume feedback ai",
  },
  "/interview": {
    title: "Free AI Interview Practice — hired.video",
    description:
      "Practice live interviews with an AI interviewer tuned to your role. Get instant feedback on your answers, tone, and pacing. Completely free.",
    keywords:
      "ai interview practice, mock interview, interview prep, behavioral interview, ai interviewer",
  },
  "/post-a-job": {
    title: "Post a Job for Free — hired.video",
    description:
      "Post your open role and reach candidates with AI-generated video intros. Google for Jobs indexed, structured-data ready, and free to start.",
    keywords:
      "post a job, free job posting, hire talent, post job, google for jobs",
  },
  "/login": {
    title: "Login - Hired.video",
    description:
      "Sign in to your Hired.video account to access your video resumes, job applications, and professional network.",
    robots: "noindex, nofollow",
  },
  "/signup": {
    title: "Sign Up - Hired.video",
    description:
      "Join Hired.video today and create your professional video resume. Connect with top employers and advance your career.",
    keywords:
      "sign up, create account, video resume registration, join Hired.video",
  },
  "/pricing": {
    title: "Pricing — hired.video Plans for Job Seekers, Recruiters & Teams",
    description:
      "Start free, upgrade when you're ready. Transparent monthly and annual plans for job seekers, recruiters, and employers — cancel anytime.",
    keywords:
      "hired.video pricing, video resume pricing, resume builder cost, recruiter plan, ats pricing, annual subscription",
  },
  "/for-recruiters": {
    title:
      "For Recruiters — AI Candidate Sourcing, Screening & Video Resumes | hired.video",
    description:
      "Source candidates from LinkedIn and Indeed, screen applicants with AI match scoring, and evaluate talent 3× faster with video resumes. Built for modern recruiters and talent teams.",
    keywords:
      "recruiter tools, ai candidate sourcing, candidate screening, applicant tracking, video resume screening, talent pool, sourcing chrome extension, ai recruiting software",
  },
  "/about": {
    title: "About Us - Hired.video",
    description:
      "Learn about Hired.video's mission to revolutionize recruitment through AI-powered video resumes and talent matching.",
    keywords:
      "about us, company mission, video resume platform, recruitment innovation",
  },
  "/careers": {
    title: "Careers at Hired.video",
    description:
      "Join our team and help reshape how professionals showcase talent. Explore open roles and grow your career with us.",
    keywords:
      "careers, jobs at Hired.video, hiring, open roles, work with us",
  },
  "/resumes": {
    title:
      "AI Video Resume Maker & Resume Builder — hired.video",
    description:
      "Create a video resume in 60 seconds with AI, or build a traditional ATS-friendly resume. Track views, tailor variations per job, and share with recruiters — all in one place.",
    keywords:
      "video resume maker, ai video resume, resume builder, ats resume, video resume template, online resume, resume with video, professional resume",
  },
  "/jobs": {
    title: "Job Search - Hired.video",
    description:
      "Find your dream job with AI-powered matching. Browse thousands of opportunities and apply with your video resume.",
    keywords:
      "job search, career opportunities, employment, job listings, AI job matching",
  },
  "/companies": {
    title: "Companies - Hired.video",
    description:
      "Discover top companies hiring through video resumes. Connect with innovative employers and explore career opportunities.",
    keywords:
      "companies, employers, hiring companies, career opportunities, company profiles",
  },
  "/people": {
    title: "Professional Network - Hired.video",
    description:
      "Connect with professionals, recruiters, and industry leaders. Build your network and advance your career.",
    keywords:
      "professional networking, career connections, industry professionals, networking platform",
  },
  "/tasks": {
    title: "Task Management - Hired.video",
    description:
      "Organize your job search and career development with powerful task management tools. Stay on top of applications and follow-ups.",
    keywords:
      "task management, job search organization, career planning, productivity tools",
  },
  "/outreach": {
    title: "Professional Outreach - Hired.video",
    description:
      "Manage your professional communications and networking outreach. Build relationships that advance your career.",
    keywords:
      "professional outreach, networking, communication tools, relationship building",
  },
  "/account": {
    title: "Account Management - hired.video",
    description:
      "Manage your account settings, team members, and organization preferences. Complete control over your hired.video experience.",
    robots: "noindex, nofollow",
  },
  "/settings": {
    title: "Settings - hired.video",
    description:
      "Customize your hired.video experience. Manage privacy, notifications, and account preferences.",
    robots: "noindex, nofollow",
  },
  "/privacy-policy": {
    title: "Privacy Policy - hired.video",
    description:
      "Learn how we protect your data and respect your privacy across our platform. Review our policies and your rights.",
    keywords:
      "privacy policy, data protection, GDPR compliance, user privacy, data security",
  },
  "/terms-of-service": {
    title: "Terms of Service - hired.video",
    description:
      "Understand your rights and responsibilities when using hired.video. Review our platform terms and conditions.",
    keywords: "terms of service, user agreement, legal terms, platform rules",
  },
  "/help": {
    title: "Help & Support - hired.video",
    description:
      "Find answers, browse guides, and contact support to get the most from hired.video.",
    keywords: "help, support, FAQ, user guide, customer service",
  },
  "/tools": {
    title: "Free AI Career Tools — Resume Scorer, Optimizer, Value Prop | hired.video",
    description:
      "Free AI career tools from hired.video: resume scorer, ATS optimizer, salary calculator, job-resume match, sentiment analysis, and value proposition builder. No signup to try.",
    keywords:
      "AI career tools, AI resume scorer, resume optimizer, ATS resume checker, salary calculator, job match, value proposition, free career tools, AI job search",
    ogTitle: "Free AI Career Tools — hired.video",
    ogDescription:
      "Score, optimize, and tailor your resume with AI. Free to try — no signup needed to start.",
    ogImage: "https://hired.video/og-image.svg",
    structuredData: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "hired.video AI Career Tools",
      url: "https://hired.video/tools",
      description:
        "A collection of free AI-powered career tools including resume scoring, ATS optimization, salary analysis, job-resume matching, and value proposition generation.",
      isPartOf: { "@type": "WebSite", name: "hired.video", url: "https://hired.video" },
    },
  },
  "/tools/ai-resume-scorer": {
    title: "AI Resume Scorer — Free ATS Resume Grader | hired.video",
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
    title: "Resume Optimizer — AI ATS Keyword Matcher | hired.video",
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
    title: "Salary Calculator — AI Compensation Benchmarks | hired.video",
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
    title: "Job-Resume Match — AI Fit Score for Any Role | hired.video",
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
    title: "AI Resume Summarizer — Professional Summaries in Seconds | hired.video",
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
    title: "Resume Sentiment Analysis — AI Tone Checker | hired.video",
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
    title: "AI Value Proposition Builder — Elevator Pitch Generator | hired.video",
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
    title: "Resume PDF to JSON Converter — AI Resume Parser | hired.video",
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
    title: "Resume Consolidator — Merge Multiple Resumes | hired.video",
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
  "/tools/resume-tailor": {
    title: "Resume Tailor — AI Custom Resume for Every Job | hired.video",
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
    title: "Contact Us - hired.video",
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
    title: "Career Guides & AI Tool Tutorials — hired.video Blog",
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
    "/privacy": "/privacy-policy",
    "/terms": "/terms-of-service",
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
 * React hook for managing SEO
 */
export function useSEO(pathname: string, customSEO?: Partial<SEOData>): void {
  useEffect(() => {
    // Canonicalize route path and normalize origin
    const canonicalPath = canonicalizePath(pathname);

    // Get page-specific SEO or use defaults
    const pageSEO = PAGE_SEO[canonicalPath] || {};

    // Merge default, page-specific, and custom SEO data
    const seoData: SEOData = {
      ...DEFAULT_SEO,
      ...pageSEO,
      ...customSEO,
    };

    // Build canonical and og:url consistently
    const url = `${CANONICAL_ORIGIN}${canonicalPath}`;

    if (!seoData.canonical) {
      seoData.canonical = url;
    }
    if (!seoData.ogUrl) {
      seoData.ogUrl = url;
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
  }, [pathname, customSEO]);
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

  organization: (company: any) => ({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: company.name,
    description: company.description,
    url: company.website,
    logo: company.logo,
    address: company.address,
  }),

  person: (person: any) => ({
    "@context": "https://schema.org",
    "@type": "Person",
    name: person.name,
    jobTitle: person.title,
    description: person.bio,
    image: person.avatar,
    url: `https://hired.video/people/${person.id}`,
  }),
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
