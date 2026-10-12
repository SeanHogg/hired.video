/**
 * Per-tool FAQ items (rendered via MarketingFAQ) and related blog post
 * links displayed at the bottom of each tool page.
 *
 * Centralised here so tool pages stay thin and content is easy to update.
 */

import type { MarketingFAQItem } from "@/lib/landing/marketing-faq";

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
  "/tools/profile-audit": {
    faqSchemaId: "tool-profile-audit",
    faq: [
      { question: "Is the Profile Audit a Pro feature?", answer: "Yes. Profile Audit reads your full profile, runs an LLM-driven rewrite, and grades five recruiter signals — it's available on Pro." },
      { question: "Will it change my work history or skills?", answer: "No. The audit only rewrites your headline, summary, and (optionally) your current-role line. Job titles, employers, dates, and skills are never modified." },
      { question: "What does the audit grade?", answer: "Five recruiter signals from the blog post: headline shape, 7-second skim test, recent activity, open-to-work flag, and avatar. Each gets a pass / warn / fail with a one-line reason." },
      { question: "Can I accept just one of the proposed rewrites?", answer: "Yes. Each rewrite (headline / summary / current role) has its own Accept toggle. Apply only the ones you like — or accept all three at once." },
    ],
    blogSlug: "what-makes-a-standout-candidate-profile",
    blogTitle: "What Makes a Standout Candidate Profile (And How to Build One)",
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
  "/tools/skill-extractor": {
    faqSchemaId: "tool-skill-extractor",
    faq: [
      { question: "What does the Skill Extractor do?", answer: "Paste a job description or resume and the AI returns every skill it mentions, grouped by category (languages, frameworks, tools, soft skills, certifications) and deduplicated. Compare a job's skills against a candidate's resume in seconds." },
      { question: "Is the Skill Extractor free?", answer: "Yes. The extractor is free with no signup required for a single source. Sign in to save extractions, compare across resumes, and run skill-gap analysis." },
      { question: "Does it work for any job posting?", answer: "Yes. Job descriptions, internal role briefs, LinkedIn posts, even Slack messages — anything text-based works. PDF and Word resumes are parsed client-side before extraction." },
      { question: "How is this different from a keyword search?", answer: "Keyword search misses synonyms (\"k8s\" vs \"Kubernetes\"), conflates skills with company names, and can't tell hard skills from soft ones. The AI groups synonyms, drops noise, and surfaces required-vs-preferred when the source distinguishes them." },
    ],
    blogSlug: "extract-skills-from-any-job-or-resume",
    blogTitle: "How to Extract Every Skill from a Job Description or Resume with AI",
  },
  "/tools/vendor-sync": {
    faqSchemaId: "tool-vendor-sync",
    faq: [
      { question: "Which vendors does Profile Sync support?", answer: "9 vendors today: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, Wellfound, Dice, GitHub, and any personal portfolio site (paste-ready blocks). Eight of those support Chrome-extension extract — we read the profile pane on your tab and merge the changes into your hired.video master. New vendors are added by registering a connector — no UI changes per vendor." },
      { question: "Do I need the Chrome extension?", answer: "Only for two-way sync. Without the extension you still get paste-ready blocks for every vendor (Headline, About / Summary / Highlights depending on the vendor, Experience entries, Skills). With the extension installed, you can also pull profile edits back into your master and — on LinkedIn / Indeed / Glassdoor / ZipRecruiter / Wellfound / Dice / Monster — auto-fill the Headline + About fields with one click." },
      { question: "Will Profile Sync overwrite my LinkedIn without asking?", answer: "No. Two safety rails: (1) Pull-back: you review the merge dialog and accept or reject each field before anything touches your master resume. (2) Push: you open the LinkedIn edit modal yourself, click Auto-fill in the dialog, and review the value before clicking Save on LinkedIn. We never auto-open modals or auto-save — same envelope as a password manager." },
      { question: "Can I sync different resumes to different vendors?", answer: "Yes. Pick a master or any variant per vendor. Profile Sync remembers which variant you posted where so you can A/B which version pulls the most callbacks." },
      { question: "What about my privacy — what does the extension send?", answer: "Toggle 'Don't share anonymous usage' in the extension's Settings to opt out of telemetry entirely. When opt-in is on we record event types (e.g. 'a picker capture happened on this host with N fields') — never the literal field values or scraped DOM content. The merge dialog itself is end-to-end your data; nothing is shared with us beyond the LLM extractor call which is bound to your account." },
    ],
    blogSlug: "sync-your-resume-everywhere-without-copy-paste",
    blogTitle: "How to Sync One Master Resume to LinkedIn, Indeed, and Every Other Job Board",
  },
  "/tools/career-360": {
    faqSchemaId: "tool-career-360",
    faq: [
      { question: "What is Career 360?", answer: "A target-driven planner. Pick the role you want next — Career 360 reads your profile and resume, scores eight recruiter signals (resume, profile, skills, experience, certs, narrative, outreach, salary), and turns the gap into a 30/60/90/180-day roadmap." },
      { question: "Where do the target suggestions come from?", answer: "An LLM proposes three candidates from your actual profile: a believable next-step (6–12 months), a stretch (12–24), and a pivot grounded in your existing skills. Nothing is invented — every suggestion ties back to a signal already on your profile." },
      { question: "Can I bring my own target?", answer: "Yes. Skip the suggestions and enter any title, seniority, and timeline. The same gap analysis and roadmap engine runs against the role you typed." },
      { question: "What changes after I close a gap?", answer: "Run the linked tool (Resume Optimizer, Profile Audit, Skill Extractor, …) and your scores update. Career 360 plots every recorded run as a sparkline under the wheel — your stamps of improvement." },
      { question: "Is Career 360 free?", answer: "Yes. The full picker, gap analysis, and roadmap are free. Pro unlocks unlimited target refreshes plus deeper coaching tools wired into each gap." },
    ],
    blogSlug: "build-a-career-roadmap-with-ai",
    blogTitle: "How to Build a Career Roadmap with AI: Targets, Gaps, and a 90-Day Plan",
  },
};
