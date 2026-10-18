/**
 * PAGE_SEO slice — help + guides, tools index, learning, verify, AI tool pages (part 1).
 * Assembled (in order) into PAGE_SEO by lib/seo/page-seo.ts.
 */
import type { SEOData } from "../types";

export const PAGE_SEO_GUIDES_LEARNING: Record<string, SEOData> = {
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
  "/wishlist": {
    title: "My Wishlist — Saved Courses — hired.video",
    description:
      "Courses you've saved to come back to. Tap the heart on any course to add it to your wishlist and enroll when you're ready.",
    keywords: "saved courses, course wishlist, bookmarked courses, learning wishlist",
    ogTitle: "My Wishlist — hired.video",
    ogDescription: "Your saved courses on hired.video.",
    ogImage: "https://hired.video/og-image.svg",
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
  "/learn/dashboard": {
    title: "My Learning — hired.video",
    description:
      "Your learning dashboard: courses in progress, assigned training, completed courses, earned certificates, points, and the XP leaderboard — all in one place.",
    keywords:
      "my learning dashboard, learner progress, course progress, learning certificates, XP leaderboard, assigned training",
    ogTitle: "My Learning — hired.video",
    ogDescription:
      "Track your courses, progress, certificates, points, and XP ranking on hired.video.",
    ogImage: "https://hired.video/og-image.svg",
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
};
