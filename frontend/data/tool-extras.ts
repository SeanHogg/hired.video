/**
 * Per-tool FAQ items (rendered via MarketingFAQ) and related blog post
 * links displayed at the bottom of each tool page.
 *
 * Centralised here so tool pages stay thin and content is easy to update.
 */

import type { MarketingFAQItem } from "@/components/MarketingFAQ";

export interface ToolExtras {
  faqSchemaId: string;
  faq: MarketingFAQItem[];
  blogSlug: string;
  blogTitle: string;
}

export const TOOL_EXTRAS: Record<string, ToolExtras> = {
  "/tools/ai-resume-scorer": {
    faqSchemaId: "tool-ai-resume-scorer",
    faq: [
      { question: "Is the AI Resume Scorer free?", answer: "Yes. Score your resume for free with no signup required. You get a letter grade, percentage score, and specific recommendations across six dimensions." },
      { question: "How accurate is an AI resume scorer vs. a real ATS?", answer: "hired.video's scorer uses the same parsing techniques major ATS platforms use. A score of 80%+ correlates strongly with passing real-world filters at companies using Greenhouse, Lever, and Workday." },
      { question: "What's a good ATS resume score?", answer: "90–100% is excellent (top 8% of resumes). 80–89% is strong. 70–79% is average. Below 70% needs work. Most resumes can move from C to A in 15 minutes of focused editing." },
    ],
    blogSlug: "how-to-score-your-resume-for-ats",
    blogTitle: "How to Score Your Resume for ATS Compatibility in 2026",
  },
  "/tools/resume-optimizer": {
    faqSchemaId: "tool-resume-optimizer",
    faq: [
      { question: "Does the optimizer change my actual experience?", answer: "No. It only restructures, rewords, and surfaces existing experience. It never fabricates roles, skills, or achievements." },
      { question: "How many keywords should I target?", answer: "Focus on the 10–15 most frequently mentioned terms in the job description. The optimizer identifies and prioritizes these automatically." },
      { question: "Should I optimize for every job?", answer: "Yes — each job description has different priority keywords. A resume optimized for one role may score 30 points lower for a similar role at a different company." },
    ],
    blogSlug: "optimize-your-resume-for-any-job",
    blogTitle: "How to Optimize Your Resume for Any Job Description with AI",
  },
  "/tools/salary-calculator": {
    faqSchemaId: "tool-salary-calculator",
    faq: [
      { question: "How accurate is the Salary Calculator?", answer: "It uses aggregated market data combined with AI estimation for P10–P90 ranges. Most accurate for common roles in major US markets. Cross-reference with Glassdoor or Levels.fyi for niche roles." },
      { question: "Should I negotiate salary for my first job?", answer: "Yes. Not negotiating your first salary costs an average of $500,000 in lifetime earnings due to compounding raises." },
      { question: "What if the employer asks my current salary?", answer: "In many US states it's illegal for employers to ask. Redirect: 'I'd prefer to focus on what's fair for this role. What's the budgeted range?'" },
    ],
    blogSlug: "how-to-research-your-market-salary",
    blogTitle: "How to Research Your Market Salary and Negotiate with Confidence",
  },
  "/tools/job-resume-match": {
    faqSchemaId: "tool-job-resume-match",
    faq: [
      { question: "What's a good match score?", answer: "75%+ is a strong match worth applying to. 60–74% means your resume needs optimization. Below 60% means the role may not be a good fit." },
      { question: "Should I apply if my score is low?", answer: "If you have the skills but your resume doesn't mention them, optimize and re-score. If you genuinely lack core requirements, focus on higher-match roles." },
      { question: "What dimensions does it measure?", answer: "Hard skills alignment (40%), experience level fit (25%), soft skills and culture fit (20%), and industry relevance (15%)." },
    ],
    blogSlug: "how-to-match-your-resume-to-any-job",
    blogTitle: "How to Match Your Resume to Any Job Posting (AI Fit Score Guide)",
  },
  "/tools/sentiment-analysis": {
    faqSchemaId: "tool-sentiment-analysis",
    faq: [
      { question: "Can tone really affect whether I get an interview?", answer: "Yes. Confident, specific language increases recruiter engagement time by 40%. The human who reads the resumes that pass ATS absolutely notices tone." },
      { question: "What does the tool check for?", answer: "Passive voice, hedge words ('helped with', 'assisted in'), vague descriptors, job-description language, and filler phrases. Each flagged phrase gets a rewrite suggestion." },
      { question: "What if I'm not comfortable sounding assertive?", answer: "Assertive doesn't mean arrogant. 'Co-led the launch of a product reaching 50K users' is a fact, not bragging." },
    ],
    blogSlug: "write-a-confident-resume-tone-guide",
    blogTitle: "How to Write a Confident, Action-Driven Resume (Tone Guide)",
  },
  "/tools/value-proposition": {
    faqSchemaId: "tool-value-proposition",
    faq: [
      { question: "How is this different from a resume summary?", answer: "A summary describes your background. A value proposition describes what you'll do for this employer — it's forward-looking and ties your experience to the company's needs." },
      { question: "Should I change it for every job?", answer: "Yes. Your core expertise stays the same, but the 'employer need' and 'unique angle' should be customized. Just paste a new job description." },
      { question: "When should I use my value proposition?", answer: "Interview openers ('Tell me about yourself'), cover letter openings, LinkedIn summary, networking conversations, and email pitches to recruiters." },
    ],
    blogSlug: "how-to-write-your-personal-value-proposition",
    blogTitle: "How to Write a Personal Value Proposition That Wins Interviews",
  },
  "/tools/pdf-to-json": {
    faqSchemaId: "tool-pdf-to-json",
    faq: [
      { question: "What formats does the parser accept?", answer: "PDF and DOCX files, plus pasted plain text. PDFs can be text-based or scanned (OCR is included)." },
      { question: "Is the output JSON Resume compatible?", answer: "Yes. The schema follows jsonresume.org with minor extensions for certifications. Use the output directly with any JSON Resume tool or theme." },
      { question: "How does it handle unusual layouts?", answer: "The AI understands context, not just patterns. Multi-column layouts, tables, and creative formatting are handled. Accuracy drops slightly for image-only scanned PDFs." },
    ],
    blogSlug: "parse-resume-pdf-to-structured-json",
    blogTitle: "How to Parse a Resume PDF Into Structured JSON (Developer Guide)",
  },
  "/tools/resume-consolidator": {
    faqSchemaId: "tool-resume-consolidator",
    faq: [
      { question: "How many resumes can I merge?", answer: "2–5 resume files per merge. Upload as PDF, DOCX, or paste text. The AI handles different formats and layouts automatically." },
      { question: "Will it delete any achievements?", answer: "No. It only removes true duplicates. When it finds two descriptions of the same work, it keeps the stronger (more quantified) version." },
      { question: "What do I do with the master resume?", answer: "Never submit it directly — it's too long. Use it as the source from which all tailored resumes are cut via the Resume Tailor tool." },
    ],
    blogSlug: "merge-multiple-resumes-into-one",
    blogTitle: "How to Merge Multiple Resumes Into One Master Resume",
  },
  "/tools/auto-fill": {
    faqSchemaId: "tool-auto-fill",
    faq: [
      { question: "How does the Application Autofill work?", answer: "Paste an application URL or the questions themselves. AI reads your profile and resume, then generates accurate answers for each field — including custom 'why do you want to work here' essays. Every answer is editable before you submit." },
      { question: "Which ATS platforms are supported?", answer: "Greenhouse, Lever, Workday, Ashby, SmartRecruiters, iCIMS, and BambooHR are supported with ATS-specific field mappings. The generic fallback handles any custom form from startups to Fortune 500 career pages." },
      { question: "Do I need the Chrome extension?", answer: "No — the web tool works standalone. But the Chrome extension makes it faster: navigate to any application page, click Autofill, and the form fills in with React/Vue/Angular-compatible event handling." },
      { question: "Will the AI make up experience I don't have?", answer: "No. Answers are constrained to your actual resume and profile. For anything it can't infer (e.g., visa status), it marks the confidence as 'low' and you confirm manually." },
    ],
    blogSlug: "tailor-your-resume-for-every-application",
    blogTitle: "How to Tailor Your Resume for Every Job Application",
  },
  "/tools/resume-tailor": {
    faqSchemaId: "tool-resume-tailor",
    faq: [
      { question: "How long does AI tailoring take?", answer: "Under 2 minutes. Paste your resume and the job description, click Tailor, and review the tracked changes." },
      { question: "Does it change my job history?", answer: "No. It only modifies keyword emphasis, bullet ordering, summary text, and skills prioritization. Titles, dates, and companies stay unchanged." },
      { question: "Should I tailor for every application?", answer: "For roles you're serious about, yes. Tailored resumes get 2.3x more callbacks than generic ones." },
    ],
    blogSlug: "tailor-your-resume-for-every-application",
    blogTitle: "How to Tailor Your Resume for Every Job Application",
  },
  "/tools/summarize-resume": {
    faqSchemaId: "tool-summarize-resume",
    faq: [
      { question: "How long should a professional summary be?", answer: "2–3 sentences (40–60 words). The goal is to hook recruiters into reading the rest, not tell your whole story." },
      { question: "Should I use this on LinkedIn too?", answer: "Yes, but expand slightly. LinkedIn's About section can be 3–5 sentences. Generate a concise version for your resume, then add context for LinkedIn." },
      { question: "What makes AI summaries better than writing my own?", answer: "The AI reads your entire work history and identifies your most impressive achievements objectively, avoids cliches, and writes in a confident first-person voice." },
    ],
    blogSlug: "write-a-professional-summary-that-gets-noticed",
    blogTitle: "How to Write a Professional Summary That Gets Noticed",
  },
};
