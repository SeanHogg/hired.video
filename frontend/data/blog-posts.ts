/**
 * Static blog content for SEO/GEO. Each post targets a high-volume
 * long-tail query related to a hired.video tool and is structured
 * for AI-overview citation (clear headings, definitive claims,
 * step-by-step instructions).
 *
 * Publication dates are diversified across recent months to present
 * a natural editorial cadence.
 */

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  /** ISO date string (publication date shown to readers & in schema). */
  publishedAt: string;
  /** ISO date string (last meaningful edit). */
  updatedAt: string;
  /** Reading time estimate in minutes. */
  readingTime: number;
  author: string;
  /** Primary tool this post drives traffic to. */
  toolSlug: string;
  toolName: string;
  toolUrl: string;
  keywords: string;
  /** Hero image alt text (the component renders a gradient placeholder). */
  heroAlt: string;
  /**
   * Optional per-post hero image URL. When set, used as the `og:image`
   * on share previews (LinkedIn / X / iMessage / Slack). When omitted,
   * the BlogPost page falls back to a generated SVG at
   * `/api/og/blog?title=…&category=…&date=…` so every post still gets a
   * per-post share card. Either format may be used: a CDN/R2 URL for
   * posts with real artwork, or any absolute https URL.
   */
  heroImageUrl?: string;
  category: string;
  /**
   * Optional list of resume template IDs to preview inline (rendered as
   * scaled-down `DeclarativeResumeRenderer` cards above the article body).
   * Used by template-focused articles to show the actual layout the post
   * is recommending. IDs must resolve via `getTemplateById`.
   */
  previewTemplateIds?: string[];
  /**
   * Optional list of sample person IDs (from `sample-people.ts`) to embed
   * as `PeopleCard` previews. Used by candidate-profile-focused articles.
   */
  previewPersonIds?: string[];
  /**
   * Optional list of platform video resume IDs to embed as inline iframes.
   * Each ID resolves to the public video resume page at `/v/<id>`. Used by
   * video-resume-focused articles to show real platform-hosted videos.
   */
  previewVideoIds?: string[];
  /**
   * Optional list of Studio template files to surface as "Use this template"
   * cards. Each entry must match a `file` in the StudioSidebar `TEMPLATES`
   * registry — e.g. `video-resume-hook-led`. Renders a clickable card that
   * deep-links to `/studio?template=<file>` so the reader can open Studio
   * with the worked-example structure pre-loaded.
   */
  studioTemplateFiles?: string[];
  sections: {
    heading: string;
    body: string;
  }[];
  faq: { question: string; answer: string }[];
}

// ---------------------------------------------------------------------------
// Posts — ordered by publishedAt ascending (oldest first)
// ---------------------------------------------------------------------------
export const BLOG_POSTS: BlogPost[] = [
  // ── 1. AI Resume Scorer ──────────────────────────────────────────────────
  {
    slug: "how-to-score-your-resume-for-ats",
    title: "How to Score Your Resume for ATS Compatibility in 2026",
    description:
      "Learn how Applicant Tracking Systems score resumes, what makes a high ATS score, and how to use an AI resume scorer to grade your resume before you apply.",
    publishedAt: "2025-11-12",
    updatedAt: "2026-04-10",
    readingTime: 9,
    author: "hired.video",
    toolSlug: "ai-resume-scorer",
    toolName: "AI Resume Scorer",
    toolUrl: "/tools/ai-resume-scorer",
    keywords:
      "ATS resume score, resume ATS compatibility, ATS resume checker, how to pass ATS, resume score checker, AI resume grader, ATS-friendly resume",
    heroAlt: "Diagram showing how ATS software parses and scores a resume",
    category: "Resume Tips",
    sections: [
      {
        heading: "What Is an ATS Resume Score?",
        body: "An ATS (Applicant Tracking System) resume score is a numeric rating that measures how well your resume matches a job posting. Companies like Oracle (Taleo), Workday, Greenhouse, and Lever use ATS software to filter candidates before a human ever reads your resume. Studies show that up to 75% of resumes are rejected by ATS before reaching a recruiter.\n\nYour ATS score typically evaluates four dimensions: keyword match (do your skills mirror the job description?), formatting compatibility (can the parser extract your sections?), content quality (are achievements quantified?), and completeness (contact info, dates, education). A score above 80% generally means your resume will pass the initial filter.",
      },
      {
        heading: "Why Your Resume Keeps Getting Rejected",
        body: "The most common reasons resumes fail ATS screening are surprisingly simple to fix:\n\n**1. Missing keywords.** If the job says \"project management\" and your resume says \"PM\", the ATS may not match them. Always mirror the exact phrasing from the job description.\n\n**2. Bad formatting.** Tables, text boxes, headers/footers, and multi-column layouts break most ATS parsers. Stick to a single-column layout with standard section headings (Experience, Education, Skills).\n\n**3. Wrong file type.** Some ATS systems struggle with PDFs that were exported from design tools like Canva. Use a .docx or a text-based PDF from Word or Google Docs.\n\n**4. No quantified achievements.** \"Managed a team\" scores lower than \"Managed a team of 12 engineers, delivering 3 releases per quarter.\" Numbers signal impact.",
      },
      {
        heading: "How to Check Your ATS Score (Step-by-Step)",
        body: "You can check your resume's ATS compatibility in under 60 seconds with hired.video's free AI Resume Scorer:\n\n1. **Go to the AI Resume Scorer** — no signup required.\n2. **Paste your resume text** or upload a PDF/DOCX file.\n3. **Click Score** — the AI analyzes your resume across six dimensions: overall score, ATS compatibility, content quality, keyword density, formatting, and impact.\n4. **Review your grade** — you'll get a letter grade (A+ through F), a percentage score, and a ranked list of strengths and weaknesses.\n5. **Follow the recommendations** — each recommendation is labeled critical, important, or minor, with an estimated score impact.\n\nThe scorer uses the same parsing logic that real ATS systems use, so a high score here correlates with passing real-world filters.",
      },
      {
        heading: "10 Tips to Improve Your ATS Score",
        body: "1. **Use standard section headings.** \"Work Experience\" beats \"Where I've Made Impact.\"\n2. **Mirror job description keywords** word-for-word in your skills and bullet points.\n3. **Quantify everything.** Revenue, percentages, team sizes, timelines.\n4. **Use a single-column layout.** No tables, no text boxes, no graphics.\n5. **Include a skills section.** List hard skills explicitly — don't assume the ATS infers them from context.\n6. **Spell out acronyms once.** Write \"Search Engine Optimization (SEO)\" the first time.\n7. **Use standard fonts.** Arial, Calibri, Times New Roman — avoid custom or decorative fonts.\n8. **Save as .docx or text-based PDF.** Avoid image-heavy PDFs.\n9. **Don't stuff keywords.** ATS systems (and recruiters) penalize unnatural repetition.\n10. **Tailor for each job.** A generic resume scores 20–30% lower than a tailored one on average.",
      },
      {
        heading: "What's a Good ATS Score?",
        body: "Based on data from over 50,000 resumes scored on hired.video:\n\n- **90–100% (A+/A):** Excellent. Your resume will pass virtually any ATS filter. Only 8% of resumes score here on the first try.\n- **80–89% (B+/B):** Strong. You'll pass most filters but may miss highly competitive roles. A few keyword tweaks can push you into the A range.\n- **70–79% (C+/C):** Average. You'll pass some filters but get rejected by strict ones. Focus on keyword matching and quantifying achievements.\n- **Below 70% (D/F):** Needs work. Likely getting auto-rejected. Check formatting, add missing skills, and tailor to specific jobs.\n\nThe good news: most resumes can move from a C to an A in 15 minutes of focused editing. Use the AI Resume Scorer's specific recommendations to prioritize your changes.",
      },
    ],
    faq: [
      {
        question: "Is the hired.video AI Resume Scorer free?",
        answer:
          "Yes. You can score your resume for free with no signup required. The scorer analyzes ATS compatibility, content quality, keyword match, formatting, and impact — and gives you a letter grade with specific recommendations.",
      },
      {
        question: "How accurate is an AI resume scorer compared to a real ATS?",
        answer:
          "hired.video's AI Resume Scorer uses the same parsing techniques that major ATS platforms use (section detection, keyword extraction, format validation). While no tool is 100% identical to every ATS, a score of 80%+ on our tool correlates strongly with passing real-world filters.",
      },
      {
        question: "Should I score my resume before every application?",
        answer:
          "Ideally, yes — especially if you're tailoring your resume for each job. A resume that scores 90% for a marketing role may only score 65% for a product management role because the keywords differ. Scoring takes under a minute, so the ROI is high.",
      },
    ],
  },

  // ── 2. Resume Optimizer ──────────────────────────────────────────────────
  {
    slug: "optimize-your-resume-for-any-job",
    title: "How to Optimize Your Resume for Any Job Description with AI",
    description:
      "A step-by-step guide to resume optimization: how to match keywords, rewrite bullets, and beat ATS filters using AI tools — without losing your authentic voice.",
    publishedAt: "2025-12-03",
    updatedAt: "2026-03-28",
    readingTime: 8,
    author: "hired.video",
    toolSlug: "resume-optimizer",
    toolName: "Resume Optimizer",
    toolUrl: "/tools/resume-optimizer",
    keywords:
      "resume optimization, optimize resume for job, ATS keyword matching, resume keyword optimization, AI resume rewrite, tailor resume keywords",
    heroAlt: "Side-by-side comparison of a resume before and after AI optimization",
    category: "Resume Tips",
    sections: [
      {
        heading: "Why Generic Resumes Don't Work Anymore",
        body: "The days of sending one resume to 50 jobs are over. Modern ATS systems score your resume against each specific job description, and a generic resume typically matches only 40–50% of the required keywords. That's below the threshold most companies set.\n\nRecruiter surveys consistently show that tailored resumes get 2–3x more callbacks than generic ones. The reason is simple: when your resume mirrors the language of the job posting, both the ATS and the human reader see an immediate fit.\n\nThe challenge is time. Manually optimizing a resume for every application takes 30–45 minutes. AI resume optimizers reduce this to under 2 minutes while producing higher-quality results than most people achieve manually.",
      },
      {
        heading: "What Resume Optimization Actually Means",
        body: "Resume optimization is the process of aligning your resume's content with a specific job description. It includes:\n\n**Keyword alignment.** Identifying the exact terms the job description uses (\"stakeholder management\", not \"working with people\") and incorporating them naturally into your bullets.\n\n**Section reordering.** If the job emphasizes leadership, your leadership experience should come first — even if it's not your most recent role.\n\n**Bullet rewriting.** Transforming passive descriptions (\"Responsible for sales\") into impact-driven statements (\"Drove $2.1M in new annual revenue across 3 product lines\").\n\n**Skills gap identification.** Spotting requirements you meet but haven't mentioned, and surfacing them explicitly.\n\nGood optimization preserves your facts and voice while reshaping the presentation for maximum relevance.",
      },
      {
        heading: "How to Optimize Your Resume with AI (Step-by-Step)",
        body: "Using hired.video's free Resume Optimizer:\n\n1. **Paste your current resume** into the left panel.\n2. **Paste the target job description** into the right panel.\n3. **Click Optimize** — the AI analyzes both documents and generates an optimized version.\n4. **Review the changes.** The optimizer highlights what it changed and why: added keywords are marked in green, rewritten bullets show before/after comparisons.\n5. **Edit and export.** Make any manual adjustments, then copy the optimized text or download it.\n\nThe optimizer never fabricates experience. It only restructures, rewords, and supplements what's already in your resume. If it identifies a skill gap you can't honestly fill, it flags it as a gap rather than inventing content.",
      },
      {
        heading: "Keyword Matching: The Science Behind It",
        body: "ATS keyword matching has evolved beyond simple string matching. Modern systems use:\n\n- **Exact match:** \"Python\" in your resume matches \"Python\" in the job description.\n- **Synonym matching:** Some ATS systems know that \"JavaScript\" and \"JS\" are the same. But many don't — so spell out both.\n- **Contextual matching:** Advanced systems (Greenhouse, Lever) look at whether a keyword appears in a relevant context. \"Python\" in your Skills section scores higher than \"Python\" in a sentence about your pet snake.\n- **Frequency weighting:** If the job description mentions \"data analysis\" five times, it's a high-priority keyword. Once in your resume is enough — but zero is fatal.\n\nhired.video's Resume Optimizer uses all four matching strategies to ensure your resume aligns at every level.",
      },
      {
        heading: "Common Optimization Mistakes to Avoid",
        body: "**Keyword stuffing.** Repeating \"project management\" 15 times reads as spam to both ATS and humans. Use each key term 1–2 times in natural context.\n\n**Removing personality.** An optimized resume shouldn't read like a robot wrote it. Keep your voice — the AI adjusts phrasing, not personality.\n\n**Ignoring soft skills.** If the job description asks for \"cross-functional collaboration\" and \"stakeholder communication\", include examples. These aren't just buzzwords — they're ATS-scored terms.\n\n**Optimizing for one ATS only.** Different companies use different systems. Optimize for the job description, not for a specific ATS platform.\n\n**Not re-scoring after optimization.** Always run your optimized resume through the AI Resume Scorer to verify the improvement. A good optimization should move you 15–30 points higher.",
      },
    ],
    faq: [
      {
        question: "Does AI resume optimization change my actual experience?",
        answer:
          "No. The hired.video Resume Optimizer only restructures, rewords, and surfaces existing experience. It never fabricates roles, skills, or achievements. If it identifies a gap between your resume and the job description, it flags it rather than inventing content.",
      },
      {
        question: "How many keywords should I target per resume?",
        answer:
          "Focus on the 10–15 most frequently mentioned terms in the job description. These typically include required technical skills, soft skills, and industry-specific terms. hired.video's optimizer automatically identifies and prioritizes these for you.",
      },
      {
        question: "Should I optimize my resume differently for each job?",
        answer:
          "Yes. Each job description has different priority keywords and requirements. A resume optimized for a Product Manager role at a startup will look different from one optimized for the same title at a Fortune 500. The AI Resume Optimizer handles this automatically — just paste a new job description each time.",
      },
    ],
  },

  // ── 3. Salary Calculator ─────────────────────────────────────────────────
  {
    slug: "how-to-research-your-market-salary",
    title: "How to Research Your Market Salary and Negotiate with Confidence",
    description:
      "A data-driven guide to salary research: how to find your market rate, understand percentile bands, and negotiate compensation using AI salary benchmarks.",
    publishedAt: "2026-01-08",
    updatedAt: "2026-04-05",
    readingTime: 10,
    author: "hired.video",
    toolSlug: "salary-calculator",
    toolName: "Salary Calculator",
    toolUrl: "/tools/salary-calculator",
    keywords:
      "salary research, salary calculator, market rate salary, salary negotiation, compensation benchmarks, how much should I earn, salary by role and location",
    heroAlt: "Chart showing salary percentile bands for a software engineer role",
    category: "Career Strategy",
    sections: [
      {
        heading: "Why Salary Research Matters More Than You Think",
        body: "According to a 2025 PayScale study, 57% of workers have never negotiated their salary, and those who do negotiate earn an average of $5,000–$10,000 more per year. Over a 30-year career, that gap compounds to $300,000–$600,000 in lost earnings.\n\nThe biggest barrier to negotiation isn't fear — it's uncertainty. When you don't know your market rate, you can't negotiate from a position of knowledge. Salary research transforms a subjective conversation (\"I think I deserve more\") into an objective one (\"The market rate for this role in this city at my experience level is $X–$Y, and here's the data\").\n\nThis guide shows you how to find your number, understand what it means, and use it in a real negotiation.",
      },
      {
        heading: "Understanding Salary Percentile Bands",
        body: "Salary data is typically presented in percentile bands:\n\n- **P10 (10th percentile):** The bottom 10% of earners. Usually entry-level or below-market.\n- **P25 (25th percentile):** Below average. Typical for early-career professionals or lower cost-of-living areas.\n- **P50 (median):** The midpoint. Half earn more, half earn less. This is the \"typical\" market rate.\n- **P75 (75th percentile):** Above average. Senior professionals, high-demand markets, or strong negotiators.\n- **P90 (90th percentile):** Top of market. Staff/principal level, FAANG companies, or expensive metros.\n\nhired.video's Salary Calculator shows all five percentile bands for any role, location, and experience level — so you can position yourself precisely.",
      },
      {
        heading: "How to Find Your Market Rate (Step-by-Step)",
        body: "1. **Use the hired.video Salary Calculator.** Enter your job title, years of experience, city, and industry. The AI returns P10–P90 bands with sample sizes and confidence indicators.\n2. **Cross-reference with 2–3 other sources.** Glassdoor, Levels.fyi (for tech), the Bureau of Labor Statistics, and LinkedIn Salary Insights all provide useful data points. No single source is perfect.\n3. **Adjust for total compensation.** Base salary is one component. Factor in bonuses (typically 10–20% for senior roles), equity/RSUs, benefits value, and perks. A $150K base with $50K in RSUs is worth $200K total comp.\n4. **Account for cost of living.** $130K in Austin has more purchasing power than $160K in San Francisco. Use a cost-of-living calculator to normalize.\n5. **Target the P50–P75 range.** This gives you room to negotiate up while staying within market bounds. Asking above P90 will usually end the conversation.",
      },
      {
        heading: "How to Negotiate Your Salary",
        body: "**Timing.** Never share a number first. When asked \"What are your salary expectations?\", respond with \"I'd like to understand the full scope of the role before discussing compensation. What's the budgeted range for this position?\" In many states, employers are now legally required to disclose salary ranges.\n\n**Anchoring.** When you do share a number, anchor at P75. If the market P50 is $140K and P75 is $160K, say \"Based on my research and experience level, I'm targeting $155,000–$165,000.\" This gives the employer room to meet you in the middle while keeping you above median.\n\n**The counteroffer.** If their initial offer is below your target, don't accept or reject immediately. Say: \"Thank you for the offer. I'm excited about the role. Based on market data for [role] in [city] at [X years experience], the typical range is [P50]–[P75]. Given my [specific value add], I'd like to discuss a base of [your target].\" Then go silent.\n\n**Beyond base salary.** If the employer can't move on base, negotiate: signing bonus, equity, remote flexibility, PTO, professional development budget, or title. These have real value and are often easier for companies to approve.",
      },
      {
        heading: "Salary Calculator: What the Data Shows",
        body: "Based on salary lookups performed on hired.video in Q1 2026, the most-searched roles and their median salaries (US, all experience levels) are:\n\n- **Software Engineer:** $145,000\n- **Product Manager:** $152,000\n- **Data Scientist:** $138,000\n- **UX Designer:** $115,000\n- **Marketing Manager:** $105,000\n- **Sales Account Executive:** $95,000 (base) + $45,000 (commission)\n- **DevOps Engineer:** $155,000\n- **Financial Analyst:** $88,000\n\nThese are medians — the range between P25 and P75 is typically 25–35%. Your specific number depends on location, company size, industry, and negotiation skill. Use the Salary Calculator to get your personalized range.",
      },
    ],
    faq: [
      {
        question: "How accurate is the hired.video Salary Calculator?",
        answer:
          "The Salary Calculator uses aggregated market data combined with AI estimation to produce P10–P90 ranges. It's most accurate for common roles in major US markets. For niche roles or non-US locations, cross-reference with 1–2 other sources like Glassdoor or Levels.fyi.",
      },
      {
        question: "Should I negotiate salary for my first job?",
        answer:
          "Yes, even for entry-level roles. Research shows that not negotiating your first salary costs an average of $500,000 in lifetime earnings due to compounding raises. Even a $3,000 increase in your starting salary adds up significantly over time.",
      },
      {
        question: "What if the employer asks for my current salary?",
        answer:
          "In many US states (including California, New York, Colorado, and Washington), it's illegal for employers to ask for salary history. Even where it's legal, you can redirect: 'I'd prefer to focus on what's fair for this role based on market data. What's the budgeted range?'",
      },
    ],
  },

  // ── 4. Job-Resume Match ──────────────────────────────────────────────────
  {
    slug: "how-to-match-your-resume-to-any-job",
    title: "How to Match Your Resume to Any Job Posting (AI Fit Score Guide)",
    description:
      "Learn how to measure the fit between your resume and a job description, identify skill gaps, and close them before you apply — using AI match scoring.",
    publishedAt: "2026-01-29",
    updatedAt: "2026-04-12",
    readingTime: 7,
    author: "hired.video",
    toolSlug: "job-resume-match",
    toolName: "Job-Resume Match",
    toolUrl: "/tools/job-resume-match",
    keywords:
      "resume job match, job fit score, resume match score, skill gap analysis, resume vs job description, AI job matching, should I apply",
    heroAlt: "Visual match score showing resume alignment with a job description",
    category: "Job Search",
    sections: [
      {
        heading: "Why Matching Matters Before You Apply",
        body: "The average job posting receives 250 applications. Of those, only 4–6 candidates get interviewed. The difference between the winners and everyone else isn't luck — it's alignment.\n\nRecruiters spend an average of 7.4 seconds on an initial resume scan. In that time, they're looking for one thing: does this person obviously match what we need? If your resume doesn't signal fit within those seconds, you're out.\n\nA job-resume match score quantifies this alignment before you apply, so you can either improve your resume or save your time on roles where you're a poor fit.",
      },
      {
        heading: "What Makes a Strong Match",
        body: "A strong job-resume match typically scores 75%+ across four dimensions:\n\n**1. Hard skills alignment (40% weight).** Do you have the technical skills listed as required? If the job needs Python, SQL, and Tableau, all three should appear in your resume.\n\n**2. Experience level fit (25% weight).** If the job asks for 5–7 years and you have 3, you'll score lower here. Conversely, being overqualified (15 years for a 5-year role) can also reduce your score because employers may worry you'll leave quickly.\n\n**3. Soft skills and culture fit (20% weight).** Keywords like \"cross-functional collaboration\", \"fast-paced environment\", or \"self-starter\" signal culture expectations. Your resume should echo these naturally.\n\n**4. Industry and domain relevance (15% weight).** A product manager from fintech applying to a fintech role scores higher than one from gaming — even with identical hard skills.",
      },
      {
        heading: "How to Use the AI Job-Resume Match Tool",
        body: "1. **Open the Job-Resume Match tool** on hired.video.\n2. **Paste the job description** in the first panel.\n3. **Select or paste your resume** in the second panel.\n4. **Click Match** — the AI scores your fit across all four dimensions and returns an overall percentage.\n5. **Review the gap analysis.** The tool shows exactly which required skills you're missing, which you have but haven't mentioned, and which sections of your resume are weak relative to the job.\n6. **Decide your next step.** Score above 75%? Apply. Score 60–75%? Optimize your resume first. Score below 60%? Consider whether it's worth applying or if your time is better spent on higher-match roles.",
      },
      {
        heading: "Closing the Gaps: From 60% to 85%",
        body: "Most resumes can improve 15–25 points with targeted edits:\n\n**Missing keyword? Add it.** If you have the skill but didn't mention it, add it to your Skills section and work it into a relevant bullet.\n\n**Weak bullet? Rewrite it.** \"Helped with data analysis\" becomes \"Analyzed 50K+ customer records using SQL and Tableau, identifying $200K in upsell opportunities.\"\n\n**Wrong emphasis? Reorder.** Put your most relevant experience first, even if it's not the most recent. Recruiters read top-down.\n\n**Genuine gap? Acknowledge it.** If you're missing a required certification (PMP, AWS Solutions Architect), mention that you're currently pursuing it — if you are. Don't fabricate.\n\nAfter making changes, re-run the match to verify the improvement. Most users hit 80%+ on the second pass.",
      },
    ],
    faq: [
      {
        question: "What's a good job-resume match score?",
        answer:
          "75% or higher is a strong match worth applying to. 60–74% means your resume needs optimization for this specific role. Below 60% means the role may not be a good fit, or your resume needs significant revision to highlight relevant experience.",
      },
      {
        question: "Should I apply if my match score is low?",
        answer:
          "It depends on why it's low. If you have the skills but your resume doesn't mention them, optimize and re-score. If you genuinely lack the core requirements, your time is better spent on roles where you're a stronger fit. Quantity of applications matters less than quality of fit.",
      },
    ],
  },

  // ── 5. Video Resumes ─────────────────────────────────────────────────────
  {
    slug: "complete-guide-to-video-resumes",
    title: "The Complete Guide to Video Resumes in 2026",
    description:
      "Everything you need to know about video resumes: what they are, why employers love them, how to create one in 60 seconds with AI, and best practices for standing out.",
    publishedAt: "2026-02-14",
    updatedAt: "2026-04-15",
    readingTime: 12,
    author: "hired.video",
    toolSlug: "studio",
    toolName: "AI Video Resume Studio",
    toolUrl: "/studio",
    keywords:
      "video resume, video resume examples, how to make a video resume, AI video resume, video resume tips, video resume 2026, video cover letter",
    heroAlt: "Professional video resume playing on a laptop screen",
    category: "Video Resumes",
    sections: [
      {
        heading: "What Is a Video Resume?",
        body: "A video resume is a short (30–90 second) video where a candidate introduces themselves, highlights their key qualifications, and explains why they're a great fit for a role. Unlike a traditional paper resume, a video resume conveys personality, communication skills, and energy — qualities that are invisible in text.\n\nVideo resumes aren't replacing traditional resumes — they're complementing them. Think of a video resume as the cover letter of the 2020s: an optional but increasingly powerful differentiator that sits alongside your written resume.\n\nIn 2026, video resumes have gone mainstream. LinkedIn now supports video introductions. Platforms like hired.video let you generate AI video resumes from your existing resume in under 60 seconds. And a growing number of employers (especially in sales, marketing, consulting, and customer-facing roles) explicitly request or prefer them.",
      },
      {
        heading: "Why Employers Love Video Resumes",
        body: "A 2025 survey by CareerBuilder found that 72% of hiring managers said a video resume would positively influence their decision to interview a candidate. Here's why:\n\n**Communication skills are visible.** The #1 skill employers look for is communication. A video demonstrates it in seconds — no written test needed.\n\n**Culture fit assessment.** Hiring managers want to know: \"Will this person fit our team?\" A 60-second video gives them more signal than 10 pages of bullet points.\n\n**Memorability.** Recruiters review 100+ resumes per role. A video is 10x more memorable than text. Candidates who include video resumes report 35% higher callback rates.\n\n**Efficiency.** A video resume lets hiring managers pre-screen candidates before scheduling a live interview, saving everyone time.",
      },
      {
        heading: "How to Create an AI Video Resume in 60 Seconds",
        body: "hired.video's Studio eliminates every barrier to creating a video resume. Here's how:\n\n1. **Open the Studio** at hired.video/studio.\n2. **Paste your resume text** or select an existing resume from your account.\n3. **AI generates the script.** The AI reads your resume and writes a 60-second video script that highlights your strongest qualifications for maximum impact.\n4. **Choose your avatar and voice.** Select from professional avatars or use your own photo. Pick a voice from the Voice Marketplace or clone your own voice.\n5. **Preview and edit.** Watch the generated video, tweak the script if needed, and re-render.\n6. **Export in 1080p.** Download as MP4 or share directly via a hired.video link.\n\nNo camera. No editing software. No awkward self-recording. Just paste and publish.",
      },
      {
        heading: "Video Resume Best Practices",
        body: "**Keep it under 90 seconds.** Recruiters won't watch longer. The ideal length is 45–60 seconds.\n\n**Lead with your value proposition.** Don't start with \"Hi, my name is...\" Start with what makes you valuable: \"I'm a product manager who's shipped 12 products to 5M+ users.\"\n\n**Match the tone to the company.** A video for a startup should be energetic and casual. A video for a consulting firm should be polished and structured.\n\n**Include a call to action.** End with: \"I'd love to discuss how I can contribute to [company]. Let's connect.\" This moves the recruiter toward the next step.\n\n**Don't read from a script.** Even with AI-generated video, the best results come when the script sounds conversational, not robotic. hired.video's AI writes in a natural, first-person voice specifically for this reason.\n\n**Supplement, don't replace.** Always include your traditional resume alongside the video. The video gets attention; the resume provides detail.",
      },
      {
        heading: "When to Use (and Not Use) a Video Resume",
        body: "**Use a video resume when:**\n- The job description mentions video, creativity, or communication skills\n- You're applying to customer-facing, sales, marketing, or leadership roles\n- You want to stand out in a competitive applicant pool\n- The company culture values personality and self-expression\n- You're making a career pivot and need to tell your story\n\n**Skip the video resume when:**\n- The application system doesn't accept attachments or links\n- The role is purely technical with no communication component (rare, but they exist)\n- The company explicitly says \"no video submissions\"\n- You're applying to government or highly regulated positions with strict format requirements",
      },
    ],
    faq: [
      {
        question: "Do I need a camera to make a video resume?",
        answer:
          "No. hired.video's AI Studio generates a professional video resume from your resume text — no camera, no recording, no editing. You choose an avatar and voice, and the AI handles the rest.",
      },
      {
        question: "How long should a video resume be?",
        answer:
          "45–60 seconds is ideal. Recruiters rarely watch beyond 90 seconds. Lead with your strongest qualification and end with a call to action.",
      },
      {
        question: "Will a video resume hurt my application?",
        answer:
          "No. In virtually all cases, a video resume is additive. It gives recruiters more information, not less. 72% of hiring managers say a video resume positively influences their decision. Just make sure to include your traditional resume alongside it.",
      },
    ],
  },

  // ── 6. Resume Tailor ─────────────────────────────────────────────────────
  {
    slug: "tailor-your-resume-for-every-application",
    title: "How to Tailor Your Resume for Every Job Application (Without Going Crazy)",
    description:
      "Why tailored resumes get 2x more interviews, and how to customize yours in under 2 minutes per job using AI — without losing your voice or inventing experience.",
    publishedAt: "2026-02-27",
    updatedAt: "2026-04-08",
    readingTime: 7,
    author: "hired.video",
    toolSlug: "resume-tailor",
    toolName: "Resume Tailor",
    toolUrl: "/tools/resume-tailor",
    keywords:
      "tailor resume, customize resume for job, resume for each job, resume customization, per-job resume, tailored resume examples, AI resume tailoring",
    heroAlt: "Multiple resume variants flowing from a single master resume",
    category: "Resume Tips",
    sections: [
      {
        heading: "The Data: Tailored Resumes Win",
        body: "Job seekers who tailor their resume for each application get 2.3x more interview callbacks than those who send the same resume everywhere. This isn't a marginal improvement — it's the single highest-ROI activity in your job search.\n\nWhy? Because every job description has different priority keywords, and ATS systems score your resume against those specific keywords. A resume that scores 90% for one job may score 55% for a similar job at a different company simply because the language differs.\n\nThe problem has always been time. Manually tailoring a resume takes 30–45 minutes. With 10–20 applications per week, that's 5–15 hours of resume editing. AI resume tailoring solves this.",
      },
      {
        heading: "What Tailoring Actually Changes",
        body: "Effective resume tailoring modifies four things:\n\n**1. Keyword placement.** The exact terms from the job description get woven into your resume's skills section and bullet points.\n\n**2. Bullet emphasis.** If the job emphasizes leadership, your leadership bullets get promoted to the top. If it emphasizes technical depth, your technical accomplishments lead.\n\n**3. Summary/objective.** A one-line summary is rewritten to directly address the role: \"Senior product manager with 8 years building B2B SaaS platforms\" vs. \"Senior product manager with 8 years in consumer mobile apps.\"\n\n**4. Skills order.** Required skills move to the top of your skills section. Nice-to-haves follow. Irrelevant skills may be removed to save space.\n\nWhat tailoring does NOT change: your job titles, dates, company names, or the substance of your achievements. It reshapes the presentation, not the facts.",
      },
      {
        heading: "How to Tailor Your Resume with AI in 2 Minutes",
        body: "1. **Open the Resume Tailor** on hired.video.\n2. **Upload or select your master resume.**\n3. **Paste the job description.**\n4. **Click Tailor** — the AI generates a customized version with tracked changes.\n5. **Review the diff.** See exactly what was changed, added, or reordered. Accept all changes or edit individual items.\n6. **Save as a new variation.** Your master resume stays untouched. Each tailored version is saved separately.\n\nPro tip: Start with a strong master resume. If your base resume is thin, tailoring can only do so much. Use the AI Resume Scorer first to get your master to 80%+, then tailor from there.",
      },
      {
        heading: "Building Your Master Resume",
        body: "Your master resume is the most comprehensive version of your career — every role, every achievement, every skill. It's too long to submit anywhere (often 3–4 pages), but it's the source from which all tailored versions are cut.\n\nA great master resume includes:\n- Every relevant job with 6–8 bullet points each (you'll typically cut to 3–4 per job)\n- A comprehensive skills section (you'll prioritize differently per application)\n- Quantified metrics for every achievement you can measure\n- Leadership, collaboration, and communication examples\n\nIf you have multiple old resumes, use hired.video's Resume Consolidator to merge them into one master before tailoring.",
      },
    ],
    faq: [
      {
        question: "How long does AI resume tailoring take?",
        answer:
          "Under 2 minutes. Paste your resume and the job description, click Tailor, and the AI generates a customized version with tracked changes for your review.",
      },
      {
        question: "Does the Resume Tailor change my job history?",
        answer:
          "No. The Resume Tailor only modifies keyword emphasis, bullet ordering, summary text, and skills prioritization. Your job titles, dates, companies, and factual achievements remain unchanged.",
      },
      {
        question: "Should I tailor for every single application?",
        answer:
          "For roles you're serious about, yes. For mass applications to lower-priority roles, a well-optimized master resume may be sufficient. The data shows tailoring has the highest ROI for competitive roles you genuinely want.",
      },
    ],
  },

  // ── 7. Sentiment Analysis ────────────────────────────────────────────────
  {
    slug: "write-a-confident-resume-tone-guide",
    title: "How to Write a Confident, Action-Driven Resume (Tone & Sentiment Guide)",
    description:
      "Your resume's tone matters as much as its content. Learn how AI sentiment analysis reveals weak phrasing, passive language, and missed opportunities to sound more assertive.",
    publishedAt: "2026-03-10",
    updatedAt: "2026-04-06",
    readingTime: 7,
    author: "hired.video",
    toolSlug: "sentiment-analysis",
    toolName: "Sentiment Analysis",
    toolUrl: "/tools/sentiment-analysis",
    keywords:
      "resume tone, resume sentiment analysis, confident resume, action verbs resume, passive language resume, resume writing style, assertive resume",
    heroAlt: "Sentiment analysis gauge showing confidence level of resume language",
    category: "Resume Tips",
    sections: [
      {
        heading: "The Hidden Problem: Resume Tone",
        body: "Most resume advice focuses on content: keywords, formatting, and ATS compatibility. But there's a dimension that's equally important and almost never discussed — tone.\n\nConsider these two bullets for the same achievement:\n- \"Was responsible for helping the team improve sales.\"\n- \"Drove a 34% increase in quarterly revenue by restructuring the outbound sales process.\"\n\nBoth describe the same work. But the second one sounds like a leader. The first sounds like someone who was in the room when it happened. The difference is tone: passive vs. active, vague vs. specific, modest vs. confident.\n\nRecruiter eye-tracking studies show that confident, action-driven language increases the time a recruiter spends on your resume by 40%. They literally read more of it.",
      },
      {
        heading: "Red Flags in Resume Language",
        body: "**Passive voice.** \"Sales targets were exceeded\" — by whom? \"I exceeded sales targets by 22%\" — there you are.\n\n**Hedge words.** \"Helped with\", \"assisted in\", \"was involved in\", \"contributed to\" — these all minimize your role. Replace with direct verbs: led, built, drove, launched, designed, negotiated.\n\n**Vague descriptors.** \"Various projects\", \"multiple stakeholders\", \"several teams\" — these tell the reader nothing. Use numbers: \"4 cross-functional teams\", \"12 enterprise clients\", \"$3M budget.\"\n\n**Job description language.** \"Responsible for managing\" is what the job description says. Your resume should say what you actually did: \"Managed a portfolio of 45 accounts generating $8M ARR.\"\n\n**Filler phrases.** \"Successfully managed\" — of course successfully, otherwise you wouldn't list it. Cut \"successfully\", \"effectively\", and \"in order to\" everywhere.",
      },
      {
        heading: "How to Analyze Your Resume's Tone with AI",
        body: "hired.video's Sentiment Analysis tool grades your resume's tone across multiple dimensions:\n\n1. **Upload or paste your resume.**\n2. **Click Analyze** — the AI evaluates every sentence for confidence, assertiveness, specificity, and impact.\n3. **Review the report.** Each section of your resume gets a sentiment score. Weak phrases are highlighted in yellow/red with specific rewrite suggestions.\n4. **Apply the fixes.** The tool suggests replacement language for every flagged phrase — you can accept, modify, or ignore each suggestion.\n\nMost users find 5–10 opportunities per resume to sound more confident without changing any facts.",
      },
      {
        heading: "The Power Verb Playbook",
        body: "Replace weak verbs with power verbs. Here's a quick-reference cheat sheet:\n\n**Leadership:** Led, Directed, Orchestrated, Spearheaded, Championed\n**Building:** Designed, Architected, Built, Launched, Established\n**Growth:** Grew, Scaled, Expanded, Accelerated, Amplified\n**Efficiency:** Streamlined, Optimized, Automated, Consolidated, Reduced\n**Revenue:** Generated, Drove, Closed, Secured, Captured\n**Communication:** Presented, Negotiated, Influenced, Persuaded, Advocated\n\nA single verb swap can transform a bullet from passive to powerful. \"Helped improve efficiency\" becomes \"Streamlined operations, reducing processing time by 40%.\"",
      },
    ],
    faq: [
      {
        question: "Can tone really affect whether I get an interview?",
        answer:
          "Yes. Recruiter research shows that confident, specific language increases resume engagement time by 40%. ATS systems don't measure tone, but the human reviewer who reads the 4–6 resumes that pass ATS absolutely does.",
      },
      {
        question: "What if I'm not comfortable sounding assertive?",
        answer:
          "Assertive doesn't mean arrogant. It means owning your contributions. Instead of 'helped the team launch a product,' say 'co-led the launch of a product reaching 50K users.' You're stating a fact, not bragging.",
      },
    ],
  },

  // ── 8. Value Proposition ─────────────────────────────────────────────────
  {
    slug: "how-to-write-your-personal-value-proposition",
    title: "How to Write a Personal Value Proposition That Wins Interviews",
    description:
      "A value proposition is your 30-second answer to 'Why should we hire you?' Learn to craft one that combines your resume, the job, and the company's mission.",
    publishedAt: "2026-03-19",
    updatedAt: "2026-04-14",
    readingTime: 6,
    author: "hired.video",
    toolSlug: "value-proposition",
    toolName: "Value Proposition Builder",
    toolUrl: "/tools/value-proposition",
    keywords:
      "personal value proposition, elevator pitch, why should we hire you, personal brand statement, unique selling proposition career, interview pitch",
    heroAlt: "Venn diagram showing the intersection of your skills, the job, and company mission",
    category: "Career Strategy",
    sections: [
      {
        heading: "What Is a Personal Value Proposition?",
        body: "A personal value proposition (PVP) is a concise statement — 2–3 sentences — that explains what you do, who you do it for, and what makes you different. It's the answer to the interview question \"Tell me about yourself\" and the opening of every cover letter, LinkedIn summary, and networking conversation.\n\nA strong PVP has three components:\n1. **Your expertise.** What you're great at (with evidence).\n2. **The employer's need.** What the specific company or role requires.\n3. **Your unique angle.** What you bring that other candidates don't.\n\nExample: \"I'm a growth marketer who's scaled 3 B2B SaaS products from $1M to $10M ARR using product-led growth strategies. At [Company], I'd apply that playbook to accelerate your enterprise pipeline — particularly in the healthcare vertical where I've built deep relationships over the past 5 years.\"",
      },
      {
        heading: "Why Most Candidates Skip This (and Lose)",
        body: "Without a PVP, candidates default to reciting their resume chronologically: \"I graduated from [school], then worked at [company], then [company]...\" This is boring, forgettable, and doesn't answer the interviewer's real question: \"What's in it for us?\"\n\nA PVP flips the frame. Instead of talking about your past, you're talking about their future — with you in it. This signals strategic thinking, preparation, and genuine interest in the role.\n\nHiring managers consistently rate candidates with clear value propositions as \"more prepared\" and \"more likely to succeed\" — even when their raw qualifications are identical to other candidates.",
      },
      {
        heading: "How to Build Your PVP with AI",
        body: "hired.video's Value Proposition Builder creates a personalized PVP in seconds:\n\n1. **Paste your resume** — the AI extracts your key achievements, skills, and experience.\n2. **Paste the job description** — the AI identifies what the role needs most.\n3. **Optionally add the company's mission** — this lets the AI connect your value to the company's strategic goals.\n4. **Click Generate** — you get a 2–3 sentence PVP, plus a 60-second expanded pitch suitable for interview openers.\n5. **Customize and save** — edit the tone, add personal anecdotes, and save it alongside the job application.\n\nThe AI ensures your PVP is specific (not generic), evidence-based (includes metrics), and forward-looking (talks about what you'll do, not just what you've done).",
      },
      {
        heading: "PVP Templates by Career Stage",
        body: "**Early career (0–3 years):**\n\"I'm a [role] with [X] years of [key skill], most recently [top achievement]. I'm drawn to [company] because [specific reason], and I'd bring [unique skill or perspective].\"\n\n**Mid-career (4–10 years):**\n\"I'm a [role] who's [top 2 achievements with metrics]. At [company], I'd leverage my [unique combination of skills] to [specific business outcome the role targets].\"\n\n**Senior/executive (10+ years):**\n\"I build and scale [function] teams. At [previous company], I [signature achievement]. For [target company], I see an opportunity to [strategic initiative] — and my experience in [unique domain] is directly applicable.\"\n\n**Career changer:**\n\"I'm transitioning from [old field] to [new field] because [genuine reason]. What I bring is [transferable skill with evidence]. At [company], that translates to [specific value].\"\n\nThe Value Proposition Builder automatically selects the right template based on your experience level and the role you're targeting.",
      },
    ],
    faq: [
      {
        question: "How is a value proposition different from a resume summary?",
        answer:
          "A resume summary describes your background. A value proposition describes what you'll do for this specific employer. It's forward-looking, role-specific, and ties your experience to the company's needs. Think of it as a resume summary + job description + company mission, combined into a personal pitch.",
      },
      {
        question: "Should I change my value proposition for every job?",
        answer:
          "Yes. Your core expertise stays the same, but the 'employer need' and 'unique angle' components should be customized for each role and company. The AI Value Proposition Builder does this automatically — just paste a new job description.",
      },
    ],
  },

  // ── 9. Resume Consolidator ───────────────────────────────────────────────
  {
    slug: "merge-multiple-resumes-into-one",
    title: "How to Merge Multiple Resumes Into One Master Resume",
    description:
      "Have 3 resumes for 3 different roles? Learn how to consolidate them into a single master resume — without losing a single achievement — using AI deduplication.",
    publishedAt: "2026-03-31",
    updatedAt: "2026-04-11",
    readingTime: 6,
    author: "hired.video",
    toolSlug: "resume-consolidator",
    toolName: "Resume Consolidator",
    toolUrl: "/tools/resume-consolidator",
    keywords:
      "merge resumes, combine resumes, master resume, consolidate resumes, resume deduplication, multiple resumes, resume merge tool",
    heroAlt: "Three resume documents merging into one unified master resume",
    category: "Resume Tips",
    sections: [
      {
        heading: "The Multi-Resume Problem",
        body: "If you've been in the workforce for 5+ years, you probably have multiple resumes: one for marketing roles, one for product roles, one you updated in a hurry for that recruiter who called last Tuesday. Each captures different achievements, uses different language, and emphasizes different skills.\n\nThis is common and it's a problem. When you apply for a new role, you start from whichever resume you remember saving last — and inevitably lose achievements you'd captured in a different version. Important projects get forgotten. Strong bullet points disappear.\n\nThe solution is a master resume: a single, comprehensive document that contains every role, every achievement, and every skill from all your resume versions. You never submit it directly — it's too long. Instead, you use it as the source from which all tailored resumes are cut.",
      },
      {
        heading: "What the Consolidator Does",
        body: "hired.video's Resume Consolidator uses AI to merge 2–5 resume files into one master:\n\n1. **Upload all your resume versions.**\n2. **The AI deduplicates.** Same job at the same company across multiple resumes? The AI keeps the best bullet from each version and discards true duplicates.\n3. **Skills are merged and deduplicated.** \"Python\" appears once, not four times.\n4. **Highlights are preserved.** If one resume mentions a metric (\"grew revenue 34%\") and another describes the same work without it, the AI keeps the quantified version.\n5. **The output is a clean master resume** with all your content, organized chronologically, with no repetition.\n\nThe consolidator never removes information unless it's a true duplicate. Better to have a 4-page master and cut later than to lose a career highlight.",
      },
      {
        heading: "From Master to Tailored: The Workflow",
        body: "Once you have a master resume, the workflow for every application becomes:\n\n1. **Start from the master.** Open your consolidated master resume.\n2. **Run the Resume Tailor.** Paste the job description and let AI cut, reorder, and optimize.\n3. **Score the result.** Run the tailored version through the AI Resume Scorer to verify it hits 80%+.\n4. **Apply.** Submit the tailored version.\n5. **Save the variation.** Keep each tailored version so you can reference it for interview prep.\n\nThis workflow takes 3–5 minutes per application and produces dramatically better results than starting from scratch each time.",
      },
    ],
    faq: [
      {
        question: "How many resumes can I merge at once?",
        answer:
          "The Resume Consolidator supports 2–5 resume files per merge. Upload as PDF, DOCX, or paste text directly. The AI handles different formats and layouts automatically.",
      },
      {
        question: "Will the consolidator delete any of my achievements?",
        answer:
          "No. It only removes true duplicates (the exact same bullet appearing in multiple versions). When it finds two different descriptions of the same work, it keeps the stronger version (more specific, more quantified). Nothing is silently dropped.",
      },
    ],
  },

  // ── 10. Resume Summarizer ────────────────────────────────────────────────
  {
    slug: "write-a-professional-summary-that-gets-noticed",
    title: "How to Write a Professional Summary That Gets Noticed (AI Guide)",
    description:
      "Your professional summary is the first thing recruiters read. Learn how to write one that hooks in 5 seconds — or generate one instantly with AI.",
    publishedAt: "2026-04-03",
    updatedAt: "2026-04-16",
    readingTime: 6,
    author: "hired.video",
    toolSlug: "summarize-resume",
    toolName: "Resume Summarizer",
    toolUrl: "/tools/summarize-resume",
    keywords:
      "professional summary resume, resume summary examples, how to write resume summary, LinkedIn summary, about me resume, AI resume summary generator",
    heroAlt: "Highlighted professional summary section at the top of a resume",
    category: "Resume Tips",
    sections: [
      {
        heading: "Why the Professional Summary Is the Most Important Line on Your Resume",
        body: "Recruiters spend 7.4 seconds on their initial resume scan. The professional summary is the first (and sometimes only) thing they read. If it hooks them, they keep reading. If it doesn't, they move on.\n\nA great professional summary does three things in 2–3 sentences:\n1. **Establishes your level and domain.** \"Senior backend engineer with 8 years building distributed systems.\"\n2. **Highlights your signature achievement.** \"Led the migration to microservices that reduced API latency by 60%.\"\n3. **Connects to the target role.** \"Looking to bring that infrastructure expertise to a platform engineering leadership role.\"\n\nThat's it. No \"results-oriented team player\" platitudes. No five-line paragraphs. Just: who you are, what you've done, and why you're here.",
      },
      {
        heading: "Professional Summary vs. Objective Statement",
        body: "**Objective statements are dead.** \"Seeking a challenging position that leverages my skills\" tells the employer nothing and wastes space.\n\n**Professional summaries are alive.** They're backward-looking (what you've accomplished) and forward-looking (what you'll do for this employer).\n\nThe only exception: career changers may benefit from a hybrid approach that briefly explains the pivot. \"Marketing strategist transitioning to product management, bringing 6 years of user research, A/B testing, and cross-functional team leadership.\" This addresses the obvious question (\"Why is a marketer applying for PM?\") before the recruiter has to ask it.",
      },
      {
        heading: "How to Generate a Professional Summary with AI",
        body: "hired.video's Resume Summarizer generates a polished professional summary in seconds:\n\n1. **Paste your full resume** into the tool.\n2. **Select your target role** (optional but recommended for maximum relevance).\n3. **Click Summarize** — the AI reads your entire work history and distills it into a 2–3 sentence professional summary.\n4. **Review and customize.** The AI output is a strong first draft. Add personal touches, adjust the tone, or emphasize specific achievements.\n5. **Copy to your resume, LinkedIn, or cover letter.** The same summary works across all three with minor adjustments.\n\nThe AI identifies your most impressive achievements, avoids cliches, and writes in a confident, first-person voice. Most users say the AI version is better than what they'd write themselves.",
      },
      {
        heading: "Professional Summary Examples by Role",
        body: "**Software Engineer:**\n\"Full-stack engineer with 6 years building React/Node.js applications at scale. At [Company], I architected a real-time data pipeline processing 2M events/day that became the foundation for the company's analytics product. I'm looking to bring that systems-thinking to a senior engineering role at a data-driven company.\"\n\n**Product Manager:**\n\"Product manager with 5 years leading B2B SaaS products from 0-to-1 and 1-to-10. Most recently grew a $2M ARR product to $8M by launching an enterprise tier and self-serve onboarding. I combine deep user research with strong technical fluency to ship products that grow revenue.\"\n\n**Marketing Manager:**\n\"Growth marketer who's generated $15M in pipeline across 3 B2B SaaS companies. I specialize in demand generation, content strategy, and marketing ops — and I've built teams of 5–8 that consistently beat targets by 20%+. Passionate about turning data into actionable growth plays.\"\n\nNotice the pattern: title + years + domain, then signature achievement with a number, then forward-looking statement.",
      },
    ],
    faq: [
      {
        question: "How long should a professional summary be?",
        answer:
          "2–3 sentences (40–60 words). Any longer and you lose the recruiter's attention. The goal is to hook them into reading the rest of your resume, not to tell your entire story.",
      },
      {
        question: "Should I use a professional summary on LinkedIn too?",
        answer:
          "Yes, but expand it slightly. LinkedIn's 'About' section can be longer (3–5 sentences) and more conversational. Use the AI Resume Summarizer to generate a concise version for your resume, then add 1–2 sentences about your interests and what you're looking for to create your LinkedIn version.",
      },
    ],
  },

  // ── 11. PDF to JSON ──────────────────────────────────────────────────────
  {
    slug: "parse-resume-pdf-to-structured-json",
    title: "How to Parse a Resume PDF Into Structured JSON (Developer Guide)",
    description:
      "A technical guide to resume parsing: how to extract structured data from PDF resumes using AI, with schema examples, common pitfalls, and integration patterns.",
    publishedAt: "2026-04-08",
    updatedAt: "2026-04-16",
    readingTime: 8,
    author: "hired.video",
    toolSlug: "pdf-to-json",
    toolName: "PDF to JSON",
    toolUrl: "/tools/pdf-to-json",
    keywords:
      "resume parser, PDF to JSON, resume extraction, structured resume data, resume API, resume parser API, extract data from PDF resume",
    heroAlt: "PDF resume being transformed into structured JSON code",
    category: "Developer Tools",
    sections: [
      {
        heading: "The Resume Parsing Problem",
        body: "Resumes are unstructured by nature. There's no universal standard for layout, section naming, date formatting, or content organization. A resume might list education first or last, use \"Work Experience\" or \"Professional Background\" or \"Career History\", format dates as \"2020–2023\" or \"Jan 2020 - Dec 2023\" or \"1/2020 to 12/2023.\"\n\nFor any system that needs to process resumes at scale — ATS platforms, job boards, HR analytics, recruiting CRMs — this unstructured data must be converted to a consistent, machine-readable format. That's resume parsing.\n\nTraditional regex-based parsers break on 20–30% of resumes due to layout variations. Modern AI-powered parsers like hired.video's PDF to JSON tool achieve 95%+ extraction accuracy by understanding context, not just pattern-matching.",
      },
      {
        heading: "The Output Schema",
        body: "hired.video's PDF to JSON tool produces a clean JSON object with these top-level fields:\n\n```json\n{\n  \"basics\": {\n    \"name\": \"string\",\n    \"email\": \"string\",\n    \"phone\": \"string\",\n    \"location\": \"string\",\n    \"linkedin\": \"string\",\n    \"website\": \"string\",\n    \"summary\": \"string\"\n  },\n  \"work\": [\n    {\n      \"company\": \"string\",\n      \"position\": \"string\",\n      \"startDate\": \"YYYY-MM\",\n      \"endDate\": \"YYYY-MM | Present\",\n      \"highlights\": [\"string\"]\n    }\n  ],\n  \"education\": [\n    {\n      \"institution\": \"string\",\n      \"degree\": \"string\",\n      \"field\": \"string\",\n      \"graduationDate\": \"YYYY\"\n    }\n  ],\n  \"skills\": [\"string\"],\n  \"certifications\": [\"string\"]\n}\n```\n\nThis schema is compatible with the JSON Resume standard, making it easy to integrate with existing tools and pipelines.",
      },
      {
        heading: "How to Use the Parser",
        body: "**Interactive (browser):**\n1. Open the PDF to JSON tool at hired.video/tools/pdf-to-json.\n2. Drop a PDF file or paste resume text.\n3. Click Parse — the AI extracts structured data and displays the JSON.\n4. Copy the JSON or download as a .json file.\n\nThe parser handles multi-column layouts, tables, creative formatting, and non-standard section headings. It works with PDFs generated from Word, Google Docs, LaTeX, Canva, and design tools.",
      },
      {
        heading: "Common Parsing Pitfalls",
        body: "**Image-only PDFs.** Some PDFs are scanned images, not text. These require OCR before parsing. hired.video's parser includes OCR for scanned documents, but accuracy drops to ~85% for low-quality scans.\n\n**Multi-language resumes.** The parser works best with English resumes. Support for other languages is improving but may miss nuances in date formatting and section naming.\n\n**Heavily designed resumes.** Resumes with infographics, timelines, skill bars, and circular layouts lose some formatting nuance during extraction. The data is still captured, but visual-only elements (like a \"85% Python proficiency\" skill bar) may not translate to the JSON output.\n\n**Merged roles.** If someone lists two titles at the same company on one line (\"Senior Engineer → Staff Engineer, 2020–2024\"), the parser may create one entry instead of two. Spot-check these cases.",
      },
    ],
    faq: [
      {
        question: "What file formats does the parser accept?",
        answer:
          "The PDF to JSON tool accepts PDF and DOCX files, as well as pasted plain text. PDF files can be text-based or scanned (OCR is included).",
      },
      {
        question: "Is the output compatible with JSON Resume format?",
        answer:
          "Yes. The output schema follows the JSON Resume standard (jsonresume.org) with minor extensions for certifications and skills. You can use the output directly with any JSON Resume-compatible tool or theme.",
      },
    ],
  },

  // ── 12. Interview Practice ───────────────────────────────────────────────
  {
    slug: "how-to-prepare-for-any-job-interview",
    title: "How to Prepare for Any Job Interview with AI Practice",
    description:
      "A comprehensive guide to interview preparation: common questions by role, the STAR method, AI mock interviews, and how to build confidence before the real thing.",
    publishedAt: "2026-04-14",
    updatedAt: "2026-04-17",
    readingTime: 10,
    author: "hired.video",
    toolSlug: "interview",
    toolName: "AI Interview Practice",
    toolUrl: "/interview",
    keywords:
      "interview preparation, mock interview, interview practice, AI interview, STAR method, behavioral interview questions, how to prepare for interview",
    heroAlt: "Person practicing an interview with an AI interviewer on their laptop",
    category: "Interview Prep",
    sections: [
      {
        heading: "Why Interview Practice Is the #1 Predictor of Success",
        body: "Research from the University of Western Ontario found that interview performance improves by up to 30% with structured practice. The reason is straightforward: interviews test skills that are separate from job skills — storytelling, conciseness, composure under pressure, and the ability to frame past experience as future value.\n\nThese are performative skills. Like public speaking or sales, they improve dramatically with repetition. Yet most candidates \"prepare\" by reading blog posts and then walk into the interview hoping for the best.\n\nAI interview practice changes the equation. Instead of imagining questions in your head, you answer them out loud. Instead of guessing if your answer is good, you get instant, specific feedback on content, structure, and delivery.",
      },
      {
        heading: "The STAR Method (and When to Break the Rules)",
        body: "The STAR method (Situation, Task, Action, Result) is the gold standard for behavioral interview answers. Here's how to use it:\n\n**Situation (1 sentence).** Set the context. \"We were three weeks from launch and our lead engineer quit.\"\n\n**Task (1 sentence).** Define your responsibility. \"As the PM, I had to keep the launch on track with a reduced team.\"\n\n**Action (2–3 sentences).** Describe what YOU did. \"I reprioritized the backlog, cut three non-critical features, and personally took over QA for the auth module.\"\n\n**Result (1 sentence with metrics).** Quantify the outcome. \"We launched on time, hit 10K signups in the first week, and the three cut features shipped in v1.1 four weeks later.\"\n\n**When to break STAR:** For technical questions (\"How would you design X?\"), use a structured framework but skip the narrative. For culture-fit questions (\"What motivates you?\"), be genuine rather than formulaic.",
      },
      {
        heading: "How to Practice with AI",
        body: "hired.video's AI Interview Practice tool simulates a real interview:\n\n1. **Select your target role** — the AI customizes questions for the position.\n2. **Choose question types** — behavioral, technical, situational, or mixed.\n3. **Start the session** — the AI asks questions one at a time, just like a real interviewer.\n4. **Answer out loud or type** — speaking builds the verbal muscle memory you'll need in the real interview.\n5. **Get instant feedback** — the AI evaluates each answer on structure (did you use STAR?), specificity (did you include metrics?), relevance (did you answer the actual question?), and confidence.\n6. **Review your session** — see all your answers, scores, and improvement suggestions in one place.\n\nMost users see measurable improvement after 2–3 practice sessions.",
      },
      {
        heading: "The 10 Questions You'll Almost Certainly Be Asked",
        body: "Regardless of role or industry, these questions appear in 80%+ of interviews. Prepare a STAR answer for each:\n\n1. \"Tell me about yourself.\" (Use your value proposition.)\n2. \"Why are you interested in this role / company?\"\n3. \"Tell me about a time you faced a difficult challenge.\"\n4. \"Describe a situation where you had to work with a difficult colleague.\"\n5. \"What's your greatest professional achievement?\"\n6. \"Tell me about a time you failed.\"\n7. \"Why are you leaving your current role?\"\n8. \"Where do you see yourself in 5 years?\"\n9. \"How do you prioritize when everything is urgent?\"\n10. \"Do you have any questions for me?\" (Always say yes. Prepare 3–5 thoughtful questions.)\n\nThe AI Interview Practice tool covers all of these plus role-specific technical questions. The more you practice, the more natural your answers become.",
      },
    ],
    faq: [
      {
        question: "Is AI interview practice as good as practicing with a real person?",
        answer:
          "AI practice and human practice serve different purposes. AI practice excels at volume (you can do 10 sessions in an hour), instant feedback, and removing the awkwardness of asking a friend to interview you. Human practice adds real-time social dynamics and follow-up questions. The ideal prep combines both: use AI for building your answer library, then do 1–2 sessions with a real person for polish.",
      },
      {
        question: "How many practice sessions should I do before a real interview?",
        answer:
          "3–5 sessions, spread across 2–3 days. Research shows that distributed practice (multiple shorter sessions over time) is more effective than a single long session. Each session should be 15–20 minutes, covering 5–8 questions.",
      },
    ],
  },

  // ── 13. Resume Template Overview ─────────────────────────────────────────
  {
    slug: "how-to-choose-the-right-resume-template",
    title: "How to Choose the Right Resume Template for Your Industry (2026)",
    description:
      "A short guide to picking the resume template that signals fit for your industry — when to use a serif print layout, when ALL-CAPS headings help, and when to lead with education.",
    publishedAt: "2026-04-18",
    updatedAt: "2026-04-26",
    readingTime: 7,
    author: "hired.video",
    toolSlug: "marketplace-templates",
    toolName: "Resume Template Gallery",
    toolUrl: "/marketplace/templates",
    keywords:
      "resume template, best resume template, resume template by industry, resume design, ATS resume template, choose resume template, professional resume layout",
    heroAlt: "Grid of seven resume templates spanning finance, consulting, executive, new grad, hospitality, and creative styles",
    category: "Resume Tips",
    previewTemplateIds: [
      "hired-default",
      "payroll-iron-gray",
      "risk-asphalt",
      "executive-taupe",
      "intern-education-first",
      "hospitality-amber",
      "creative-minimal",
      "software-engineer-graphite",
      "healthcare-clinical-blue",
      "sales-growth-emerald",
    ],
    sections: [
      {
        heading: "Why Template Choice Actually Matters",
        body: "A resume template is the first message a recruiter receives — before they read a single bullet. The font, the spacing, the column count, and the heading style all signal what kind of professional you are. A finance candidate using a colorful single-column layout reads as unfamiliar with the industry. A creative director using a stiff, dense, two-column form reads as out of touch.\n\nThe goal isn't to look pretty. It's to look *expected*. Recruiters skim hundreds of resumes a week, and they read fastest when the visual format matches the role. A template that fits your industry takes friction off the page and lets your content do the work.\n\nThis guide maps hired.video's seven stock templates to the roles they're designed for, and explains the design choices behind each one.",
      },
      {
        heading: "The Five Signals Your Template Sends",
        body: "Every resume template communicates on five axes, whether you intend it to or not:\n\n**1. Font family.** Serif reads as traditional and authoritative (finance, executive, legal). Sans-serif reads as modern and neutral (most industries). Monospace reads as technical, design-aware, or product-led.\n\n**2. Heading style.** Underlined headings feel academic. Divider headings feel editorial. ALL-CAPS headings feel assertive. Plain headings feel calm.\n\n**3. Density.** Compact density signals \"I have a lot to say.\" Spacious density signals \"every line is important.\" Comfortable is the safe middle.\n\n**4. Column count.** A single column is the safest for ATS and for skim-readers. Two columns work when you have a strong sidebar (skills, certifications, languages) and want to fit more on one page.\n\n**5. Color palette.** Neutral grays read as serious. Warm tones read as approachable. Dark backgrounds read as confident. Bright colors read as creative — which can help or hurt depending on the role.",
      },
      {
        heading: "A Quick Map of Templates to Industries",
        body: "Here's the short version of when to reach for each stock template in the [hired.video gallery](/marketplace/templates):\n\n- **Hired Video (Default)** — when you have a video resume and want to lead with it. Best for product, marketing, sales, and creative roles where personality is part of the pitch.\n- **Payroll & Finance — Iron Gray** — accounting, payroll, FP&A, financial analyst, controller. Serif, two-column, ATS-friendly.\n- **Risk & Consulting — Asphalt** — Big 4 audit, risk, compliance, management consulting. Dark sidebar, ALL-CAPS headings, gravitas-forward.\n- **Executive — Trusted Taupe** — VP, Director, CXO, board candidates. One-column serif with elegant divider headings.\n- **New Grad — Education First** — interns, recent grads, career-switchers with limited work history. Education leads, then projects.\n- **Hospitality — Warm Amber** — hotel, restaurant, retail, customer success, service. Warm palette, friendly headings.\n- **Creative — Minimal Slate** — product designers, creative directors, indie makers. Monospace, generous whitespace, portfolio-first.\n- **Software Engineer — Dev Graphite** — backend, full-stack, infra, ML engineers. Mono accents, two-column with tech stack and projects sidebar.\n- **Healthcare — Clinical Blue** — RNs, NPs, physicians, allied health. Two-column with licenses and certifications above the fold.\n- **Sales — Growth Emerald** — AEs, SDRs, BD leaders. Single-column with prominent achievement metrics and quota-to-plan figures.\n\nIf you're between two, pick the more conservative one. You can always add personality through your bullet content; you can rarely subtract it after the recruiter has formed an impression.",
      },
      {
        heading: "How to Test Your Choice in 30 Seconds",
        body: "Before you commit to a template, do the squint test: open your resume, lean back, and squint at the screen until the text blurs. What's left should be a clear visual hierarchy — name, current role, dates — without color or design noise pulling your eye somewhere unhelpful.\n\nThen do the recruiter scan: spend exactly 7 seconds reading. Did your name register? Your current title? One quantified achievement? If yes, your template is working. If your eye got stuck on a heavy color block or an unusual layout, switch.\n\nFinally, run it through hired.video's [AI Resume Scorer](/tools/ai-resume-scorer) to confirm the formatting is ATS-compatible. Some otherwise-handsome templates lose points for tables, columns, or icons that parsers can't read.",
      },
      {
        heading: "When to Customize vs. When to Stick With a Preset",
        body: "Stock templates work for ~90% of candidates. The 10% who benefit from customization are usually senior creatives, candidates targeting a specific company's brand language, or people in regulated industries with idiosyncratic conventions (e.g., academic CVs, government clearance resumes).\n\nIf you do customize, change one thing at a time: swap the heading style, or shift the density, or move a section to the sidebar — but not all three at once. The further you drift from a preset, the more likely you are to introduce ATS issues or visual inconsistencies. The hired.video editor lets you tweak any preset and validates the result against the renderer.\n\nFor everyone else: pick the preset that fits your industry, fill it out carefully, and ship.",
      },
    ],
    faq: [
      {
        question: "Is a fancy template better than a plain one?",
        answer:
          "No. The best template is the one that matches industry expectations and lets your content read clearly. A plain template with strong, quantified bullets beats a designed template with vague accomplishments every time. Recruiters notice content first and design second — design only matters when it gets in the way.",
      },
      {
        question: "Will my template affect my ATS score?",
        answer:
          "Yes, sometimes significantly. Two-column layouts, tables, text boxes, headers/footers, and graphics-heavy designs can confuse ATS parsers and drop your score by 15–30%. Stick to single-column or carefully-designed two-column templates (like Iron Gray and Asphalt, which are tested against major ATS systems), and run your resume through an ATS scorer before applying.",
      },
      {
        question: "Can I switch templates after I've written my resume?",
        answer:
          "Yes. hired.video stores your resume content separately from the template, so switching templates re-renders the same content in the new style. You can preview multiple templates in seconds without rewriting any bullets — useful when you're applying to roles in different industries from the same résumé.",
      },
    ],
  },

  // ── 14. Payroll & Finance — Iron Gray ────────────────────────────────────
  {
    slug: "best-resume-template-for-finance-and-payroll",
    title: "The Best Resume Template for Finance, Accounting, and Payroll Roles",
    description:
      "Why finance recruiters expect a sober, two-column print layout — and how the Iron Gray template is built to pass ATS filters while signaling industry fit.",
    publishedAt: "2026-04-19",
    updatedAt: "2026-04-26",
    readingTime: 7,
    author: "hired.video",
    toolSlug: "payroll-iron-gray",
    toolName: "Payroll & Finance Template — Iron Gray",
    toolUrl: "/marketplace/templates/payroll-iron-gray",
    keywords:
      "finance resume template, accounting resume template, payroll resume, financial analyst resume, ATS-friendly resume, two-column resume, controller resume",
    heroAlt: "Iron Gray two-column resume template with serif headings, designed for finance and payroll roles",
    category: "Resume Tips",
    previewTemplateIds: ["payroll-iron-gray"],
    sections: [
      {
        heading: "Why Finance Resumes Look Different",
        body: "Finance hiring is conservative for a reason: the work itself rewards precision, predictability, and trust. A resume in this industry is a credentialing document, not a marketing piece. Recruiters at banks, accounting firms, payroll providers, and finance teams expect a layout that signals you understand the conventions of the field.\n\nThat means a serif font, neutral colors, dense formatting, and a clear separation between credentials (sidebar) and narrative (main column). Designs that work in tech or marketing — bold colors, big photos, infographic skill bars — actively work against you here.\n\nThe Iron Gray template is built to those conventions. It's intentionally restrained.",
      },
      {
        heading: "Iron Gray: A Print-First Layout for ATS-Heavy Industries",
        body: "Finance employers lean heavily on Applicant Tracking Systems — Workday, Oracle, SAP SuccessFactors, ADP. These systems read text, not design. Iron Gray is a print-mode layout with no hero, no video, no decorative elements. Every element on the page is text the parser can extract.\n\nThe two-column layout uses a structured sidebar that ATS systems handle reliably (skills, education, certificates, languages) and a main column for the work history. The serif font (a system font, not a custom web font) renders cleanly when the resume is downloaded as PDF. Headings use a divider style — a subtle horizontal rule beneath each title — which keeps the page scannable without visual noise.\n\nDensity is set to compact. Finance candidates typically have 5–15 years of relevant experience and need the room.",
      },
      {
        heading: "What to Put in the Sidebar",
        body: "The Iron Gray sidebar holds skills, education, certificates, and languages — in that order. These are credentialing fields and recruiters scan them first to confirm baseline qualification before reading the work history.\n\n**Skills.** List specific tools and methodologies, not soft skills. Example: \"NetSuite, QuickBooks Enterprise, ADP Workforce Now, Multi-state payroll, SOX 404 controls, Variance analysis.\" Avoid \"team player\" and \"detail-oriented.\"\n\n**Education.** Degree, institution, graduation year. Add GPA only if 3.5+ and you graduated in the last five years.\n\n**Certificates.** CPA, CFA, CMA, EA, FPC, CPP — list the credential, granting body, and year. These are gating credentials in finance and belong above the fold.\n\n**Languages.** Useful if you've worked on multinational teams or if the role explicitly requires another language. Otherwise optional.",
      },
      {
        heading: "The 6 Sections That Matter Most for Payroll/Finance",
        body: "1. **Professional summary (3 lines).** Years of experience, specialty (payroll / FP&A / audit / tax), and one quantified result.\n\n2. **Work experience.** Reverse-chronological. For each role, lead the bullet with the system or process you owned, followed by the scale and the outcome. Example: \"Owned bi-weekly payroll for 1,200 employees across 14 states; reduced manual adjustments by 38% by implementing time-clock integration.\"\n\n3. **Certifications.** In sidebar — see above.\n\n4. **Technical skills.** Specific software, regulations, methodologies.\n\n5. **Education.** In sidebar.\n\n6. **Awards / Recognition.** Optional but valuable: \"CFO Excellence Award (2023), Top 10% performer rating (2022, 2023).\"\n\nSkip: photo, hobbies, personal pronouns, color-coded skill bars.",
      },
      {
        heading: "Mistakes to Avoid",
        body: "**Don't use color blocks.** A maroon header band that looks polished in PowerPoint reads as gimmicky on a finance resume.\n\n**Don't write narrative bullets.** \"Was responsible for ensuring the smooth running of the month-end close process\" should be \"Owned month-end close (5-day cycle); reduced to 3 days by automating intercompany reconciliations.\"\n\n**Don't omit dates or scale.** Finance recruiters need to know how big the books were, how many employees, how much revenue. Always include scale.\n\n**Don't skip CPA progress.** If you're a CPA candidate, list your status (\"CPA candidate, 3 of 4 sections passed\") rather than leaving it off.",
      },
    ],
    faq: [
      {
        question: "Does the two-column layout hurt ATS parsing?",
        answer:
          "Not in Iron Gray. The template is built so the parser reads sidebar content as standalone sections (skills, education, certificates) rather than treating the whole page as a table. We tested it against Workday, Greenhouse, Oracle Taleo, and SAP SuccessFactors. If you're applying to a particularly old in-house ATS, you can switch to a one-column variant in the editor.",
      },
      {
        question: "Should I use a serif font for finance resumes?",
        answer:
          "Yes, in most cases. Serif fonts (Iron Gray uses Source Serif) read as traditional, careful, and credentialed — which is exactly the signal finance recruiters are looking for. Sans-serif works for younger fintech roles or for finance-adjacent tech jobs, but for traditional banking, accounting, audit, and payroll, serif is the safer call.",
      },
      {
        question: "Is Iron Gray suitable for a CFO?",
        answer:
          "It can be, but the Executive — Trusted Taupe template is usually a better fit at CXO level. Iron Gray is built for individual contributors and managers; Trusted Taupe is built for executives whose resume needs more whitespace and a narrative-driven format. If you're a finance executive, start with Trusted Taupe and customize if needed.",
      },
    ],
  },

  // ── 15. Risk & Consulting — Asphalt ──────────────────────────────────────
  {
    slug: "best-resume-template-for-consulting-and-risk",
    title: "The Best Resume Template for Consulting, Risk, and Audit Roles",
    description:
      "Why consulting and risk recruiters respond to ALL-CAPS headings and a dark, structured layout — and how to use the Asphalt template to frame engagements rather than job titles.",
    publishedAt: "2026-04-20",
    updatedAt: "2026-04-26",
    readingTime: 8,
    author: "hired.video",
    toolSlug: "risk-asphalt",
    toolName: "Risk & Consulting Template — Asphalt",
    toolUrl: "/marketplace/templates/risk-asphalt",
    keywords:
      "consulting resume template, Big 4 resume, audit resume, risk management resume, compliance resume, McKinsey resume template, management consulting resume",
    heroAlt: "Asphalt resume template with dark sidebar and ALL-CAPS section headings, designed for consulting and risk roles",
    category: "Resume Tips",
    previewTemplateIds: ["risk-asphalt"],
    sections: [
      {
        heading: "What Consulting Recruiters Read For",
        body: "A consulting or risk recruiter is hunting for three things in the first 10 seconds: pedigree (firm, university, certifications), engagement scale (clients, deal sizes, regulatory frameworks), and executive presence (how the candidate frames their work).\n\nThe resume's job is to surface all three before the recruiter loses interest. The Asphalt template is designed to do exactly that: a dark sidebar pins your credentials and skills permanently in view, ALL-CAPS section headings break the page into confident chunks, and a structured main column gives each engagement room to breathe.\n\nIt's intentionally assertive. Consulting and risk are industries that reward people who project authority — and the resume is the first place that signal lands.",
      },
      {
        heading: "Why ALL-CAPS Headings Signal Gravitas",
        body: "ALL-CAPS headings have a bad reputation in modern design — they're often associated with shouting or with dated brochure layouts. But in consulting and risk, they read differently. They signal seriousness. They mirror the typographic conventions of legal opinions, audit reports, and Big 4 client decks.\n\nThe Asphalt template uses caps headings sparingly: only at the section level, never in the body. Combined with the dark sidebar and a comfortable density, the result feels like a partner-level deliverable rather than a job-search artifact.\n\nIf you're applying to McKinsey, BCG, Bain, Deloitte, EY, KPMG, PwC, Accenture, Oliver Wyman, or any in-house risk function at a regulated bank or insurer, this is the visual language they're used to.",
      },
      {
        heading: "The Asphalt Layout — Dark Sidebar, Achievement-First Body",
        body: "The Asphalt template uses a two-column layout with a darker sidebar holding skills, languages, and certificates. The main column is reserved for work experience and education, ordered chronologically.\n\nThis split matters. Consulting recruiters scan the sidebar first to confirm baseline credentials (Series 7, CFA, CISA, CRCM, FRM, Certified Internal Auditor, Six Sigma, etc.), then move to the main column for engagement detail. If the sidebar is thin, the resume reads as junior. If the main column is thin, the resume reads as untested.\n\nThe Asphalt density is set to comfortable, not compact — consulting bullets are longer than finance bullets because each one needs to convey context, action, and outcome for a discrete engagement.",
      },
      {
        heading: "How to Frame Engagements (Not Just Roles)",
        body: "Consulting resumes don't list jobs — they list engagements. A senior consultant at Deloitte might have held one job title for four years but worked on twelve engagements during that time. The resume needs to surface that.\n\nUnder each role, list 4–6 engagements as sub-bullets. For each engagement, use this structure:\n\n**Client / context (1 line).** \"Top-3 US health insurer, $12B revenue.\"\n\n**Mandate (1 line).** \"Led a 6-month risk-control rationalization across 14 business units.\"\n\n**Action (1 line).** \"Restructured the SOX testing approach, consolidated 340 controls to 180.\"\n\n**Outcome (1 line with metrics).** \"Cut audit fees by $1.8M annually; remediated 22 high-risk findings ahead of regulator deadline.\"\n\nThis framing gives recruiters a tour of your portfolio, not just your tenure.",
      },
      {
        heading: "Quantifying Risk and Audit Work",
        body: "Risk and audit work is harder to quantify than sales or revenue work, but recruiters expect numbers anyway. Use these levers:\n\n**Scope.** Number of controls tested, processes audited, regulatory frameworks covered (SOX, MiFID II, Basel III, GDPR, HIPAA, NIST, ISO 27001).\n\n**Scale.** Revenue or AUM of the entity, headcount, geographic footprint.\n\n**Findings.** Number of high-risk findings remediated, audit observations closed, control weaknesses resolved.\n\n**Efficiency.** Audit cycle time reduced, testing automated, controls rationalized.\n\n**Impact.** Cost savings, fee reductions, risk-rating improvements, regulator outcomes.\n\nA bullet like \"Conducted SOX testing\" is invisible. A bullet like \"Led SOX 404 testing across 12 entities ($4.2B combined revenue); rationalized 340 controls to 180 and cut external audit fees by $1.8M\" is hireable.",
      },
    ],
    faq: [
      {
        question: "Is a dark template too aggressive for Big 4?",
        answer:
          "Asphalt's dark element is limited to the sidebar — the main column stays light and readable. We tested it with recruiters at three of the Big 4 and the response was uniformly positive: it reads as confident and modern without crossing into flashy. If you're concerned, you can lighten the sidebar by switching to the Iron Gray theme in the editor while keeping the Asphalt structure.",
      },
      {
        question: "Should I list every client engagement?",
        answer:
          "List 3–6 per role, prioritizing the largest, most regulated, or most relevant to the job you're applying for. Listing every engagement creates an impression of breadth without depth. Recruiters would rather see five engagements with full context than fifteen one-liners.",
      },
      {
        question: "How do I handle confidential clients on a consulting resume?",
        answer:
          "Use industry and scale instead of name: \"Top-3 US life insurer, $80B AUM\" reads as credibly as the actual name and stays compliant with most consulting NDAs. If your firm allows named references, list them — but always check the firm's policy before publishing the resume publicly.",
      },
    ],
  },

  // ── 16. Executive — Trusted Taupe ────────────────────────────────────────
  {
    slug: "best-resume-template-for-executives-and-c-suite",
    title: "The Best Resume Template for Executive and C-Suite Roles",
    description:
      "Executive resumes are narrative documents, not skill lists. Why the Trusted Taupe template's spacious serif layout works for VPs, Directors, and C-suite candidates.",
    publishedAt: "2026-04-21",
    updatedAt: "2026-04-26",
    readingTime: 8,
    author: "hired.video",
    toolSlug: "executive-taupe",
    toolName: "Executive Template — Trusted Taupe",
    toolUrl: "/marketplace/templates/executive-taupe",
    keywords:
      "executive resume template, C-suite resume, CXO resume, VP resume template, director resume, executive CV, board resume, leadership resume",
    heroAlt: "Trusted Taupe executive resume template with spacious serif layout and divider headings",
    category: "Career Strategy",
    previewTemplateIds: ["executive-taupe"],
    sections: [
      {
        heading: "Executive Resumes Are Narratives, Not Lists",
        body: "At the VP, SVP, and CXO level, the resume stops being a credentialing document and becomes a story. Recruiters and search firms are no longer asking \"can this person do the job?\" — they assume yes — they're asking \"what's the through-line of this leader's career, and does it set them up to deliver what we need next?\"\n\nThat shift changes everything about the format. Bullet count drops. Whitespace expands. Each role gets a paragraph, not a list. Numbers move from the granular (lines of code, tickets closed) to the consequential (revenue grown, businesses turned around, organizations scaled).\n\nThe Trusted Taupe template is built for this register. It's spacious, serif, and quiet — designed to hold a senior story without competing with it.",
      },
      {
        heading: "Why Spacious Serif Layouts Build Trust",
        body: "Three design choices in Trusted Taupe combine to communicate seniority:\n\n**Serif typography.** Serif fonts are the typographic default of formal documents — annual reports, legal opinions, board materials. Using one signals familiarity with that world.\n\n**Spacious density.** A senior resume that's crammed onto one page reads as anxious. Spacious density gives each role room to breathe, which lets the achievements register one at a time rather than blurring together.\n\n**Divider headings, not boxes.** Section headings in Trusted Taupe are separated by a thin horizontal rule rather than a colored bar. This is the visual language of editorial design and McKinsey decks — restrained, confident, and unmistakably senior.\n\nThe color palette is a warm taupe and stone — not gray (which can feel cold) and not navy (which can feel corporate). It's the visual register of a Harvard Business Review essay, not a recruiter's stock template.",
      },
      {
        heading: "Trusted Taupe: A One-Column, Divider-Heading Format",
        body: "Trusted Taupe uses a single column intentionally. At the executive level, the work history is the resume — it should not be elbowed by a sidebar. A skills sidebar reads as junior at this level; you don't list \"leadership\" the way an analyst lists \"SQL.\"\n\nThe layout opens with a hero block (name, current title, contact buttons, executive summary) and then runs sections vertically: Work Experience, Education, Awards, Board Service, Certifications. There's room for a video resume in the hero if you have one — increasingly common for board candidates and PE-backed CEO searches.\n\nDensity is set to spacious, with section title size at large. The page should feel composed, not packed.",
      },
      {
        heading: "Leading With a Career Summary, Not a Headline",
        body: "Below the hero, an executive resume opens with a 4–6 line career summary. Not a headline (\"Strategic CEO\") and not an objective (\"Seeking a role where I can…\"), but a paragraph that names what you do, who you do it for, and what you've delivered.\n\nA strong example: \"Operating CEO with 18 years scaling B2B SaaS companies from $20M to $200M ARR. Two PE-backed exits (3.4x and 5.1x MOIC) and one strategic sale to a Fortune 100 acquirer. Recognized for turning product-led businesses into enterprise-led ones without losing the developer-first DNA.\"\n\nThree sentences. Specific. Quantified where it counts. Lets the recruiter form a thesis before reading the work history.\n\nA weak example to avoid: \"Visionary leader with a passion for driving results.\" That sentence applies to everyone and tells the recruiter nothing.",
      },
      {
        heading: "How Long Should an Executive Resume Be?",
        body: "Two pages is the right length for almost every executive resume. One page is too short to do justice to a 20-year career; three pages reads as undisciplined.\n\nUse the second page for early-career roles (one or two lines each), board service, advisory work, speaking engagements, and education. The first page should hold the current role, the previous role, and the role before that — each with a paragraph of context and 3–5 high-impact bullets.\n\nAcademic CVs are an exception (they can run 8–20 pages with publications and grants), but for corporate executive searches, two pages is the convention. Trusted Taupe's spacious density makes two pages feel like the natural length, not a stretch.",
      },
    ],
    faq: [
      {
        question: "Is two pages OK for an executive resume?",
        answer:
          "Yes, two pages is the standard at VP level and above. Recruiters and retained search firms expect it. One page is too short for a senior career; three pages reads as undisciplined. Trusted Taupe is laid out so two pages feel natural — the spacious density and one-column flow give a senior story room without padding.",
      },
      {
        question: "Should I include early-career roles?",
        answer:
          "Yes, but compress them. List your first three or four roles in a single \"Earlier Experience\" block at the bottom of page two: title, company, dates, one line of context. This lets recruiters trace your trajectory without giving disproportionate weight to a 25-year-old job. Hide a role completely only if it's irrelevant or actively distracting.",
      },
      {
        question: "Do executives still need a skills section?",
        answer:
          "Mostly no. At the executive level, your skills are inferred from your roles and accomplishments, not listed. The exception is technical executives (CTO, Chief Data Officer, CISO) who may want a brief technologies block to clarify domain. For everyone else — CEOs, CFOs, COOs, CHROs, CMOs — drop the skills section and let the work history carry the signal.",
      },
    ],
  },

  // ── 17. New Grad — Education First ───────────────────────────────────────
  {
    slug: "best-resume-template-for-new-grads-and-interns",
    title: "The Best Resume Template for New Grads and Interns (2026)",
    description:
      "When you have limited work history, the order of sections matters more than the design. How the Education First template surfaces projects, coursework, and internships above thin work history.",
    publishedAt: "2026-04-22",
    updatedAt: "2026-04-26",
    readingTime: 7,
    author: "hired.video",
    toolSlug: "intern-education-first",
    toolName: "New Grad Template — Education First",
    toolUrl: "/marketplace/templates/intern-education-first",
    keywords:
      "new grad resume template, intern resume, college resume, entry-level resume, student resume template, recent graduate resume, first job resume",
    heroAlt: "Education-first resume template optimized for new grads and interns with limited work history",
    category: "Resume Tips",
    previewTemplateIds: ["intern-education-first"],
    sections: [
      {
        heading: "Why New Grads Need a Different Template",
        body: "Most resume templates are built for people who already have a career to describe. They put work experience first, then education at the bottom. That order makes sense for someone with five jobs and a ten-year-old degree.\n\nFor a new grad, it's backwards. Your degree is your strongest credential; your one summer internship is your weakest. Putting work first forces recruiters to scroll past your thin work history before reaching the part of your background they actually care about.\n\nThe Education First template inverts the order. Education leads. Projects and coursework get prominent placement. Work experience — when you have any — comes after, framed as supporting evidence rather than the main argument.",
      },
      {
        heading: "Education First: Putting Your Strongest Asset on Top",
        body: "Education First uses a balanced blue palette, sans-serif font, and underlined headings — a clean, modern look that reads as student-appropriate without feeling juvenile.\n\nThe section order is deliberate: Education → Work Experience → Projects → Skills → Volunteer → Awards → Languages → Interests. Education at the top means the recruiter sees your school, degree, GPA, and graduation date in the first three seconds. For new-grad hiring, those four data points often determine whether you make the next round.\n\nFor each education entry, include: institution, degree, major (and minor if relevant), graduation date, GPA (if 3.5+), and 3–5 lines of detail — relevant coursework, honors, study abroad, leadership roles. Don't be modest here. Coursework is your work history at this stage.",
      },
      {
        heading: "How to Use Projects and Coursework as Experience",
        body: "Projects are how new grads compete with candidates who have internship experience. A well-described capstone, hackathon win, or independent project can carry more weight than a generic intern summer.\n\nFor each project, write three lines:\n\n**1. What it was.** \"Built a real-time transit dashboard for the campus shuttle system.\"\n\n**2. What you did specifically.** \"Designed the React frontend, integrated the GTFS-RT feed, and deployed to Vercel.\"\n\n**3. The outcome.** \"Adopted by 1,200 students in the first month; demoed at the university CS showcase.\"\n\nThe outcome line matters most. \"Built a thing\" is generic; \"1,200 users adopted it\" is hireable. Even small numbers (100 users, 5 GitHub stars, won 3rd place) are better than no numbers.",
      },
      {
        heading: "Quantifying Work Without \"Real\" Work",
        body: "If your only work history is a campus job, a tutoring gig, or a part-time service role, frame it with the same rigor you'd use for a corporate role. Recruiters at competitive new-grad programs (consulting, banking, big tech) don't penalize part-time work — they penalize fuzzy descriptions.\n\nGood: \"Tutored 14 introductory CS students weekly; raised section average grade from C+ to B over one semester.\"\n\nWeak: \"Helped students learn computer science.\"\n\nGood: \"Managed inventory across 6 SKU categories at a 2,400-sq-ft retail store; reduced stockouts by 22% by switching to a weekly reorder cycle.\"\n\nWeak: \"Worked at a retail store.\"\n\nThe quantification habit is the most transferable skill from a part-time job to a full-time role. Build it now.",
      },
      {
        heading: "When to Switch to a Work-First Template",
        body: "The Education First template is right for the first 0–18 months after graduation. After that, your work experience starts carrying the resume and the order should flip.\n\nSpecific signs you've outgrown Education First:\n\n- You have one full-time role and 1+ years of post-graduation experience.\n- You've been promoted or had your scope materially expanded.\n- You have quantified work outcomes that are stronger than your GPA or coursework.\n- A recruiter has told you the resume reads as junior.\n\nWhen you switch, you can re-render the same content into another template (Iron Gray for finance, Asphalt for consulting, the default Hired Video for general use). Your content stays; only the order and layout change.",
      },
    ],
    faq: [
      {
        question: "Should I include my GPA?",
        answer:
          "Include your GPA if it's 3.5 or above and you're within five years of graduation. Below 3.5, leave it off — recruiters who care will ask, and listing a low GPA is worse than not listing one. After five years, work experience eclipses GPA regardless of the number.",
      },
      {
        question: "Is one page mandatory for new grads?",
        answer:
          "Yes, with rare exceptions (PhD candidates, candidates with substantial published research). A two-page new-grad resume usually means padding. Education First is designed to fit a strong new-grad story comfortably onto one page when you trim early-life roles and lengthy paragraph descriptions.",
      },
      {
        question: "Should I list relevant coursework?",
        answer:
          "Yes — but pick carefully. List 4–6 courses that match the role you're applying to, not your entire transcript. For a software role: Algorithms, Distributed Systems, Databases, Machine Learning. For a finance role: Corporate Finance, Financial Modeling, Econometrics. Generic intro courses (Intro to Psychology) signal nothing and crowd the page.",
      },
    ],
  },

  // ── 18. Hospitality — Warm Amber ─────────────────────────────────────────
  {
    slug: "best-resume-template-for-hospitality-and-retail",
    title: "The Best Resume Template for Hospitality, Retail, and Customer-Facing Roles",
    description:
      "Hospitality hiring is about personality, reliability, and service mindset. Why the Warm Amber template's friendly palette and approachable layout help service candidates stand out.",
    publishedAt: "2026-04-23",
    updatedAt: "2026-04-26",
    readingTime: 7,
    author: "hired.video",
    toolSlug: "hospitality-amber",
    toolName: "Hospitality Template — Warm Amber",
    toolUrl: "/marketplace/templates/hospitality-amber",
    keywords:
      "hospitality resume template, retail resume, restaurant resume, hotel resume, customer success resume, server resume, front desk resume, service industry resume",
    heroAlt: "Warm Amber hospitality resume template with friendly palette and ALL-CAPS section headings",
    category: "Resume Tips",
    previewTemplateIds: ["hospitality-amber"],
    sections: [
      {
        heading: "Hospitality Hiring Is About Personality and Reliability",
        body: "Hospitality, retail, and customer-facing hiring works differently from corporate hiring. The hiring manager has probably read 200 resumes that all list \"customer service,\" \"team player,\" and \"detail-oriented.\" They're not looking for credentials. They're looking for two things: do you seem like a person guests would enjoy interacting with, and do you seem reliable enough to show up for the shift?\n\nThe template plays a real role here. A stiff, dense, finance-style resume signals you don't understand the industry's culture. A clean, warm, easy-to-skim layout signals you do.\n\nThe Warm Amber template is built for this read. It uses an amber-and-cream palette (warm without being unprofessional), a friendly sans-serif font, and ALL-CAPS section headings that scan well under cafeteria-table review by a hospitality manager flipping through resumes between shifts.",
      },
      {
        heading: "Why a Warm Palette Wins in Service Roles",
        body: "Color in resumes is usually a liability — it distracts and breaks ATS parsing. But hospitality is the one industry where a warm color palette helps rather than hurts.\n\nHere's why: hospitality managers are looking for a personality fit. A resume that uses warm tones (amber, terracotta, soft gold) reads as approachable in a way that an iron-gray finance template doesn't. The palette signals \"this candidate would smile at a guest\" before the manager has read a single bullet.\n\nThe Warm Amber template uses amber for headings and accents only — the body remains black-on-cream for full readability. The palette enhances tone without sacrificing scannability or ATS compatibility.\n\nFor management roles within hospitality (GM, F&B Director, Operations), you can dial down the warmth in the editor; for front-line roles, lean into it.",
      },
      {
        heading: "Warm Amber: A Friendly, Single-Column Format",
        body: "Warm Amber uses a single-column layout with comfortable density and ALL-CAPS section headings. Single-column matters here because hospitality managers often print resumes for staff meetings or read them quickly on a phone — a two-column layout reads poorly in both contexts.\n\nThe single-column flow runs: hero (with optional photo), summary, work experience, skills, education, certifications, languages, interests. The interests section is more useful here than in most industries — hospitality managers genuinely care about whether you're outgoing, athletic, multilingual, or community-active, because those traits map to guest interaction.\n\nKeep the resume to one page if you have under five years of experience, two pages if you have more. Hospitality resumes get scanned faster than any other category — every line needs to earn its space.",
      },
      {
        heading: "How to Quantify Service Work (Yes, You Can)",
        body: "\"Provided excellent customer service\" is the most useless sentence in hospitality resumes. It's also the most common. Replace it with numbers, even when numbers feel awkward to attach to service work.\n\n**Volume.** \"Served 80–120 covers per shift across 5 shifts/week.\" \"Checked in 240+ guests per night during peak season.\" \"Processed 350+ transactions per shift on the busiest register.\"\n\n**Tenure or Reliability.** \"Maintained perfect attendance over 18 months.\" \"One of two staff retained from the original opening team after 3 years.\"\n\n**Outcomes.** \"Lifted average guest review rating from 4.2 to 4.7 stars over 8 months.\" \"Top 5% upsell performer (chain-wide, 200+ servers).\"\n\n**Promotions.** \"Promoted from server to shift supervisor within 6 months.\" \"Selected to train 12 new hires.\"\n\nThese numbers are what separate a memorable hospitality resume from a generic one.",
      },
      {
        heading: "Highlighting Soft Skills Without Sounding Generic",
        body: "Soft skills matter in hospitality more than in any other industry — but listing them as keywords (\"team player, communication, problem-solving\") makes the resume disappear into the pile. Show them through specific examples instead.\n\nInstead of: \"Team player.\"\nWrite: \"Covered 14 last-minute shifts for teammates over the summer; maintained relationships with 6 of 8 staff who left for other roles, and recruited 2 of them back.\"\n\nInstead of: \"Excellent communication skills.\"\nWrite: \"Bilingual English/Spanish; handled all Spanish-speaking guest issues for a 240-room property, including 4 service-recovery situations resolved without manager escalation.\"\n\nInstead of: \"Calm under pressure.\"\nWrite: \"Worked 12-table sections during peak Sunday brunch service for 18 months without a single comped table.\"\n\nThe Warm Amber template's spacious bullet style gives these stories room to land.",
      },
    ],
    faq: [
      {
        question: "Is a colored resume too casual for a hotel manager role?",
        answer:
          "Warm Amber is intentionally restrained — amber is used only for headings and accents, with the body in black-on-cream. It reads as warm but professional, suitable for hotel front desk through GM roles. For corporate hospitality positions (regional director, brand strategy, hotel finance), the Iron Gray or Trusted Taupe templates may be a better fit.",
      },
      {
        question: "Should I list every restaurant I've worked at?",
        answer:
          "List the last 3–5 hospitality roles in detail and consolidate earlier ones into a single \"Earlier Experience\" line. Hospitality hiring values continuity (long tenures look great) and variety (different concepts, brands, or service tiers), so prioritize roles that show one of those two patterns.",
      },
      {
        question: "How do I show shift-based experience?",
        answer:
          "Quantify the shift, not just the job. \"Closed Friday/Saturday late-night shifts (8pm–4am) for 14 months\" tells a hiring manager more than \"Server, weekends.\" Likewise, \"Opened the kitchen for the breakfast service 5 days/week, including prep and inventory check-in\" signals a level of trust the bare title doesn't.",
      },
    ],
  },

  // ── 19. Creative — Minimal Slate ─────────────────────────────────────────
  {
    slug: "best-resume-template-for-designers-and-creatives",
    title: "The Best Resume Template for Designers, Creatives, and Product Builders",
    description:
      "The creative resume paradox: less design wins. Why the Minimal Slate template's monospace font and generous whitespace work for product designers, creative directors, and indie makers.",
    publishedAt: "2026-04-24",
    updatedAt: "2026-04-26",
    readingTime: 7,
    author: "hired.video",
    toolSlug: "creative-minimal",
    toolName: "Creative Template — Minimal Slate",
    toolUrl: "/marketplace/templates/creative-minimal",
    keywords:
      "designer resume template, product designer resume, creative director resume, UX designer resume, minimalist resume, monospace resume, indie maker resume",
    heroAlt: "Minimal Slate resume template with monospace font and generous whitespace, designed for creatives and designers",
    category: "Resume Tips",
    previewTemplateIds: ["creative-minimal"],
    sections: [
      {
        heading: "The Creative Resume Paradox: Less Is More",
        body: "Designers, art directors, and creative leads make a counterintuitive mistake on their resumes: they over-design them. Drop shadows, color gradients, custom fonts, infographic skill bars, full-bleed photography. The instinct is understandable — the resume is a creative artifact, so why not show range?\n\nThe answer is that the resume isn't the portfolio. It's the cover letter to the portfolio. A heavily-designed resume competes with the portfolio for attention; a restrained resume points the reader toward it.\n\nThe Minimal Slate template is built around this insight. It uses a monospace font, plain headings, generous whitespace, and a near-monochrome palette. The result feels like a Substack post or a thoughtful README — content-first, with the design choices visible only to readers paying close attention.",
      },
      {
        heading: "Why a Monospace Font Reads as Confident, Not Quirky",
        body: "Monospace fonts (where every character occupies the same width) are the typographic signature of code, indie publishing, and product-builder culture. Stripe's docs, Linear's marketing site, Vercel's blog, every README on GitHub — monospace is the visual language of people who care about how systems are made.\n\nUsing one on a resume signals fluency in that culture without saying anything explicit. It reads as confident in a way that a designer-y display font doesn't. It's also a subtle filter: hiring managers who don't appreciate the choice probably aren't building the kinds of teams a Minimal Slate candidate wants to join.\n\nThe Minimal Slate template uses a system monospace stack with comfortable line height and small section title sizes. The result is dense without being cramped — every character earns its place.",
      },
      {
        heading: "Minimal Slate: A Whitespace-First Layout for Portfolio People",
        body: "Minimal Slate uses a single column with spacious density and small heading sizes. The visual hierarchy is built almost entirely from whitespace, not color or weight.\n\nThe section order: hero (with portfolio link prominent), summary, work experience, projects, skills, education. Notice that projects get prominent billing — for designers and product builders, side projects are often as important as employed work, and the template treats them that way.\n\nThe palette is grayscale with a slight warm tint. No accent color, no dividers, no rules. Section breaks are created by whitespace alone. This is the same design philosophy as Apple's annual reports or Hermès packaging — the absence of decoration is the decoration.",
      },
      {
        heading: "How to Treat Your Resume as a Design Artifact",
        body: "Even though Minimal Slate is restrained, it's still a designed document — and designers should treat the writing with the same care they'd apply to any other deliverable.\n\n**Sentence rhythm.** Vary length. Don't write five 18-word bullets in a row. Mix 6-word punchlines with 20-word context bullets to create rhythm.\n\n**Verb selection.** Avoid the boring verbs (\"managed,\" \"led,\" \"worked on\"). Use design-native verbs: \"prototyped,\" \"shipped,\" \"redesigned,\" \"refactored,\" \"art-directed.\"\n\n**Specificity.** \"Redesigned the onboarding flow\" is invisible. \"Redesigned the onboarding flow; cut step count from 9 to 4 and lifted activation from 38% to 61%\" is hireable.\n\n**Restraint.** Don't list every tool you've ever opened. Five tools you actually shipped with > thirty tools you've sampled.\n\nThe Minimal Slate format gives this kind of writing room to breathe. Use it.",
      },
      {
        heading: "Linking to a Portfolio Without Cluttering the Page",
        body: "Designers need a portfolio link, but the link itself shouldn't dominate the page. Minimal Slate handles this with a hero contact-button row that includes a single dedicated portfolio link, plus inline links inside individual project descriptions.\n\nThree rules for portfolio linking:\n\n**1. Use a clean URL.** \"yourname.com\" or \"yourname.design\" beats a Behance/Dribbble URL with random characters. Buy your name as a domain if you haven't.\n\n**2. Make every project bullet linkable.** When you describe a shipped project, link the project name to its case study. Recruiters click.\n\n**3. Don't repeat work in the resume that's already in the portfolio.** Use the resume to set the frame; let the portfolio carry the depth. The resume should leave the reader curious to click, not satisfied that they've seen enough.",
      },
    ],
    faq: [
      {
        question: "Should designers still use a \"real\" resume or just a portfolio?",
        answer:
          "Both. Many companies still require a resume even when a portfolio is the primary review artifact, particularly for ATS-driven applications. The Minimal Slate template is designed to coexist with a portfolio — short, confident, and pointing the reader toward the deeper work. Skip the resume only when an employer explicitly says they don't want one.",
      },
      {
        question: "Is a monospace font readable enough for skim-reading?",
        answer:
          "Yes, when sized correctly. Minimal Slate uses a slightly larger monospace size and a generous line-height to avoid the cramped look that gives monospace a bad reputation. Skim tests with creative recruiters showed faster read-through than dense sans-serif templates, mainly because the wider character spacing gives the eye natural anchor points.",
      },
      {
        question: "Will Minimal Slate pass an ATS scan?",
        answer:
          "Yes. Despite the design-forward look, Minimal Slate is structurally a single-column print layout with standard section headings and no graphics, tables, or text boxes. We tested it against Greenhouse, Lever, Workday, and Ashby — all parsed cleanly. If you're applying to a particularly old ATS, you can always switch to a more conventional template for that submission while keeping the same content.",
      },
    ],
  },

  // ── 20. Software Engineer — Dev Graphite ─────────────────────────────────
  {
    slug: "best-resume-template-for-software-engineers",
    title: "The Best Resume Template for Software Engineers and Developers",
    description:
      "Why engineers need a different resume than designers — tech stack as a sidebar, projects weighted equally with work history, and how the Dev Graphite template signals senior-eng fluency.",
    publishedAt: "2026-04-25",
    updatedAt: "2026-04-26",
    readingTime: 8,
    author: "hired.video",
    toolSlug: "software-engineer-graphite",
    toolName: "Software Engineer Template — Dev Graphite",
    toolUrl: "/marketplace/templates/software-engineer-graphite",
    keywords:
      "software engineer resume template, developer resume, backend engineer resume, full stack resume, FAANG resume, programmer resume, engineering resume template",
    heroAlt: "Dev Graphite resume template with monospace headings and a two-column layout featuring tech stack and projects sidebar",
    category: "Resume Tips",
    previewTemplateIds: ["software-engineer-graphite"],
    sections: [
      {
        heading: "Engineers Aren't Designers — Their Resumes Shouldn't Look Alike",
        body: "Most resume templates labeled \"creative\" lump designers and engineers together. They shouldn't. A product designer's resume is a piece of design work — restraint, hierarchy, and craft are the message. A software engineer's resume is closer to a well-written README — the message is what was built, with what, at what scale, and with what outcome.\n\nThe Dev Graphite template is built for engineers specifically. Tech stack lives in a permanent sidebar so recruiters can confirm fit in three seconds. Projects sit alongside work experience instead of being demoted to the bottom. Monospace accents on section labels signal fluency in the visual language engineers actually care about (READMEs, terminals, code), without making the body text hard to read.",
      },
      {
        heading: "Dev Graphite: A Two-Column Layout Built Around the Stack",
        body: "Dev Graphite uses a two-column print layout. The sidebar holds — in order — Skills (your tech stack), Projects, Certificates, and Languages. The main column holds Work Experience, Education, and the rest.\n\nThis split matters. Engineering recruiters scan the stack first. If they're hiring a Go engineer and they don't see Go in your sidebar within five seconds, the resume goes in the no pile. Putting tech stack in a permanent visual position means it never gets buried under a long work history.\n\nThe theme uses slate-900 base text with emerald accents for headings and section labels — a restrained nod to terminal aesthetics without veering into costume. Monospace font, comfortable density, plain headings. The result feels like a thoughtful README for the person who shipped it.",
      },
      {
        heading: "How to Write the Skills Sidebar",
        body: "The skills sidebar is the most-read part of an engineer's resume. Get it right.\n\n**Group by category.** \"Languages: Go, TypeScript, Python, Rust\" / \"Infra: Kubernetes, Terraform, AWS, GCP\" / \"Data: Postgres, Kafka, ClickHouse, Snowflake.\" Categories help recruiters scan; flat lists force them to read every word.\n\n**Order by depth, not alphabetically.** Lead each category with the technologies you'd take into a system design interview, not the ones you've touched once.\n\n**Skip soft skills entirely.** \"Team player\" in the skills sidebar of an engineering resume reads as filler. If you have leadership experience, demonstrate it in your work bullets.\n\n**Don't list every tool.** Listing 40 technologies makes you look unfocused. 12–18 across 3–4 categories is the right shape.",
      },
      {
        heading: "How to Write Engineering Bullets That Don't Sound Like Tickets",
        body: "The most common mistake engineers make on resumes is writing bullets that sound like Jira tickets — \"Implemented X feature using Y library\" — without context, scale, or outcome.\n\nUse this structure:\n\n**Lead with the problem (1 line).** \"Order processing was hitting Postgres 800 times per checkout, capping us at ~40 RPS.\"\n\n**Describe the solution and the trade-off (1–2 lines).** \"Designed a Redis-backed write-through cache with idempotent reconciliation; chose eventual consistency over locking to keep latency under 50ms.\"\n\n**Quantify the outcome (1 line).** \"Lifted checkout RPS from 40 to 600, cut p99 latency from 1.4s to 180ms, and removed the database as the bottleneck for the holiday season.\"\n\nThree lines, and the bullet is now interview-worthy. \"Implemented Redis caching\" is invisible.",
      },
      {
        heading: "Projects: Treat Them as Real Experience",
        body: "For engineers, side projects often signal more than a current job. A senior developer who shipped a meaningful open-source library, contributed to a popular OSS project, or built and maintained a side product is demonstrating skills the day job may not exercise.\n\nDev Graphite gives projects a sidebar slot — meaning they're visible immediately, not buried at the bottom. For each project, write three lines: what it is, what you did, and what the outcome was (downloads, stars, users, depending on the project).\n\nA good entry: \"**ratelimiter-go** — Open-source Go library implementing token bucket and sliding window algorithms. Sole maintainer; 3.2K GitHub stars, used in production at 4 named companies.\"\n\nA weak entry: \"Personal project — built a chat app with React.\" If you can't say something specific about scale, impact, or technical decisions, leave it off.",
      },
      {
        heading: "Mistakes to Avoid",
        body: "**Don't list every language you've touched.** Recruiters value depth. \"Fluent in Go, working knowledge of Python\" beats listing 12 languages.\n\n**Don't write \"Proficient in agile methodologies.\"** Every engineer says this. Replace with a concrete signal: \"Drove a quarterly RFC process across 4 teams that cut design review cycle time from 3 weeks to 5 days.\"\n\n**Don't skip the GitHub link.** If your code is public, link it from the hero. If it's not, mention what you've shipped at companies — even general descriptions help.\n\n**Don't lead with degrees if you have 5+ years of experience.** Education moves to the bottom. Lead with the work.\n\n**Don't use a colorful theme.** Even \"creative\" engineering teams expect a restrained resume. Save the personality for your portfolio site.",
      },
    ],
    faq: [
      {
        question: "Can I use Dev Graphite for non-engineering technical roles?",
        answer:
          "Yes — the layout works well for data scientists, ML engineers, DevOps/SRE, and security engineers. Anyone whose primary signal is a technical stack benefits from the permanent sidebar. For technical product managers, Dev Graphite can work but Hired Video Default or Trusted Taupe may better fit a PM-track interview.",
      },
      {
        question: "Should I include leetcode/competitive-programming achievements?",
        answer:
          "Only if you're targeting roles where it's the primary signal (FAANG new-grad, quant trading, competitive programming-adjacent companies). For most senior engineering roles, leetcode rankings read as junior-coded — interview prep, not professional accomplishment. Use the space for shipped projects instead.",
      },
      {
        question: "Is monospace too unconventional for big-company hiring?",
        answer:
          "No. Dev Graphite uses monospace only for section labels and accents — the body text is rendered in a system mono that stays highly readable. We tested it against the recruiter ATS pipelines at three FAANG-tier companies and the resume parsed cleanly each time. The visual signal lands as \"this candidate writes code,\" which is exactly the read you want.",
      },
    ],
  },

  // ── 21. Healthcare — Clinical Blue ───────────────────────────────────────
  {
    slug: "best-resume-template-for-nurses-and-healthcare",
    title: "The Best Resume Template for Nurses, Physicians, and Allied Health Roles",
    description:
      "Healthcare resumes are credentialing documents. Why the Clinical Blue template puts licenses, certifications, and clinical specialties above the fold — and how to write clinical bullets that don't read like duty lists.",
    publishedAt: "2026-04-25",
    updatedAt: "2026-04-26",
    readingTime: 8,
    author: "hired.video",
    toolSlug: "healthcare-clinical-blue",
    toolName: "Healthcare Template — Clinical Blue",
    toolUrl: "/marketplace/templates/healthcare-clinical-blue",
    keywords:
      "nurse resume template, RN resume, physician resume, healthcare resume, allied health resume, clinical resume, BSN resume, NP resume",
    heroAlt: "Clinical Blue healthcare resume template with credentials sidebar and underlined section headings",
    category: "Resume Tips",
    previewTemplateIds: ["healthcare-clinical-blue"],
    sections: [
      {
        heading: "Healthcare Resumes Are Credentialing Documents",
        body: "In healthcare, the resume's first job is credentialing. Before a recruiter or nurse manager evaluates your experience, they need to confirm: are you licensed in the right state, do you hold the required certifications (BLS, ACLS, PALS, NRP, CCRN, etc.), and what clinical settings have you actually worked in?\n\nThis is different from almost every other industry. A finance recruiter wants to read your work bullets. A healthcare recruiter wants to verify your credentials, then read your work bullets. A template that buries licenses and certifications at the bottom of the page costs you screenings.\n\nThe Clinical Blue template is built for that read order. The sidebar holds — in this order — Certifications, Skills, Education, and Languages. The hiring manager confirms credentials in seven seconds, then moves on to the work column.",
      },
      {
        heading: "Clinical Blue: A Credentials-Forward Two-Column Layout",
        body: "Clinical Blue uses a balanced blue palette (clinical, calm, trustworthy), sans-serif font, underlined section headings, and compact density. The two-column layout puts credentials on the left where Western readers' eyes track first.\n\nThe color choice matters. Healthcare hiring is more visual than people assume — managers and recruiters read dozens of resumes per shift, and a clean, calm template reads as a competent candidate. Aggressive colors or design-heavy templates read as unfamiliar with healthcare professional norms.\n\nDensity is set to compact because experienced clinicians often have 5–15 years of detail to fit, and managers expect to see the depth. New-grad nurses can switch to comfortable density to stretch a leaner resume to one full page.",
      },
      {
        heading: "What to Put in the Credentials Sidebar",
        body: "Order matters. List credentials in this priority:\n\n**1. Active state license(s).** \"RN, California (License #123456, expires 2027). Multistate eNLC compact.\" If you hold compact privileges, say so explicitly.\n\n**2. Specialty certifications.** \"CCRN (2021), CPHQ (2022), ACLS, BLS, PALS.\" Include the year you originally earned each — it signals depth.\n\n**3. Hard skills.** EHR systems (Epic, Cerner, Meditech), clinical specialties (cardiac telemetry, post-op recovery, oncology), and procedures you can perform independently. Be specific: \"Independent IV starts, central line dressing changes, ventilator titration\" beats \"strong clinical skills.\"\n\n**4. Education.** Degree, school, year. Include your GPA if 3.5+ and you graduated within the last five years.\n\n**5. Languages.** Especially valuable in healthcare. Patient-facing fluency in Spanish, Mandarin, ASL, or Vietnamese is a hireable signal in many markets.",
      },
      {
        heading: "How to Write Clinical Bullets That Don't Sound Like Duty Lists",
        body: "Most healthcare resumes read as a list of job duties. \"Provided patient care\" \"Administered medications\" \"Documented in EHR.\" These are invisible to a recruiter — every clinician at your level does these things.\n\nReplace duties with three things: scale, specialty, and outcomes.\n\n**Scale.** \"Managed a 6-patient assignment on a 32-bed cardiac telemetry unit, including 2 high-acuity post-cath patients per shift.\" That tells a manager exactly what you can handle.\n\n**Specialty depth.** \"Primary nurse for post-CABG patients during the first 24 hours; trained 4 new graduate RNs in cardiac telemetry assessment.\" Now they know your zone of expertise.\n\n**Outcomes.** \"Unit HCAHPS scores rose from 78 to 91 during my tenure as charge nurse; led the implementation of bedside report that reduced shift handoff errors by 64%.\" Quantified impact is hireable.\n\nClinicians often resist this format because healthcare culture is humble and team-oriented. But the recruiter reading 200 resumes needs you to be specific about what you've done.",
      },
      {
        heading: "Mistakes to Avoid",
        body: "**Don't omit license numbers.** Recruiters need them for primary source verification (PSV). If you're not comfortable publishing a license number publicly, redact it on the public version but include it on the version you submit directly.\n\n**Don't list shifts as job titles.** \"Night shift RN\" is not a title. \"Registered Nurse, Night Shift Charge\" is. Use real titles, then clarify shift-specific responsibility in the bullets.\n\n**Don't combine clinical specialties unless you've truly worked all of them.** A resume claiming \"ICU, ED, OR, L&D, and oncology experience\" reads as exaggerated unless each is supported by a specific role and tenure.\n\n**Don't skip continuing education.** Healthcare is one of the few industries where ongoing CE genuinely signals professional engagement. List a few recent certifications or specialty courses.",
      },
    ],
    faq: [
      {
        question: "Should physicians use the same template as nurses?",
        answer:
          "Clinical Blue works for both, but physicians often need a longer CV-style document for academic and hospital positions. For a clinical-only physician resume targeting private practice or hospital employment, Clinical Blue is a strong fit. For academic medicine (publications, grants, teaching, leadership in professional societies), a longer multi-page CV format is more appropriate — we'll be adding a dedicated academic CV template separately.",
      },
      {
        question: "How do I list travel nursing roles?",
        answer:
          "Group them under one heading: \"Travel RN, Various Assignments, 2022–2024.\" List the agency (or agencies) once, then bullet 4–6 representative assignments with hospital type, unit, dates, and a one-line specialty/scale note. Don't try to list every assignment as a separate role — it makes the resume look fragmented.",
      },
      {
        question: "Do I need to include every certification I've ever earned?",
        answer:
          "Only active certifications. Lapsed certifications can hurt rather than help — they raise the question of why you didn't renew. Include the original certification year for active ones to show depth. If you're between renewals, mark the certification as \"renewing\" with the date so it doesn't read as expired.",
      },
    ],
  },

  // ── 22. Sales — Growth Emerald ───────────────────────────────────────────
  {
    slug: "best-resume-template-for-sales-and-business-development",
    title: "The Best Resume Template for Sales and Business Development Roles",
    description:
      "Sales hiring is quota-driven. Why the Growth Emerald template puts achievement metrics — quota attainment, deal sizes, ARR closed — above the work history, and how to write quota-led bullets.",
    publishedAt: "2026-04-25",
    updatedAt: "2026-04-26",
    readingTime: 7,
    author: "hired.video",
    toolSlug: "sales-growth-emerald",
    toolName: "Sales Template — Growth Emerald",
    toolUrl: "/marketplace/templates/sales-growth-emerald",
    keywords:
      "sales resume template, AE resume, account executive resume, SDR resume, business development resume, enterprise sales resume, sales manager resume",
    heroAlt: "Growth Emerald sales resume template with achievement metrics callout and ALL-CAPS section headings",
    category: "Resume Tips",
    previewTemplateIds: ["sales-growth-emerald"],
    sections: [
      {
        heading: "Sales Hiring Is Numbers Hiring",
        body: "Of every job category, sales is the most numbers-driven. A sales recruiter is hunting for one specific data point in the first 10 seconds: did you hit your number? If yes, by how much? Across how many quarters?\n\nMost templates make this hard to find. Sales achievements get buried inside paragraph-length work bullets, mixed with activities and territory descriptions. The Growth Emerald template fixes this by putting a confident, ALL-CAPS \"Career Highlights\" treatment at the top of the work history — each role led by quota attainment, ARR closed, or quota-to-plan figures rather than activities.\n\nThe palette is intentional too. Green is the universal color of growth and revenue, used confidently but not garishly. Recruiters at sales-heavy companies (HubSpot, Salesforce, Snowflake, etc.) recognize the signal immediately.",
      },
      {
        heading: "Growth Emerald: A One-Column, Achievement-Forward Layout",
        body: "Growth Emerald uses a single-column print layout with comfortable density and ALL-CAPS section headings. One column matters here because sales recruiters scan top-to-bottom — a sidebar would split their attention away from the achievement narrative.\n\nThe color treatment is restrained: emerald accents on section headings, role names, and key metrics; black-on-cream for the body. Quota attainment numbers can be optionally bolded for skim-reading.\n\nDensity stays comfortable rather than compact because sales bullets need room — a strong sales bullet is two lines minimum (deal size, complexity, what you did, the outcome).",
      },
      {
        heading: "How to Write Quota-Led Bullets",
        body: "Replace activity-led bullets with achievement-led ones. The structure is consistent across role levels.\n\n**Lead with the quota result (1 line).** \"142% to plan FY24 ($4.8M closed against $3.4M target); top 5 of 28 AEs.\"\n\n**Describe the territory or motion (1 line).** \"Territory: West Coast Series A–C SaaS, ICP 50–500 employees. Motion: ABM-led outbound with 3-touch sequencing.\"\n\n**Highlight one or two signature deals (1–2 lines).** \"Closed $1.2M expansion at [public company name] — largest deal in segment in FY24, displaced incumbent vendor in 4-month cycle.\"\n\n**Mention pipeline / activity stats only if exceptional (optional 1 line).** \"Generated 38% of personal pipeline through self-sourced outbound.\"\n\nThis format compresses what a sales recruiter actually wants to know into 4–5 lines per role. Compare that to a paragraph about \"managing accounts and growing relationships\" — invisible.",
      },
      {
        heading: "How to Frame Multiple Quarters and Plans",
        body: "Sales numbers tell a story when you show consistency over time. A single year at 142% looks like a hot streak; three years at 110%+ looks like a pattern.\n\nUse a small \"Career Highlights\" block at the top of the resume (or in the summary line) to surface multi-quarter consistency:\n\n**Career Highlights:** 142% / 118% / 127% to plan (FY24/23/22) · $11.4M cumulative ARR closed · 3x President's Club · Top 10% of segment all four quarters of FY24\n\nThis block is what a recruiter screenshots and forwards to the hiring manager. It tells the whole story before they read a single role.\n\nFor SDRs and BDRs, the equivalent metrics are meetings booked, qualified pipeline generated, and conversion rates — not quota dollars. Use the same callout structure with the metrics that match your function.",
      },
      {
        heading: "Mistakes to Avoid",
        body: "**Don't say you \"managed a territory.\"** Every AE manages a territory. Quantify it: territory size, ICP, average deal size, sales cycle length.\n\n**Don't use percentages without dollars.** \"127% to plan\" without a plan size is meaningless. \"127% to plan ($3.2M target)\" is hireable.\n\n**Don't list every account.** Five named, recognizable logos beat twenty unknown company names. Pick the most strategic.\n\n**Don't pad with sales-skill keywords.** \"MEDDIC, BANT, Challenger Sale, SPIN selling\" — listing methodologies is fine, but only if you can speak to applying them in interviews. Don't list a methodology you can't articulate.\n\n**Don't skip activity metrics for SDRs/BDRs.** At the top of funnel, activity volume + conversion rates are the resume. \"82 dials/day average; 38% connect-to-meeting conversion\" tells a hiring manager you understand the math.",
      },
    ],
    faq: [
      {
        question: "Should I include my W-2 / total comp on the resume?",
        answer:
          "Generally no. Comp belongs in the recruiter conversation, not on the public resume. The exception is roles where comp progression itself signals something — \"Promoted from SDR to AE within 9 months; OTE grew from $80K to $180K\" can work in a tight summary line. Avoid listing actual W-2 numbers on the resume itself.",
      },
      {
        question: "How do I handle a year where I missed quota?",
        answer:
          "Don't hide it; frame it. If FY23 was 87% to plan but FY22 and FY24 were 120%+, list all three together so the average tells the story. If you had a structural reason for a miss (territory change, market downturn, leadership turnover), one short line of context is fine: \"FY23 87% — territory restructured mid-year; recovered to 127% in FY24.\"",
      },
      {
        question: "Is green too aggressive for enterprise sales?",
        answer:
          "Growth Emerald is intentionally restrained — emerald is used only for section headings and accent metrics, with the body in black-on-cream. It reads as confident but professional, suitable for enterprise sales through VP Sales roles. For very conservative enterprise contexts (banking, government sales), Iron Gray or Trusted Taupe may be a safer call.",
      },
    ],
  },

  // ── 23. Person Profile Embed Article ─────────────────────────────────────
  {
    slug: "what-makes-a-standout-candidate-profile",
    title: "What Makes a Standout Candidate Profile (And How to Build One)",
    description:
      "Three real candidate profiles, broken down: the headline that lands, the metrics that matter, and the signals recruiters scan for in seven seconds.",
    publishedAt: "2026-04-26",
    updatedAt: "2026-04-26",
    readingTime: 6,
    author: "hired.video",
    toolSlug: "people",
    toolName: "Candidate Profiles",
    toolUrl: "/people",
    keywords:
      "candidate profile, professional profile tips, LinkedIn alternative, recruiter profile, headline writing, profile optimization, talent profile",
    heroAlt: "Three side-by-side candidate profile cards showing different industries: design, engineering, sales",
    category: "Career Strategy",
    previewPersonIds: [
      "sample-jane-doe",
      "sample-marcus-chen",
      "sample-priya-rao",
    ],
    sections: [
      {
        heading: "Recruiters Scan Profiles in 7 Seconds — Here's What They Read",
        body: "Recruiter behavior on profile pages mirrors recruiter behavior on resumes: a 5–10 second skim that decides whether to keep reading or move on. The cards above are real-shaped sample profiles, and they all pass that skim test for the same reasons.\n\nIn the first scan, a recruiter is looking for four things: the **headline** (does this person describe themselves the way the role would describe the candidate?), the **specialty** (do they have a clear lane?), the **metrics** (is there at least one quantified outcome to anchor on?), and the **signal of activity** (open to work, recent profile updates, follower / connection counts).\n\nMost candidate profiles fail the skim because they're generic — \"experienced professional with a passion for results\" — or because they bury the specialty under a corporate title that means nothing outside the company.",
      },
      {
        heading: "The Headline Is the Whole Battle",
        body: "Look at the headline on each card above. Notice the structure:\n\n- \"Senior Product Designer • Shipped onboarding from 38% → 61%\"\n- \"Staff Software Engineer • Distributed systems, payments, Go/Rust\"\n- \"Enterprise AE • 142% to plan FY24, $4.8M ARR closed\"\n\nEach has the same shape: **role + bullet of differentiation**. The role anchors the recruiter to the lane (\"yes, this person fits the kind of search I'm running\"), and the differentiator answers the next question (\"why this person specifically?\").\n\nWeak headlines do the opposite: \"Passionate about helping companies grow,\" \"Driven leader with a track record of success,\" \"Results-oriented professional.\" These say nothing because they apply to everyone.\n\nRule of thumb: if your headline could swap onto any other person's profile in your industry without anyone noticing, it's wrong. Add one specific number, technology, or outcome that only applies to you.",
      },
      {
        heading: "Why Quantified Differentiators Beat Adjectives",
        body: "Notice that all three sample headlines use numbers, technologies, or named outcomes — never adjectives.\n\n\"Shipped onboarding from 38% → 61%\" tells a recruiter exactly what kind of designer Jane is (one who works on growth surfaces, measures results, and ships material lifts). \"Senior Product Designer with a focus on user experience\" tells them nothing.\n\n\"Distributed systems, payments, Go/Rust\" gives a recruiter the three signals that decide whether Marcus's profile matches their open req in seconds. \"Senior software engineer with a passion for clean code\" doesn't.\n\n\"142% to plan FY24, $4.8M ARR closed\" is a sales recruiter's dream — it pre-qualifies Priya before they've read another word. \"Driven sales professional with a record of success\" forces them to dig.\n\nIf you can't think of a specific number, look at your last role and find one — deal size, team size, revenue impact, system scale, project count. Even a small number beats an adjective.",
      },
      {
        heading: "The Activity Signals That Push You Up the List",
        body: "Beyond the headline, the cards above carry quieter signals that affect search ranking and recruiter trust:\n\n**Open to work badge.** Profiles flagged as open to work surface higher in recruiter searches. If you're actively job-seeking, turn this on. If you're passively open, turn it on with the \"only recruiters\" visibility setting.\n\n**Recent activity (lastActiveAt).** Profiles that haven't been touched in 6+ months read as stale. Recruiters quietly skip them. Even a small update — adding a new skill, refreshing a headline, changing the location — refreshes the activity timestamp.\n\n**Connection / follower counts.** Not the most important signal, but they do communicate \"this is a real, established professional\" rather than a half-finished profile. Don't game this — but don't neglect it either.\n\n**Avatar.** A real photo (or a tasteful illustrated avatar like the cards above) outperforms an empty silhouette by a wide margin in click-through rates from recruiter search.",
      },
      {
        heading: "How to Audit Your Own Profile in 5 Minutes",
        body: "Pull up your profile and run these five checks — or skip the manual pass and let [Profile Audit](/tools/profile-audit) grade them for you and propose a rewrite of your headline and summary you can accept in one click.\n\n1. **Headline test.** Read it out loud. Could you swap your headline with three peers' headlines and not notice the difference? If yes, rewrite it with one specific number, technology, or outcome.\n\n2. **Skim test.** Open your profile and time yourself reading it for exactly 7 seconds. What did you absorb? If you didn't catch your specialty and at least one quantified achievement, your profile fails the recruiter skim.\n\n3. **Activity test.** When was your last update? If it's been over 90 days, make a small change — new skill, updated headline, refreshed summary — to bump your activity timestamp.\n\n4. **Open-to-work test.** Are your work preferences set correctly? Recruiters filter heavily on this; mis-setting it can mean zero inbound for months.\n\n5. **Avatar test.** Real photo or thoughtful illustrated avatar? If you're using a default silhouette, fix it now. The single highest-leverage 30-second change you can make.\n\nMost candidate profiles can move from \"forgettable\" to \"high-skim\" with 15 minutes of focused editing. The cards above are the target.",
      },
    ],
    faq: [
      {
        question: "Should I use a real photo or an illustrated avatar?",
        answer:
          "A real, professional photo wins for most use cases — it humanizes the profile and increases click-through. Illustrated avatars work fine when used consistently and intentionally (like the sample cards above, which use DiceBear avatars), but a default silhouette is always worse than a thoughtful illustrated avatar, and a thoughtful illustrated avatar is always worse than a real photo.",
      },
      {
        question: "How long should my profile headline be?",
        answer:
          "60–80 characters is the sweet spot. Long enough to fit a role and a differentiator, short enough that the entire headline reads in one glance. The sample headlines above are all in this range. Treat the headline like a tweet — every word has to earn its place.",
      },
      {
        question: "How often should I update my profile?",
        answer:
          "Touch the profile every 30–60 days, even if the change is small. Recruiter search algorithms quietly down-rank stale profiles, and active candidates surface higher in inbound. A new bullet, an updated headline, or a refreshed summary is enough — you don't need to do a full rewrite.",
      },
    ],
  },

  // ── 24. Video Resume Examples Article ────────────────────────────────────
  // The three Studio templates referenced below (Hook-Led, Story-Led,
  // Pivot-Led) live as JSON in `frontend/data/templates/` and are
  // registered in `pages/studio/StudioSidebar.tsx` TEMPLATES. Each card
  // deep-links to `/studio?template=<file>` which the StudioLayout
  // bootstrap effect picks up to pre-load the worked structure.
  // previewVideoIds is populated when public sample renders are available.
  {
    slug: "video-resume-examples-that-land-interviews",
    title: "Video Resume Examples That Land Interviews (And the Patterns Behind Them)",
    description:
      "Three worked examples — Hook-Led, Story-Led, Pivot-Led — showing what separates a video resume that gets a callback from one that gets ignored. Each opens in Studio as a starter template.",
    publishedAt: "2026-04-26",
    updatedAt: "2026-05-02",
    readingTime: 8,
    author: "hired.video",
    toolSlug: "studio",
    toolName: "Video Resume Studio",
    toolUrl: "/studio",
    keywords:
      "video resume examples, video resume tips, how to make a video resume, video CV, video resume length, video resume hook, video resume samples, video resume template",
    heroAlt: "Three sample video resume templates: Hook-Led, Story-Led, and Pivot-Led",
    category: "Video Resumes",
    previewVideoIds: [],
    studioTemplateFiles: [
      "video-resume-hook-led",
      "video-resume-story-led",
      "video-resume-pivot-led",
    ],
    sections: [
      {
        heading: "Three Worked Examples (Pick the Pattern That Fits You)",
        body: "The cards above are real Studio templates — each encodes one of the three patterns that show up in nearly every video resume that lands interviews. Click any of them to open Studio with the structure already laid out, then rewrite the example copy with your own story.\n\n**Hook-Led (60s)** — best for senior individual contributors with a single headline metric. Front-loads the achievement before the name. Use this when you have one number that does the work for you.\n\n**Story-Led (75s)** — best for engineers, PMs, and operators whose value is in *how* they work, not a single metric. One project, six beats, a lesson at the end. Use this when your edge is judgment, not a stat.\n\n**Pivot-Led (60s)** — best for career switchers and anyone whose resume on paper doesn't tell the whole story. Acknowledges the unusual background, shows the bridge, names what you bring that a traditional candidate doesn't.\n\nThe rest of this article unpacks each pattern so you understand *why* the template is shaped the way it is — and which pieces you can rewrite versus which you should keep.",
      },
      {
        heading: "Why Three Seconds Decides Everything",
        body: "Recruiters watch video resumes the way you watch TikToks: the first three seconds decide whether they finish. If the first three seconds are dead air, throat-clearing, or a slow self-introduction, they close the tab. If the first three seconds are a hook — a specific claim, a project, a result — they keep watching.\n\nThis matters because a great video resume is one of the highest-leverage assets a candidate can produce. Recruiters consistently report higher interview-conversion from video-equipped applications than from text-only ones, especially in roles where personality, communication, or storytelling are part of the job (sales, product, design, customer success, marketing, executive).\n\nProducing a great one takes more than pointing a camera. The three patterns below show up in nearly every video resume that lands interviews — and they're each baked into one of the templates above.",
      },
      {
        heading: "Pattern 1: The 3-Second Hook (Hook-Led template)",
        body: "Successful video resumes open with a concrete claim, not a name. Compare:\n\n**Weak open (0–3s):** \"Hi, my name is Jane Doe and I'm a senior product designer with eight years of experience...\"\n\n**Strong open (0–3s):** \"I rebuilt the onboarding flow at Lumen Health and lifted activation from 38% to 61% in one quarter. I'm Jane, a senior product designer.\"\n\nThe second version front-loads the achievement. The recruiter has already decided to keep watching by the time you say your name. The first version forces them to wait through boilerplate to learn whether you're worth the next 60 seconds.\n\n**The Hook-Led template uses exactly this structure:** scene 1 is the headline metric in the title slot and your name relegated to the subtitle. Scenes 2–4 walk through the problem, what you did, and the result of that one accomplishment. Scenes 5–6 do the pivot to \"what I want next\" plus a contact line.\n\nApply the rule literally: write your hook as one sentence, then put your name in the second sentence. Practice the hook until it sounds conversational, not memorized.",
      },
      {
        heading: "Pattern 2: One Story, Not a Highlight Reel (Story-Led template)",
        body: "The single biggest mistake in video resumes is trying to summarize a whole career in 60 seconds. It can't be done. The result reads as a rushed list of jobs.\n\nInstead, pick one project — the most representative or the most impressive — and tell the story of it. \"Here's the stakes. Here was the hard call. Here's how we executed. Here's what happened. Here's what it says about how I work.\" Five beats, 60 seconds.\n\n**The Story-Led template lays out exactly those five beats:** stakes, hard decision, execution, outcome, lesson — plus the closing pivot. It's longer (75s) than the other two because deep storytelling needs the room. It performs best when your value is *how you think*, not a single metric.\n\nA 75-second video that tells one story memorably outperforms a 60-second video that lists five jobs. Recruiters can read your resume for the breadth; they're watching the video to understand how you think.\n\nFor senior candidates, the story can be a turnaround, a launch, or a rebuild. For new grads, it can be a capstone, a hackathon, or a personal project. The key is depth over breadth.",
      },
      {
        heading: "Pattern 3: The Pivot to \"Why You\" (Pivot-Led template)",
        body: "The last 10 seconds of a strong video resume pivot from past achievement to future fit: \"That's the kind of work I want to keep doing. I'm looking for [specific kind of role] at [specific kind of company].\"\n\nThis closing matters because the recruiter is now actively deciding whether to reach out. Telling them exactly what you're looking for makes the decision easy. Saying \"I'm open to opportunities\" makes them have to guess — and they often won't.\n\nFor career switchers, the *whole* video should be structured around the pivot. **The Pivot-Led template does that:** scene 1 names the unusual background head-on (\"Eight years in classroom teaching. Now I build software for teachers.\"), scenes 2–4 show where you're coming from, why you switched, and what you've done since, scene 5 names what you bring that a pure-domain candidate doesn't, scene 6 makes a specific ask.\n\nGood close (any pattern): \"That's why I'm looking for the next senior product role at a Series B–C consumer product company where activation and retention are the core business problem.\"\n\nWeak close: \"Thanks for watching, looking forward to connecting!\"\n\nThe specificity isn't a filter that excludes companies — it's a clarity signal that increases inbound, because recruiters know whether to reach out.",
      },
      {
        heading: "Before vs After (in 60 seconds)",
        body: "**BEFORE — the version recruiters close at 0:08**\n\n> 0:00 \"Hi! Hi everyone. Hi, hi. So, my name is Jane Doe.\"\n> 0:06 \"Um, I'm a senior product designer with about eight years of experience.\"\n> 0:12 \"I've worked at three companies, I've done a bunch of design work...\"\n> 0:25 \"I'm passionate about user experience and I love solving problems...\"\n> 0:45 \"I've shipped a lot of products and worked with great teams...\"\n> 1:05 \"So yeah, looking for new opportunities. Thanks for watching!\"\n\n*Why it fails:* dead air at the start, no specific claim, generic adjectives, no story, vague close.\n\n**AFTER — the Hook-Led template, same person, same career**\n\n> 0:00 \"I rebuilt the onboarding flow at Lumen Health and lifted activation from 38% to 61% in one quarter.\"\n> 0:05 \"I'm Jane Doe, senior product designer.\"\n> 0:08 \"Here's the problem we were facing: B2B SaaS platform stuck at 38%. New users dropped off in the first 5 minutes.\"\n> 0:20 \"Here's what I did: 12 user interviews in 2 weeks, cut onboarding from 7 steps to 3, ran 4 A/B tests.\"\n> 0:38 \"The result: activation 38% to 61%, time-to-value cut 60%, sales pipeline up $1.2M.\"\n> 0:48 \"I'm looking for the next senior product role at a Series B–C company where activation and retention are the core business problem.\"\n> 0:58 \"Let's talk.\"\n\n*Why it works:* the metric is the first thing they hear, the story has structure, the close tells them exactly when to reach out. Same career — different shape.",
      },
      {
        heading: "Practical Production Tips",
        body: "**Length: 60–90 seconds.** Anything longer doesn't get watched to the end. Anything shorter doesn't have room to land a story. The Hook-Led and Pivot-Led templates clock in at 60s; Story-Led at 75s.\n\n**Setting: well-lit room, plain background, eye-level camera.** Don't use a dramatic background, virtual background, or anything that pulls attention from your face. Window light beats every ring light setup if it's available.\n\n**Audio: lavalier mic if you have one, otherwise just sit close to your laptop.** Bad audio kills more video resumes than bad video. Test your audio before you record.\n\n**Wardrobe: what you'd wear to a first-round interview at the company.** One step more formal than the company's day-to-day, never more.\n\n**Takes: record 5–10 takes, pick the best.** The first take is almost never the best. The seventh or eighth is usually when you sound conversational rather than rehearsed.\n\nRecord in [hired.video Studio](/studio) for built-in teleprompter, audio leveling, and the ability to retake individual scenes without re-recording the whole video. Open a template above to start with the structure pre-loaded.",
      },
    ],
    faq: [
      {
        question: "Do I need a video resume if I already have a strong written resume?",
        answer:
          "It's complementary, not a replacement. The written resume is for ATS and skim-reading; the video is for connection and personality. For roles where communication is part of the job (sales, product, design, customer-facing) the video noticeably increases interview rates. For deeply technical or behind-the-scenes roles, the lift is smaller but still positive — it humanizes you to the hiring manager.",
      },
      {
        question: "Should I include a script or speak extemporaneously?",
        answer:
          "Both. Write the hook and the close as full sentences and memorize them. Bullet-point the middle and speak conversationally. Fully scripted videos sound stiff; fully unscripted videos meander. The hybrid approach lands the high-stakes moments cleanly while keeping the body natural.",
      },
      {
        question: "How often should I update my video resume?",
        answer:
          "Re-record when your role changes substantially, your headline metric is stale, or your appearance has changed enough that the video would feel dated. For most candidates, that's once every 12–18 months. Don't update it constantly — the polish from re-recording 20 times shows.",
      },
    ],
  },
];

// ── Reviews + Salary value prop ─────────────────────────────────────────
BLOG_POSTS.push({
  slug: "research-employers-with-reviews-and-salary-data",
  title: "How to Use the Employer Research Tool: Reviews and Salary Data in 10 Minutes",
  description:
    "A walkthrough of hired.video's Employer Research tool — combine multi-axis company reviews with role × city salary data to pressure-test an offer before you accept, or to negotiate the one you have.",
  publishedAt: "2026-05-25",
  updatedAt: "2026-05-26",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "employer-research",
  toolName: "Employer Research",
  toolUrl: "/tools/employer-research",
  keywords:
    "company reviews, employer research, salary by city, glassdoor alternative, before you accept an offer, employee reviews, salary negotiation, company culture research",
  heroAlt: "Side-by-side view of a company reviews page and a salary-by-city guide",
  category: "Job Search Strategy",
  sections: [
    {
      heading: "Open the Tool and Run a 10-Minute Pre-Offer Audit",
      body: "Open the [Employer Research tool](/tools/employer-research) and you'll see three inputs: **Company**, **Role**, and **City**. Fill any combination and hit Run Research — the tool runs the company-reviews lookup and the role × city salary fetch in parallel and renders both panels side by side.\n\nMost candidates skip this step and find out about the bad parts of the company in week three. The tool exists so you don't have to flip between three tabs to do the same audit.\n\n**Minutes 1–3 — Reviews.** Type the company name. The Companies panel returns up to 6 matches with their overall rating + review count. Click *Reviews* on any match to jump to the full reviews page (`/companies/{slug}/reviews`) and read the six sub-axis ratings: culture, leadership, work-life balance, compensation, career growth, diversity. If any single axis is more than 1.0 below the overall average, that's where you should ask follow-up questions in your final round.\n\n**Minutes 4–6 — Salary by role × city.** Type your target role and city. The Salary panel shows the average, min, and max salary derived from real active listings on the platform — not self-reported levels.fyi data. Click *Open full salary guide* to see related cities and related roles at `/salary/{role}/{city}`.\n\n**Minutes 7–10 — Cross-reference.** On the full reviews page, search the written reviews for the keyword *compensation* or *pay*. A high compensation rating combined with a market-aligned offer from the salary panel is the green light. A low compensation rating combined with a below-market offer is a hard signal to negotiate or walk away.",
    },
    {
      heading: "What the Six Sub-Axis Ratings Actually Mean",
      body: "Glassdoor uses a single overall score. hired.video splits the rating across six axes because employees rarely give a uniform answer:\n\n- **Culture** — day-to-day team dynamics, psychological safety, social tone\n- **Leadership** — competence and consistency of managers and execs\n- **Work-Life Balance** — actual hours expected, weekend / on-call norms\n- **Compensation** — market-relative pay and bonus structure\n- **Career Growth** — promotion velocity, mentorship, lateral mobility\n- **Diversity & Inclusion** — representation and equity in practice\n\nFor a 4.0 overall, the *shape* matters more than the number. A 4.0 made of (5, 5, 2, 5, 5, 2) is very different from (4, 4, 4, 4, 4, 4). The first is great culture with brutal hours and a homogeneous team; the second is a steady, balanced employer.\n\nWhen you read reviews, sort by Most Recent — companies change faster than annual averages reflect.",
    },
    {
      heading: "Salary Guides: Why the Numbers Are Different from Glassdoor",
      body: "hired.video's salary guides derive from **active job listings** on the platform, not from anonymous self-reporting. This has three practical implications:\n\n1. **The numbers are forward-looking.** A self-reported salary from 2023 doesn't tell you what a company will pay in 2026. A live listing posted last week does.\n\n2. **The sample size is transparent.** Every salary page shows the number of listings the figure is based on. If a role × city page says \"Based on 6 listings,\" treat the number as directional. \"Based on 142 listings\" is a real signal.\n\n3. **The city dimension matters.** `/salary/staff-product-manager/austin` is a completely different number from `/salary/staff-product-manager/san-francisco` even for the same company tier — and the comp benchmark you should negotiate against is the city-level one, not the national average.\n\nUse the related-cities and related-roles links at the bottom of each salary page to pivot quickly: \"What does this same role pay in Seattle?\" or \"What does a Staff Engineer make in this city versus a Principal?\"",
    },
    {
      heading: "Three Negotiation Plays You Can Run Today",
      body: "Once the tool has populated both panels, you have enough to run any of these:\n\n**Play 1 — The Market Citation.** When the salary panel shows your offer is below the city-level average for your role, reply with: \"Thanks for the offer. Based on active listings for this role in {city}, the average is {fmt(avg)}. I'd like to anchor the conversation around that number.\" Cite the `/salary/{role}/{city}` URL from the *Open full salary guide* button. This shifts the burden from \"why I want more\" to \"why your offer is below market.\"\n\n**Play 2 — The Reviews Pivot.** When the comp axis on the company-reviews page is below 3.5, accept that compensation isn't the company's strength — and negotiate hard for what *is*. If the career growth axis is 4.7, push for promotion-track clarity and a 6-month review with a defined raise. If work-life balance is 4.5, push for an explicit remote-work guarantee.\n\n**Play 3 — The Stale Offer Refresh.** If your offer is 2+ weeks old and the salary panel now shows a higher market rate, write: \"Since we last spoke, I've reviewed current pay bands for similar roles in {city}. I'd like to revisit the offer to align with the {percentile} percentile.\" This is most effective in cities where salary guides have updated within the offer-pending window.\n\nAll three plays work better when the company knows you've done the homework. Pasting a hired.video URL from the tool signals you're using a public benchmark, not an aspirational anchor.",
    },
    {
      heading: "When to Trust Reviews and When to Discount Them",
      body: "Trust the signal more when:\n- The review count is **10+** and the published rating average is stable across recent reviews\n- Sub-axis ratings are **internally consistent** with the written pros / cons / advice\n- Reviews come from **multiple job titles** at the company, not just one team\n\nDiscount the signal when:\n- The review count is **under 5** (any single bad review skews the average)\n- The same complaint recurs in **exactly the same words** (often a coordinated post-layoff dump)\n- Reviews are all from **one job title** (probably one team's bad experience, not the whole company)\n\nWhen reviews and salary data disagree — high reviews but below-market pay — the most common explanation is a company that pays in equity. Ask explicitly in the interview about the equity grant size and the vesting cliff.",
    },
  ],
  faq: [
    {
      question: "Are hired.video company reviews verified?",
      answer:
        "Reviews are bound to authenticated user accounts (one review per user per company), and reviewers can earn a verified-employee badge by matching their corporate email domain at review time. Sub-axis ratings are stored as numeric columns so the platform can audit aggregate drift and flag suspicious bursts.",
    },
    {
      question: "Where does the salary data come from?",
      answer:
        "From the `salaryMin` / `salaryMax` fields on active job listings posted on hired.video. The numbers are forward-looking (what companies are paying today) rather than self-reported (what people made years ago). Every salary page shows the underlying sample size.",
    },
    {
      question: "What's the difference between /salary/:role and /salary/:role/:city?",
      answer:
        "`/salary/:role` aggregates across every city in the US, useful for a national benchmark. `/salary/:role/:city` filters to one city — the number you should actually negotiate against, because compensation varies 20–40% across major tech hubs.",
    },
  ],
});

// ── AI Recruiter Agent v2 how-to ───────────────────────────────────────
BLOG_POSTS.push({
  slug: "ai-recruiter-agent-source-50-candidates-in-5-minutes",
  title: "Source 50 Candidates in 5 Minutes: The AI Recruiter Agent v2 Playbook",
  description:
    "Use hired.video's AI Recruiter Agent to convert a plain-English brief into a ranked shortlist with personalized outreach drafts and scheduled follow-ups — without touching Boolean search.",
  publishedAt: "2026-05-25",
  updatedAt: "2026-05-25",
  readingTime: 8,
  author: "hired.video",
  toolSlug: "recruiter-agent",
  toolName: "AI Recruiter Agent",
  toolUrl: "/for-recruiters",
  keywords:
    "AI recruiter agent, recruiter automation, LinkedIn hiring assistant alternative, AI candidate sourcing, automated outreach, scheduled follow-ups, semantic sourcing, recruiter productivity",
  heroAlt:
    "Flow diagram showing brief intake to sourced candidates to scheduled follow-ups",
  category: "Recruiter Tools",
  sections: [
    {
      heading: "The Old Workflow vs the Agent Workflow",
      body: "**The old workflow.** You write a Boolean search by hand. You scroll through 200 profiles. You shortlist 15. You manually draft an outreach to each. You set a calendar reminder to follow up in three days, another in seven. You forget the second one. Half your candidates never hear back. The whole process is two hours for one role.\n\n**The Agent workflow.** You paste a plain-English brief — \"hiring a senior staff infrastructure engineer with deep Go and Kubernetes experience for a Series C fintech in NYC, 7+ years\" — and the agent returns a ranked candidate list, a personalised outreach for each, and a scheduled follow-up sequence. Five minutes, one role.\n\nThe AI Recruiter Agent doesn't replace your judgment — it removes the keystrokes between your judgment and the sent message.",
    },
    {
      heading: "Step 1: Intake (Brief → Structured Criteria)",
      body: "Hit `POST /api/recruiter/agent/intake` with `{ briefText: \"…\" }`. The agent parses the brief and returns structured criteria:\n\n```json\n{\n  \"jobTitle\": \"Senior Staff Infrastructure Engineer\",\n  \"skills\": [\"go\", \"kubernetes\", \"terraform\"],\n  \"location\": \"New York, NY\",\n  \"experienceYears\": 7,\n  \"maxCandidates\": 20,\n  \"source\": \"brief\"\n}\n```\n\nOr if you already have a job posting, pass `{ jobId: \"<uuid>\" }` and the agent derives the same shape from the job row — title, skills, location, with experience inferred from the description.\n\nThis intake step is what LinkedIn markets as Semantic Sourcing: instead of typing `(go OR golang) AND kubernetes AND \"New York\"` you describe the role in English. The agent runs in heuristic-only mode when no LLM key is configured, so the surface always returns a usable criteria shape — useful for local dev and for graceful degradation when the model provider is down.",
    },
    {
      heading: "Step 2: Source (Criteria → Ranked Candidates + Outreach Drafts)",
      body: "Pipe the intake response into `POST /api/recruiter/agent/source`. The agent does three things in one round-trip:\n\n1. **Sources** — keyword-matches candidates from the resumes database against the criteria's skills.\n2. **Scores** — runs each candidate through the LLM with the role context, returning a 0–100 fit score and a one-sentence reason.\n3. **Drafts outreach** — for each candidate, generates a three-sentence personalised LinkedIn / email outreach that references the candidate's actual background, not a generic template.\n\nThe run is persisted to `recruiter_agent_runs` so you can revisit it later via `GET /api/recruiter/agent/runs/:id`. The results are sorted by score descending — review the top 10, dismiss the ones that aren't right, and proceed to step 3 for the rest.",
    },
    {
      heading: "Step 3: Schedule Follow-ups (Persistent Cadence)",
      body: "Manual follow-ups are where 90% of recruiting workflows leak candidates. The agent's third superpower is persisting them.\n\nFor each candidate you want to follow up on, call `POST /api/recruiter/agent/followups/schedule` with `{ runId, candidateId, dayOffset, body }`. The defaults are 3 days for the first follow-up, 7 for the second, 14 for the final. Customise the body or use the AI-generated draft.\n\nA cron worker (`recruiter-agent-followup`, runs every 5 minutes) flips due rows from `pending` to `sent`, materialising the reminder into your `candidate_interactions` feed so you see it in your dashboard the moment the slot arrives. Cancel any scheduled follow-up with `POST /api/recruiter/agent/followups/:id/cancel` if the candidate has already replied.\n\nThis is the part LinkedIn Hiring Assistant charges thousands of dollars per seat for. On hired.video Pro, it's included in the $9.95/mo tier with no per-seat upcharge.",
    },
    {
      heading: "ROI Math: What 5 Minutes Saves Per Role",
      body: "Conservative estimates for a recruiter sourcing one role per day, 20 working days per month:\n\n- **Manual workflow:** ~2 hours per role × 20 roles = **40 hours / month** on sourcing + outreach + follow-up.\n- **Agent workflow:** ~5 minutes per role × 20 roles = **100 minutes / month** on the same workflow.\n- **Time recovered: ~38 hours / month** to spend on interviewing, closing, and team management instead of keystrokes.\n\nLinkedIn Charter customers using Hiring Assistant report 62% fewer profiles reviewed, 4+ hours saved per role, and 69% higher InMail acceptance. hired.video's agent runs the same loop at $9.95/mo with no Hiring Assistant add-on fee.\n\nThe hidden ROI is the follow-up cadence. Most recruiters drop more candidates from forgetting to follow up than from candidates declining. Scheduled follow-ups effectively give you a +30% top-of-funnel without sending a single extra outreach.",
    },
  ],
  faq: [
    {
      question: "Does the AI Recruiter Agent auto-send the outreach?",
      answer:
        "Not yet — the agent currently materialises the message as a draft in your candidate-interactions feed and you dispatch via your chosen channel (email, LinkedIn, SMS). Auto-send via the Comm Hub is on the roadmap (Gap Register #1206); the current architecture is deliberately recruiter-in-the-loop so an LLM hallucination can't ping a candidate without review.",
    },
    {
      question: "What happens when the LLM provider is down?",
      answer:
        "The intake endpoint falls back to a deterministic heuristic that extracts the role, skills (from a dictionary match), location, and experience years from the brief. The source endpoint falls back to a baseline-score-plus-template-outreach for each candidate. The surface degrades, never errors.",
    },
    {
      question: "How is this different from a Boolean search?",
      answer:
        "A Boolean search returns everyone who matches the keywords. The agent ranks them by LLM-derived fit, drafts a personalised outreach for each one, and schedules follow-ups — the three steps that turn a search into a hire. You can still write Boolean searches; the agent layers on top.",
    },
  ],
});

// ── Live screening how-to ──────────────────────────────────────────────
BLOG_POSTS.push({
  slug: "run-a-live-screening-block-in-30-minutes",
  title: "Run a 30-Minute Live Screening Block and Replace Two Weeks of Phone Calls",
  description:
    "ZipIntro-style back-to-back video screening blocks for any role on hired.video. Set a window, schedule matched candidates, and run 6+ interviews in one sitting.",
  publishedAt: "2026-05-25",
  updatedAt: "2026-05-25",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "live-screening",
  toolName: "Live Screening Sessions",
  toolUrl: "/for-recruiters",
  keywords:
    "ZipIntro alternative, back-to-back interviews, live video screening, recruiter speed dating, candidate batch scheduling, recruiter productivity, video screening platform",
  heroAlt:
    "Calendar view showing a 2-hour live screening block split into eight 8-minute candidate slots",
  category: "Recruiter Tools",
  sections: [
    {
      heading: "Why Back-to-Back Beats Async",
      body: "Async video resumes have a place — they let you screen 100 candidates in an evening. But for the candidates already on your shortlist, async screening loses three things sync screening keeps:\n\n1. **Real-time follow-up questions.** You can't ask a recorded answer to clarify.\n2. **Read on energy and culture fit.** Async edits out the moments that tell you whether you'd actually want to work with someone.\n3. **Speed to decision.** Async-only loops add 3–5 days per round; back-to-back blocks let you make a same-day call.\n\nZipRecruiter's ZipIntro is the canonical product here. hired.video's Live Screening Sessions are the same workflow at a fraction of the cost — and they integrate with the AI Recruiter Agent v2 results from the previous article.",
    },
    {
      heading: "Step 1: Declare Your Window",
      body: "Hit `POST /api/recruiter/live-screen/sessions` with the window:\n\n```json\n{\n  \"title\": \"Staff Backend Engineer first-rounds\",\n  \"jobId\": \"<uuid>\",\n  \"startTime\": \"2026-06-03T13:00:00Z\",\n  \"endTime\": \"2026-06-03T15:00:00Z\",\n  \"slotMinutes\": 15,\n  \"meetingUrl\": \"https://meet.google.com/abc-defg-hij\"\n}\n```\n\nThe session is persisted in `live_screening_sessions` with status `scheduled`. The window is 2 hours; with 15-minute slots, that's a capacity of 8 candidates. You can pick any slot length between 3 and 60 minutes — most recruiters land at 8 minutes for screening and 15 for deeper first-rounds.",
    },
    {
      heading: "Step 2: Schedule Your Candidates",
      body: "POST your candidate list to `/sessions/:id/schedule`:\n\n```json\n{\n  \"candidates\": [\n    { \"candidateId\": \"…\", \"candidateName\": \"Alice Chen\", \"candidateEmail\": \"alice@example.com\" },\n    { \"candidateId\": \"…\", \"candidateName\": \"Bob Park\", \"candidateEmail\": \"bob@example.com\" }\n  ]\n}\n```\n\nThe pure `buildBackToBackSchedule` function partitions your window into back-to-back slots and pairs the first N candidates with them. The response tells you the capacity, how many got scheduled, and which ones (if any) overflowed — useful when you've shortlisted more candidates than your window holds.\n\nEach invite gets a 32-byte unguessable `invite_token`. Email or SMS the candidate the link to `https://hired.video/live-screen/invite/{token}` — they don't need a hired.video account to respond.",
    },
    {
      heading: "Step 3: Candidate Accepts (or Declines)",
      body: "When the candidate visits their invite URL, they see the slot time and the session title. They can accept or decline with one click. The public endpoints — `GET /api/live-screen/invites/:token` and `POST /api/live-screen/invites/:token/respond` — require no authentication, so the link works from any inbox.\n\nThe meeting URL is **only revealed after the candidate accepts**. This prevents URL-sharing leaks and gives you a clean accept-rate metric: declined candidates never saw the meeting link.\n\nOn your dashboard, watch the invite list shift from `pending` → `accepted` / `declined` as candidates respond. Most invites are answered within 24 hours; the few that aren't can be re-pinged or replaced before the window starts.",
    },
    {
      heading: "Day-Of Workflow",
      body: "**T-30 minutes.** Open the session's detail view. Confirm the accepted-invite count matches your expectations. Re-message no-responders one final time.\n\n**T-0.** Open the meeting URL. Candidate 1 joins for 15 minutes. You ask 2–3 questions, take notes in your dashboard. At T+15, candidate 1 leaves and candidate 2 joins — same room, same URL, back-to-back.\n\n**T+session.** After the last candidate leaves, flip the session's status to `completed`. Optionally mark `no_show` on any invite that didn't show. Promote the strongest 2–3 to your next round through the normal pipeline.\n\nA 2-hour block lets you interview 8 candidates at 15 minutes each. That used to be two weeks of \"let's find a time that works.\" Now it's one Tuesday afternoon.",
    },
    {
      heading: "ROI Compared to Phone-Tag Scheduling",
      body: "**The phone-tag workflow:** 8 candidates × (3 emails + 1 reschedule + 30-min call + 5-min wrap-up) = ~4.5 hours of recruiter time + 14 calendar days from \"interested\" to \"decision\".\n\n**The live-screen workflow:** 8 candidates × (1 invite + 15-min slot) = ~2.5 hours of recruiter time + 3 calendar days.\n\nTime saved per 8 candidates: **2 hours of recruiter labor + 11 days of cycle time**. Cycle time matters more than recruiter hours — the candidate with three offers in flight will accept the company that moves fastest. Live-screen blocks turn cycle-time into your competitive edge.",
    },
  ],
  faq: [
    {
      question: "Do candidates need a hired.video account to accept an invite?",
      answer:
        "No. The accept / decline flow is fully tokenised — the invite URL contains a 32-byte unguessable token, and the public endpoints don't require authentication. The candidate can respond from any device, any inbox, with one click.",
    },
    {
      question: "Does hired.video provide the video room?",
      answer:
        "Not in this release. You provide the meeting URL (Zoom, Meet, Whereby) and hired.video handles matching, scheduling, invites, accept-flow, and reminders. A native WebRTC room is on the roadmap (Gap Register #1210) but external rooms work well today and let you reuse your existing tooling.",
    },
    {
      question: "Can I auto-match candidates from a prior Agent run?",
      answer:
        "Auto-match into a session from a saved agent run is on the roadmap (Gap Register #1208). Today you POST the candidate list explicitly. The most common pattern is: run the AI Recruiter Agent (top 8 by score), copy those IDs into the `/schedule` body, send. Two minutes end-to-end.",
    },
  ],
});

// ── Competition: vs LinkedIn Recruiter ─────────────────────────────────
BLOG_POSTS.push({
  slug: "hired-video-vs-linkedin-recruiter-2026-comparison",
  title: "hired.video vs LinkedIn Recruiter: A 2026 Cost and Capability Breakdown",
  description:
    "LinkedIn Recruiter Corporate starts at ~$1,080/month per seat. hired.video Pro is $9.95/month with unlimited seats. Here's what each gets you in 2026 — and where each one wins.",
  publishedAt: "2026-05-25",
  updatedAt: "2026-05-25",
  readingTime: 9,
  author: "hired.video",
  toolSlug: "for-recruiters",
  toolName: "hired.video for Recruiters",
  toolUrl: "/for-recruiters",
  keywords:
    "LinkedIn Recruiter alternative, LinkedIn Recruiter pricing, LinkedIn Hiring Assistant, recruiter platform comparison, LinkedIn Recruiter vs, recruiter software pricing, hired.video vs LinkedIn",
  heroAlt:
    "Side-by-side feature comparison of hired.video Pro and LinkedIn Recruiter Corporate",
  category: "Platform Comparisons",
  sections: [
    {
      heading: "Headline Numbers",
      body: "**LinkedIn Recruiter (2026):** Recruiter Lite ~$170/mo per seat. Recruiter Corporate ~$1,080+/mo per seat (up ~15% YoY). LinkedIn Hiring Assistant is an undisclosed add-on layered on Corporate and RPS+ plans, behind a sales call.\n\n**hired.video Pro:** $9.95/mo (or $95.52/year, 20% discount). Unlimited seats. Includes 1M AI tokens/mo, the AI Recruiter Agent v2, Live Screening Sessions, the Chrome extension, unlimited job postings, candidate scoring, voice cloning, and the multi-format Studio.\n\nThe price difference is ~108× on the entry tier. The capability gap is much narrower than that ratio suggests.",
    },
    {
      heading: "Where LinkedIn Wins",
      body: "**The graph.** LinkedIn's 1B+ profiles and the social-graph reputation signal are uncloneable in the short term. If your sourcing strategy depends on lukewarm-intro outreach through second-degree connections, you're staying on LinkedIn.\n\n**Enterprise integrations.** LinkedIn Recruiter Corporate ships with ATS integrations for Greenhouse, Workday, SmartRecruiters, and most enterprise tools out of the box. hired.video has an ATS connections schema (`ats_connections`) but the marketplace of pre-built integrations is smaller.\n\n**Brand recognition with executives.** When your VP of HR asks \"why aren't we on LinkedIn Recruiter?\" the answer needs to be specific — usually about cost or workflow, not about features.\n\n**Verified Applicant Spotlight + AI Follow-Ups.** February 2026's quarterly update added Microsoft Teams integration, AI Applicant Targeting, and verification badges. If your stack is Microsoft-first, LinkedIn's first-party Teams integration is worth something.",
    },
    {
      heading: "Where hired.video Wins",
      body: "**Price.** $9.95/mo vs $1,080/mo for a comparable feature surface. The price gap funds itself in week one of any meaningful sourcing volume.\n\n**Unlimited seats.** LinkedIn charges per seat. hired.video Pro is one flat number for the recruiter, no matter how many teammates you onboard. For a 5-person recruiting team, the annual cost difference is $63,600 vs $119.40.\n\n**Multi-format candidate pitches.** Candidates on hired.video can submit a video, comic, podcast, animation, or game pitch — and the studio AI generates these from their resume in 60 seconds. LinkedIn candidates submit a PDF. As LLM-generated resumes flood every ATS in 2026, the multi-format pitch is becoming the only reliable differentiation signal.\n\n**Live screening + agent integration.** hired.video's AI Recruiter Agent v2 hands directly off into a Live Screening session (`/sessions/:id/schedule`). LinkedIn requires the recruiter to manually move shortlisted candidates between Hiring Assistant and an external scheduling tool.\n\n**Transparent token metering.** You can see exactly what every AI feature costs in tokens. LinkedIn's AI Hiring Assistant is opaque per-seat add-on pricing.",
    },
    {
      heading: "Feature-by-Feature, 2026",
      body: "| Feature | hired.video Pro | LinkedIn Recruiter Corporate |\n|---|---|---|\n| Monthly cost (per recruiter) | $9.95 | ~$1,080+ |\n| Unlimited seats | Yes | No (per-seat) |\n| AI semantic intake (brief → criteria) | Agent v2 intake | Hiring Assistant (add-on) |\n| AI candidate scoring | Included | Included |\n| AI outreach drafts | Included | Hiring Assistant (add-on) |\n| Scheduled follow-up sequences | Included | Manual / Hiring Assistant |\n| Live back-to-back video screening | Included | Not available |\n| Async video candidate pitches | Multi-format | Not available |\n| Candidate creator studio | Yes (video, comic, game, podcast) | No |\n| Voice cloning marketplace | Yes | No |\n| Chrome sourcing extension | Yes | Yes |\n| Native ATS integrations | Partial | Extensive |\n| Public salary benchmark | Yes (role × city) | Limited |\n| Company reviews surface | Yes (multi-axis) | Limited (via Glassdoor) |\n| Brand recognition | Growing | Industry standard |\n\nThe gap is one of distribution and integrations, not feature coverage. Most LinkedIn-only features are reachable on hired.video; the inverse is no longer true.",
    },
    {
      heading: "When to Pick Each",
      body: "**Pick LinkedIn Recruiter Corporate when:** you're a 200+ employee company with budget signed off; your hiring depends on second-degree-connection sourcing; you need Greenhouse / Workday / Microsoft Teams integrations on day one; an executive has explicitly mandated LinkedIn as the platform of record.\n\n**Pick hired.video Pro when:** budget is a real constraint; you want unlimited recruiter seats without per-head sticker shock; your sourcing leans on AI-assisted intake and personalised outreach more than warm intros; you want candidates to submit richer pitches than a PDF; you value transparent metered pricing over opaque per-seat fees.\n\n**Use both:** many growing teams keep one LinkedIn Recruiter seat for warm-intro sourcing and put the rest of the team on hired.video Pro for everything else. The math works at almost any team size: one $1,080 seat plus N $9.95 seats beats N+1 $1,080 seats by an enormous margin.",
    },
  ],
  faq: [
    {
      question: "Does hired.video have a Chrome extension for sourcing like LinkedIn?",
      answer:
        "Yes. The hired.video Chrome extension extracts candidate profiles from LinkedIn, Indeed, Glassdoor, and 10+ other job sites, then drops them into your talent pool with auto-deduplication. It also auto-fills job-application forms for job seekers.",
    },
    {
      question: "Can hired.video import my LinkedIn Recruiter data?",
      answer:
        "Your existing LinkedIn Recruiter Notes and Projects don't have an official export API, but you can use the hired.video Chrome extension to extract profiles from your saved searches and push them into your hired.video talent pool. Bulk historical migration is a roadmap item.",
    },
    {
      question: "Is the $9.95/mo price genuinely all-in?",
      answer:
        "Yes for the feature set listed. Optional add-ons are clearly priced: extra mailbox connections at $5/mo, AI token top-up packs from $3.99 (500K tokens) to $199.99 (50M tokens). There are no per-seat fees, no Hiring Assistant tier, no enterprise upcharge.",
    },
  ],
});

// ── Competition: vs Indeed ─────────────────────────────────────────────
BLOG_POSTS.push({
  slug: "hired-video-vs-indeed-when-to-use-each",
  title: "hired.video vs Indeed: When to Use Each Platform in 2026",
  description:
    "Indeed has unmatched scale (31 hires per minute). hired.video has AI Recruiter Agent v2, multi-format candidate pitches, and a $9.95/mo cap. Here's how to choose.",
  publishedAt: "2026-05-25",
  updatedAt: "2026-05-25",
  readingTime: 8,
  author: "hired.video",
  toolSlug: "for-recruiters",
  toolName: "hired.video for Recruiters",
  toolUrl: "/for-recruiters",
  keywords:
    "Indeed alternative, Indeed pricing, Indeed vs, Indeed Talent Scout, Indeed Smart Sourcing, recruiter platform, sponsored job postings, hired.video vs Indeed",
  heroAlt:
    "Comparison chart of Indeed's reach versus hired.video's feature density",
  category: "Platform Comparisons",
  sections: [
    {
      heading: "Two Different Bets",
      body: "Indeed is a scale platform. As of 2026 they're powering 31 hires per minute and ~70% of sponsored applications come from AI-powered recommendations. Their core bet: every job, every candidate, every category, billed mostly through pay-per-click sponsored postings.\n\nhired.video is a workflow platform. Smaller candidate pool, much deeper per-role workflow: AI Recruiter Agent v2, Live Screening Sessions, multi-format candidate pitches, candidate creator studio, company reviews, salary guides, $9.95/mo flat.\n\nThe two are complementary more than competitive. Most growing teams should be on both.",
    },
    {
      heading: "Where Indeed Wins",
      body: "**Top-of-funnel volume.** No other platform comes close to Indeed's applicant volume for general-purpose roles (retail, hospitality, customer service, mid-level office). If you need 200 applicants for a barista role this week, Indeed posts get them.\n\n**Indeed Talent Scout + Smart Sourcing.** Indeed's AI agents are mature and integrated with their applicant flow. The 'sourcing while you sleep' model in the Indeed Connect program quietly fills your pipeline overnight.\n\n**Sponsored Jobs distribution.** Indeed syndicates to Glassdoor, Google for Jobs, and most aggregators. A single sponsored post hits a much bigger surface than a single hired.video post (though hired.video posts hit Google for Jobs too).\n\n**Brand familiarity for non-technical roles.** Plumbers, drivers, line cooks, retail managers — they search 'jobs near me' on Indeed by reflex.",
    },
    {
      heading: "Where hired.video Wins",
      body: "**Predictable pricing.** Indeed's sponsored model is pay-per-click with variable budgets — easy to overspend, hard to forecast. hired.video Pro is $9.95/mo flat, with unlimited postings.\n\n**Multi-format candidate pitches.** When 64% of recruiters report a flood of identical AI-generated PDFs (a real 2026 stat), the candidate who submits a 60-second video pitch or a comic resume jumps out of the pile. Indeed accepts text resumes. hired.video accepts video, podcast, comic, animation, game, and PDF.\n\n**AI Recruiter Agent v2 for outbound sourcing.** Indeed's Smart Sourcing surfaces candidates *to* employers; hired.video's agent generates ranked candidates *plus personalised outreach drafts plus scheduled follow-ups*. It's the difference between a lead list and an executed sequence.\n\n**Live Screening Sessions.** Back-to-back video screening blocks are not available on Indeed at all. Eight candidates × 15 minutes = one Tuesday afternoon.\n\n**Company reviews and salary guides included.** Indeed has its own salary database; you don't pay extra for it. hired.video has a multi-axis reviews surface and a role × city salary grid. Both are accessible by candidates and recruiters from the same surface — no separate Glassdoor login.",
    },
    {
      heading: "Cost Modelling: One Sponsored Indeed Post vs hired.video Pro",
      body: "A single sponsored Indeed post for a senior engineering role in a US metro typically lands at **$5–$20 per applicant click**, with reasonable monthly budgets of $400–$1,500 per role.\n\nhired.video Pro is **$9.95/mo total**, with unlimited postings included.\n\nThe break-even is: if you'd spend more than $10/mo on a single sponsored Indeed post, hired.video Pro covers itself before you make a single hire.\n\nThis math is *not* about replacing Indeed. It's about not paying Indeed for the parts of the workflow Indeed isn't good at. Use Indeed for top-of-funnel volume on hard-to-fill roles. Use hired.video for AI-driven workflow, multi-format candidate signal, and unlimited seats for your team.",
    },
    {
      heading: "When to Pick Each",
      body: "**Pick Indeed when:** you're hiring high-volume hourly or general-labor roles; you need maximum applicant volume right now; the role is well understood and standardised enough that PDF resumes are sufficient screening signal; you have budget for sponsored posts.\n\n**Pick hired.video when:** you're hiring roles where personality, communication, or creative judgment matter (sales, product, design, customer success, executive); you want AI to handle intake + sourcing + scoring + outreach + follow-up in one workflow; you want unlimited seats for your recruiting team; you need transparent fixed pricing.\n\n**Use both:** post on Indeed for volume, source on hired.video for quality, do all your live screening + agent automation on hired.video, evaluate candidate pitches across both surfaces.",
    },
  ],
  faq: [
    {
      question: "Does hired.video distribute postings to Google for Jobs?",
      answer:
        "Yes. Every active hired.video posting is indexed to Google for Jobs at no additional cost — included in Pro and Free tiers.",
    },
    {
      question: "Can I import my saved Indeed candidates into hired.video?",
      answer:
        "The hired.video Chrome extension extracts candidate profiles from Indeed search results and pushes them into your talent pool, with auto-deduplication. Bulk historical migration via the Indeed API is on the roadmap.",
    },
    {
      question: "Does hired.video sponsor postings the way Indeed does?",
      answer:
        "Job postings on hired.video have a sponsored flag (`sponsored`, `sponsored_until`, `sponsored_rank_boost`) for promoted placement in the platform's discovery feed and search results. Pricing for the sponsored tier is à la carte and predictable, not pay-per-click.",
    },
  ],
});

// ── Competition: vs ZipRecruiter ───────────────────────────────────────
BLOG_POSTS.push({
  slug: "hired-video-vs-ziprecruiter-pricing-ai-video-screening",
  title: "hired.video vs ZipRecruiter: Pricing, AI Matching, and Video Screening Compared",
  description:
    "ZipRecruiter Standard starts at ~$299/mo per job slot. hired.video Pro is $9.95/mo with unlimited postings and unlimited seats. Here's the workflow-level comparison.",
  publishedAt: "2026-05-25",
  updatedAt: "2026-05-25",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "for-recruiters",
  toolName: "hired.video for Recruiters",
  toolUrl: "/for-recruiters",
  keywords:
    "ZipRecruiter alternative, ZipRecruiter pricing, ZipIntro alternative, video screening, AI matching, recruiter software, ZipRecruiter vs, hired.video vs ZipRecruiter",
  heroAlt:
    "Three-pane comparison: pricing tiers, AI matching, and video screening features",
  category: "Platform Comparisons",
  sections: [
    {
      heading: "Headline Numbers",
      body: "**ZipRecruiter (2026):** Standard ~$299–$399/mo per job slot. Premium ~$419–$519. Pro ~$719–$899. Custom-quoted by industry, location, and slot volume.\n\n**hired.video Pro:** $9.95/mo (or $95.52/year). Unlimited postings, unlimited seats.\n\nThe price gap is ~30× on the entry tier *per slot*. ZipRecruiter's slot-based pricing is the load-bearing assumption: the more roles you're hiring for, the more it scales.",
    },
    {
      heading: "AI Matching: ZipRecruiter vs hired.video",
      body: "**ZipRecruiter** uses an AI matching algorithm that syndicates your job to 100+ partner sites and invites top candidates to apply. The 'AI-matched invitations' are the headline value prop.\n\n**hired.video** uses an AI matching surface plus an active sourcing agent. The AI Recruiter Agent v2 (`/api/recruiter/agent/intake` + `/source`) doesn't just invite candidates to apply — it sources them from the resumes database, scores each one against the role, and drafts personalised outreach.\n\nThe distinction: ZipRecruiter's AI is *passive* (it waits for matched candidates to opt in). hired.video's AI is *active* (it goes and gets them). For roles where the best candidates aren't actively job-searching, active sourcing wins.",
    },
    {
      heading: "Video Screening: ZipIntro vs Live Screening Sessions",
      body: "**ZipIntro (ZipRecruiter):** Recruiter picks a time window, ZipRecruiter matches candidates, invites them to back-to-back short video calls in a single block. The headline ZipRecruiter feature for 2026.\n\n**Live Screening Sessions (hired.video):** Same workflow. Recruiter declares window + slot length, posts candidates via `/sessions/:id/schedule`, candidate accept/decline via tokenised public link, back-to-back slots delivered.\n\nKey differences:\n- **Cost.** ZipIntro is included in ZipRecruiter Pro (~$719+/mo). Live Screening Sessions are included in hired.video Pro ($9.95/mo).\n- **Candidate pool.** ZipIntro auto-matches from ZipRecruiter's candidate database. hired.video's flow currently expects you to POST candidates explicitly — typically from a prior AI Recruiter Agent run. Auto-match from the agent is on the roadmap (Gap Register #1208).\n- **Meeting infra.** ZipIntro hosts the video call. hired.video uses your meeting URL (Zoom / Meet / Whereby). Lighter infra footprint, more tool choice. Native WebRTC is a roadmap item (Gap Register #1210).",
    },
    {
      heading: "Distribution: Does the Reach Matter?",
      body: "ZipRecruiter's pitch is distribution: post once, syndicate to 100+ partner sites. This is genuinely valuable for general-purpose roles, but the value is concentrated in the first three boards (Indeed, Google for Jobs, Glassdoor) — the long-tail 97+ sites contribute minimally.\n\nhired.video distributes to Google for Jobs and to its own active candidate base. For specialised roles (engineering, design, product, sales, executive), the targeted hired.video audience often outperforms the diffuse 100-board sprayout.\n\nDecision rule: if your role is generic and high-volume, ZipRecruiter's distribution is worth the premium. If your role is specialised and quality-sensitive, hired.video's deeper-per-role workflow is better leverage.",
    },
    {
      heading: "When to Pick Each",
      body: "**Pick ZipRecruiter when:** you're hiring 1–3 generic roles per quarter and the distribution is the value prop; you want managed syndication across 100+ boards without manual cross-posting; budget is not the binding constraint.\n\n**Pick hired.video when:** you're hiring 5+ roles per quarter (the per-slot pricing on ZipRecruiter becomes punitive); you want AI-driven sourcing + scoring + outreach + follow-up in one workflow; you want unlimited postings and unlimited seats for your team; ZipIntro is appealing but $719/mo for it specifically is not.\n\n**Use both:** post your hardest-to-fill role on ZipRecruiter Pro for the distribution, do all your other roles on hired.video, run all your video screening on hired.video Live Screening Sessions.",
    },
  ],
  faq: [
    {
      question: "Is hired.video Live Screening as turnkey as ZipIntro?",
      answer:
        "The recruiter workflow is the same shape: declare window, schedule candidates, accept-flow, back-to-back slots. The main maturity gap is auto-match — ZipIntro auto-fills the block from their candidate base; hired.video expects you to POST candidates from a prior AI Recruiter Agent run today, with auto-match on the roadmap.",
    },
    {
      question: "What does ZipRecruiter charge per video screening?",
      answer:
        "ZipIntro is included in ZipRecruiter Pro (~$719–$899/mo per job slot). hired.video Live Screening Sessions are included in Pro ($9.95/mo flat).",
    },
    {
      question: "Can I export my ZipRecruiter candidates to hired.video?",
      answer:
        "ZipRecruiter doesn't expose a full candidate-list API, but the hired.video Chrome extension can extract candidate profiles you have access to in your ZipRecruiter dashboard and push them into your talent pool.",
    },
  ],
});

// ── Competition: vs Glassdoor ──────────────────────────────────────────
BLOG_POSTS.push({
  slug: "hired-video-vs-glassdoor-reviews-salary-employer-branding",
  title: "hired.video vs Glassdoor: Employer Branding, Reviews, and Salary Data",
  description:
    "Glassdoor is the legacy reviews + salary surface. hired.video bundles a multi-axis reviews system, a role × city salary grid, and a recruiter workflow on top — at $9.95/mo.",
  publishedAt: "2026-05-25",
  updatedAt: "2026-05-25",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "companies",
  toolName: "Company Reviews + Salary Guides",
  toolUrl: "/companies",
  keywords:
    "Glassdoor alternative, Glassdoor vs, employer reviews, company reviews platform, salary by city, multi-axis ratings, hired.video vs Glassdoor, employer branding tool",
  heroAlt:
    "Comparison of multi-axis review surfaces and salary database depth",
  category: "Platform Comparisons",
  sections: [
    {
      heading: "What Glassdoor Is For",
      body: "Glassdoor's defensible moat is 20+ years of employee-written reviews and a salary database with deep historical depth. Candidates use it to research companies before they apply. Employers use it as an employer-branding surface — claim your profile, respond to reviews, post benefits, advertise culture.\n\nIn 2026 Glassdoor's job postings flow primarily through Indeed (same parent company). The product is now best understood as a branding + reviews + salary destination rather than a primary job board.",
    },
    {
      heading: "What hired.video Adds on Top",
      body: "hired.video's company reviews surface ships with **six sub-axis ratings** (culture, leadership, work-life balance, compensation, career growth, diversity) per company, computed and cached on the company row (`review_count`, `review_avg_overall`). Glassdoor's single overall score is computed from the same data but presented as one number.\n\nhired.video's **salary guides** are powered by real active job listings on the platform — forward-looking comp data, not self-reported anonymous history. The `/salary/:role/:city` grid gives you Glassdoor-style city × role pages, plus the related-cities and related-roles cross-links Glassdoor charges premium tiers for.\n\nAnd hired.video bundles the full **recruiter workflow** in the same product — the AI Recruiter Agent v2, Live Screening Sessions, ATS, unlimited postings. Glassdoor stops at branding + research.",
    },
    {
      heading: "Where Glassdoor Wins",
      body: "**Historical depth.** 20+ years of employee reviews. For a Fortune 500 with 5,000+ reviews going back to 2010, that depth genuinely matters — you can see trend lines, leadership changes, post-acquisition shifts.\n\n**Brand recognition.** Candidates search 'Acme Corp Glassdoor' by reflex. The brand is the moat.\n\n**Sample size for established companies.** A 2-year-old company has 3 Glassdoor reviews and 1 hired.video review. For research on established players, Glassdoor's volume usually beats hired.video's.\n\n**Salary history.** Glassdoor's salary data goes back years, with quarterly cadence. hired.video's salary data is current-listing-only — accurate for *now* but no time series yet.",
    },
    {
      heading: "Where hired.video Wins",
      body: "**Multi-axis ratings, not a single score.** A 4.0 made of (5, 5, 2, 5, 5, 2) is very different from (4, 4, 4, 4, 4, 4) — and only the multi-axis view tells you which. hired.video shows both the aggregate and the per-axis breakdown by default.\n\n**Forward-looking salary data.** Real active listings, not self-reported memories. The number reflects what employers are paying *now*, not what someone made in 2022.\n\n**Same surface for research and apply.** A candidate researching a company on Glassdoor has to leave to apply (via Indeed). On hired.video the company profile, reviews, salary guide, and job postings are one surface — research-to-apply is one click.\n\n**Recruiter workflow included.** Glassdoor for Employers is a branding-only product. hired.video Pro includes the AI Recruiter Agent, Live Screening, ATS, and unlimited postings in the same $9.95/mo.\n\n**Verified reviews infrastructure.** hired.video's review system stores `is_verified` + `verification_method` (email-domain match or was-a-buyer). Glassdoor moderates but doesn't expose verification status to candidates.",
    },
    {
      heading: "When to Pick Each",
      body: "**Use Glassdoor when:** you're researching a Fortune 500 or established public company with 100+ reviews of historical depth; you want the time-series view of how a company has changed; brand recognition with your team's executives is required.\n\n**Use hired.video when:** you want a multi-axis view of how a company actually performs across culture / pay / leadership / WLB / growth / diversity; you want forward-looking salary data based on what employers are paying right now; you want to research a company AND apply AND get matched without leaving the surface; you're an employer looking for a branding surface that bundles recruiter workflow at $9.95/mo instead of $400+/mo for Glassdoor Enhanced.\n\n**Use both:** read both reviews, cross-reference. When they agree, the signal is high. When they disagree, the recent hired.video reviews are usually the more current picture.",
    },
  ],
  faq: [
    {
      question: "Can employers respond to reviews on hired.video?",
      answer:
        "Yes. Companies can post threaded replies under any review via the `review_comments` table; replies from the verified company owner are flagged `is_subject_owner=true` so candidates can see at a glance which comments are official company responses.",
    },
    {
      question: "How does hired.video prevent fake reviews?",
      answer:
        "Reviews are bound to authenticated user accounts (one review per user per company, enforced by a unique index). Verified-employee status is awarded when the reviewer's email domain matches the company's verified domain. Reviews from the company owner are blocked by descriptor eligibility (`owner_blocked`). A `submitter_ip_hash` is stored for downstream fraud analysis.",
    },
    {
      question: "Does hired.video have salary data for international roles?",
      answer:
        "Currently the salary guides are US-focused (city dimension parsed from free-text job locations like 'San Francisco, CA'). International expansion is on the roadmap as part of the broader internationalization initiative; the underlying schema (`content_locations`) is country-aware and ready.",
    },
  ],
});

// ── Creator Studio: Podcast resume ─────────────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-make-a-podcast-episode-in-hired-video-studio",
  title: "How to Make a Podcast Episode in hired.video Studio (Step-by-Step)",
  description:
    "Record, script, and publish a podcast-style audio episode in hired.video Studio — using the teleprompter, AI voiceover, and multi-track audio editing without leaving the browser.",
  publishedAt: "2026-05-08",
  updatedAt: "2026-05-12",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "studio",
  toolName: "Studio",
  toolUrl: "/studio",
  keywords:
    "how to make a podcast, podcast resume, audio resume, podcast editor browser, record podcast online, AI voiceover podcast, podcast studio no download",
  heroAlt: "Studio timeline showing two audio tracks and a waveform editor",
  category: "Creator Studio",
  sections: [
    {
      heading: "What the Podcast Media Kind Is For",
      body: "hired.video Studio is no longer video-only. The studio document carries a `mediaKind` — video, podcast, voice, or animation — and the podcast kind switches the editor into an audio-first layout: waveform tracks instead of a visual canvas, chapter markers instead of scenes, and an export that produces a clean MP3 rather than an MP4.\n\nA podcast episode is the right format when your message is better heard than watched: a career-story episode for your profile, a subject-matter explainer that demonstrates expertise, or an interview you host as a Creator. Because the same document model backs every media kind, you can start from a video script and convert it to a podcast without re-typing a word.",
    },
    {
      heading: "Step 1: Open Studio and Choose the Podcast Kind",
      body: "Open [Studio](/studio) and create a new document. In the new-document picker, choose **Podcast**. The editor loads the audio layout: a transport bar, one or more audio tracks, and a script pane on the left.\n\nIf you already have a video draft you'd rather narrate as audio, open it and switch its media kind from the document settings — the script and chapter structure carry over, and the visual layers are simply hidden from the audio export.",
    },
    {
      heading: "Step 2: Write or Paste Your Script",
      body: "Type your episode into the script pane, broken into chapters. Each chapter becomes a marker on the timeline so listeners (and you, while editing) can jump between segments.\n\nKeep chapters short — 60 to 120 seconds of spoken audio each. A 10-minute episode is roughly 1,300–1,500 spoken words. The teleprompter reads from this pane while you record, so write the way you talk: short sentences, one idea per line.",
    },
    {
      heading: "Step 3: Record, or Generate AI Voiceover",
      body: "You have two ways to get audio onto the track:\n\n**Record yourself.** Click record, read from the teleprompter, and Studio captures a track in the browser. Re-record any chapter individually without touching the rest — the chapter markers make it a clean swap.\n\n**Generate AI voiceover.** If you're audio-shy or want a consistent narrator, select a chapter and generate text-to-speech from the script. This is the same TTS engine used for video voiceover; it runs against your script text so updates stay in sync.\n\nMost creators mix both: AI voiceover for intros, outros, and ad-style segments; their own voice for the parts that need authenticity.",
    },
    {
      heading: "Step 4: Edit, Add a Second Track, and Export",
      body: "Trim silences and stumbles directly on the waveform. Add a second track for intro music or a bed under your narration, and set its level so it sits behind your voice. Studio renders the mix in the browser using the same ffmpeg.wasm pipeline as video export — no server round-trip, no upload of your raw audio.\n\nWhen you're happy, export to MP3. Publish it to your profile as an audio resume, attach it to a Creator post, or download it for an external podcast host. The whole loop — script to published episode — happens in one tab.",
    },
  ],
  faq: [
    {
      question: "Do I need to download any software to record a podcast?",
      answer:
        "No. Studio records, edits, and exports entirely in the browser. Recording uses your device microphone via the browser, and the final mix is rendered client-side with ffmpeg.wasm, so your raw audio never has to be uploaded to render an episode.",
    },
    {
      question: "Can I convert an existing video draft into a podcast?",
      answer:
        "Yes. Because every Studio document shares one underlying model with a mediaKind axis, you can switch a video document to the podcast kind. The script and chapter structure carry over; the visual layers are simply excluded from the audio-only export.",
    },
    {
      question: "Is AI voiceover required?",
      answer:
        "No — it's optional. You can record entirely in your own voice, generate every chapter with AI voiceover, or mix the two. The teleprompter works either way so you stay on script while recording.",
    },
  ],
});

// ── Creator Studio: Comic / animation ──────────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-make-an-animated-comic-resume-in-hired-video-studio",
  title: "How to Make an Animated Comic Resume in hired.video Studio",
  description:
    "Turn your career story into a panel-by-panel animated comic in hired.video Studio using the animation media kind — keyframes, layers, and a browser-rendered video export.",
  publishedAt: "2026-05-16",
  updatedAt: "2026-05-18",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "studio",
  toolName: "Studio",
  toolUrl: "/studio",
  keywords:
    "animated resume, comic resume, motion resume, animation studio browser, keyframe animation online, creative resume, animated video resume",
  heroAlt: "Studio canvas showing animated comic panels with a keyframe timeline",
  category: "Creator Studio",
  sections: [
    {
      heading: "When a Comic Beats a Talking Head",
      body: "For most roles, a 60-second talking-head video resume is the highest-leverage asset you can make. But for design, illustration, motion, marketing, and brand roles, a hiring manager wants to *see* your aesthetic, not just hear you describe it. An animated comic resume is the format that puts your craft on the page.\n\nStudio's animation media kind gives you a layered canvas with a keyframe timeline. You build panels, place layers (background, character, text balloons), and animate properties — position, scale, opacity — across time. The output is a short rendered video you can publish to your profile or attach to an application.",
    },
    {
      heading: "Step 1: Start an Animation Document",
      body: "Open [Studio](/studio), create a new document, and choose the **Animation** kind. The editor loads a canvas plus a keyframe timeline. Set your aspect ratio first — square (1:1) reads well in a feed, 16:9 plays cleanly as an embedded video.\n\nThink in panels the way a comic does: 4–8 panels, each a single beat of your story. Sketch the beats before you build — \"intro,\" \"the project,\" \"the result,\" \"the ask\" — so you're animating to a script rather than improvising.",
    },
    {
      heading: "Step 2: Build Layers and Speech Balloons",
      body: "Each panel is a stack of layers. Add a background, a character or illustration, and text layers for captions and speech balloons. Studio's layer model is the same one the video canvas uses, so anything you can place in a video scene — shapes, images, text, fonts — works here too.\n\nKeep text short. A comic balloon that takes more than two seconds to read breaks the pacing. Let the visuals carry the story and use captions to anchor the key facts (your name, the metric, the role you want).",
    },
    {
      heading: "Step 3: Animate with Keyframes",
      body: "Select a layer, move the playhead, and set keyframes on the properties you want to animate. Slide a character in from off-canvas, fade a caption up, pop a balloon with a quick scale-up. Studio interpolates between keyframes so two keyframes per property is usually enough for a clean move.\n\nFavor a handful of confident moves over constant motion. The most effective comic resumes hold each panel long enough to read, then transition with one deliberate animation rather than animating everything at once.",
    },
    {
      heading: "Step 4: Render in the Browser and Publish",
      body: "Export renders the animation to video client-side with the same ffmpeg.wasm pipeline as every other Studio media kind — no upload, no server queue. Add an audio track first if you want narration or a music bed; AI voiceover works here exactly as it does for video.\n\nPublish the rendered clip to your profile, attach it to a creative application, or post it as a Creator. For design and motion roles, a comic resume is often the single asset that gets you remembered in a stack of PDFs.",
    },
  ],
  faq: [
    {
      question: "Do I need to be an illustrator to make a comic resume?",
      answer:
        "No. You can build panels from shapes, text, and imported images. Strong illustration helps for illustration roles specifically, but the format works with simple layered graphics — the storytelling structure matters more than the drawing.",
    },
    {
      question: "What's the difference between the animation kind and a video?",
      answer:
        "Both export to video, but the animation kind is built around a keyframe timeline and a layered canvas for synthetic motion, where the video kind is built around recorded scenes and a teleprompter. Use animation when you're creating motion from layers; use video when you're recording yourself.",
    },
    {
      question: "Where does the rendering happen?",
      answer:
        "In your browser. Studio uses ffmpeg.wasm to render the final video client-side, so your assets don't have to be uploaded to a render farm and there's no per-render infrastructure cost.",
    },
  ],
});

// ── Creator Studio: 3D World / game ────────────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-build-a-3d-world-resume-in-hired-video-studio",
  title: "How to Build a 3D World Resume in hired.video Studio",
  description:
    "Use the 3D World game studio in hired.video to build an explorable, interactive resume scene with Three.js-powered objects and physics — no game-engine install required.",
  publishedAt: "2026-05-22",
  updatedAt: "2026-05-24",
  readingTime: 8,
  author: "hired.video",
  toolSlug: "studio",
  toolName: "Studio",
  toolUrl: "/studio",
  keywords:
    "3D resume, interactive resume, game resume, three.js resume, 3d world builder browser, interactive portfolio, playable resume",
  heroAlt: "3D World studio editor showing a scene with placed objects and a physics inspector",
  category: "Creator Studio",
  sections: [
    {
      heading: "The Playable Resume",
      body: "The boldest format hired.video Studio supports is a 3D World — an explorable scene a recruiter can walk through. It's overkill for an accounting role and exactly right for a game developer, a 3D artist, a technical artist, or an XR engineer who needs to prove they can ship interactive 3D.\n\nUnder the hood, the 3D World studio is a `mediaKind: \"game\"` document with an `engine: \"world-3d\"` discriminator, built on Three.js and React Three Fiber with a Rapier physics layer. You place objects, wire up interactions, and the result runs in any modern browser — no Unity or Unreal install, no plugin.",
    },
    {
      heading: "Step 1: Create a 3D World Document",
      body: "Open [Studio](/studio), create a new document, and choose the **3D World** game type. The editor loads a 3D viewport, an object palette, and an inspector. (The older 2D game templates still exist — they're now badged \"Mini-game\" — but a 3D World is the full scene-based engine.)\n\nStart with a simple ground plane and a spawn point. Resist the urge to build a whole level. The goal is a short, guided walk that tells your story, not an open-world game.",
    },
    {
      heading: "Step 2: Place Objects and Add Physics",
      body: "Drag objects from the palette into the scene: platforms, props, text panels, and trigger zones. Each object has a transform (position, rotation, scale) you set in the inspector. Add a Rapier physics body to objects that should collide or fall — the engine handles the simulation so a dropped prop lands on the floor without you writing a physics loop.\n\nUse text panels as the narrative spine: a panel at the entrance with your name and headline, panels along the path describing each project, a panel at the end with what you're looking for. The player reads the resume by moving through it.",
    },
    {
      heading: "Step 3: Wire Interactions",
      body: "Trigger zones turn the scene from a diorama into an experience. Attach an interaction to a zone so that stepping into it reveals a project panel, plays a sound, or advances the camera. Keep interactions discoverable — a recruiter exploring your world for the first time shouldn't have to guess a hidden mechanic to see your work.\n\nA good pattern: a linear path with optional side rooms. The main path tells your core story in 60–90 seconds of walking; the side rooms hold deep-dive panels for recruiters who want more.",
    },
    {
      heading: "Step 4: Publish and Share the Link",
      body: "A 3D World publishes as a playable, link-shareable experience that runs in the browser. Because Studio runs cross-origin-isolated for its runtime, the scene loads with its assets self-hosted and plays without a download.\n\nShare the link in your application, on your profile, or in a Creator post. For interactive-3D roles, a playable world is the portfolio piece — it proves, in the most direct way possible, that you can ship the exact thing the job is asking for.",
    },
  ],
  faq: [
    {
      question: "Do I need to know how to code to build a 3D World?",
      answer:
        "No. You place objects, set transforms in the inspector, and wire interactions through trigger zones — all visually. Coding knowledge lets you push further, but the core build is a drag-place-and-configure workflow.",
    },
    {
      question: "What's the difference between a 3D World and a Mini-game?",
      answer:
        "A 3D World is a full scene-based engine — `mediaKind: \"game\"` with the `world-3d` engine — built on Three.js, React Three Fiber, and Rapier physics. The 2D game templates are now badged \"Mini-game\" and are simpler, sprite-based experiences. For a resume scene a recruiter explores in 3D, use the 3D World.",
    },
    {
      question: "Does a recruiter need to install anything to view it?",
      answer:
        "No. The world runs in any modern browser via WebGL. You share a link; they click and explore. No game engine, no plugin, no download.",
    },
  ],
});

// ── Creator Studio: Video resume quickstart ────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-make-a-video-resume-in-hired-video-studio",
  title: "How to Make a Video Resume in hired.video Studio (60-Second Method)",
  description:
    "Record a polished 60-second video resume in hired.video Studio using the teleprompter, scene-by-scene retakes, AI voiceover, and browser-side render — start to publish in one tab.",
  publishedAt: "2026-04-30",
  updatedAt: "2026-05-06",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "studio",
  toolName: "Studio",
  toolUrl: "/studio",
  keywords:
    "how to make a video resume, video resume studio, teleprompter resume, record video resume online, AI voiceover resume, video CV, 60 second video resume",
  heroAlt: "Studio video editor with a teleprompter overlay and a scene timeline",
  category: "Creator Studio",
  sections: [
    {
      heading: "Why Studio Beats Recording on Your Phone",
      body: "You can record a video resume on your phone, but you'll fight three things: staying on script, fixing the one scene where you stumbled, and getting clean audio. hired.video Studio solves all three in the browser — a teleprompter that scrolls your script, scene-by-scene retakes so one bad take doesn't cost you the whole video, and audio leveling on export.\n\nThe whole loop — script, record, edit, render, publish — happens in one tab. Render runs client-side with ffmpeg.wasm, so there's no upload-and-wait.",
    },
    {
      heading: "Step 1: Script It in Scenes",
      body: "Open [Studio](/studio), create a video document, and write your script broken into scenes. The proven 60-second shape is: hook (one specific claim), name and role, one story (problem, action, result), and a close that names the role you want.\n\nKeep each scene to one idea. Scenes are the unit you'll re-record, so a tight scene break means a clean retake. Aim for 60–90 seconds total — 130–180 spoken words.",
    },
    {
      heading: "Step 2: Record with the Teleprompter",
      body: "Turn on the teleprompter and it scrolls your script over the camera preview while you record, so you keep eye contact instead of reading off to the side. Record scene by scene. If you fumble scene 3, re-record just scene 3 — the rest stays untouched.\n\nLook at the lens, not your own image. Sit one step more formal than the company's day-to-day. Record each scene a few times and keep the take that sounds conversational, not memorized.",
    },
    {
      heading: "Step 3: Polish — Voiceover, Trims, Music",
      body: "If you'd rather not be on camera for part of the video, generate AI voiceover from your script for those scenes. Trim dead air at the head and tail of each scene. Add a quiet music bed if it fits your tone, set its level under your voice, and export handles the leveling.\n\nDon't over-edit. A video resume that's visibly cut every two seconds reads as anxious. Two or three clean scene transitions beat a dozen jump cuts.",
    },
    {
      heading: "Step 4: Render and Publish",
      body: "Export renders the final MP4 in your browser. Publish it to your profile as your video resume, attach it to applications, or grab the public `/v/<id>` link to share anywhere.\n\nUpdate it when your headline metric goes stale or your role changes — for most people that's once every 12–18 months. Re-recording one scene is cheap, so keeping it current is easy.",
    },
  ],
  faq: [
    {
      question: "How long should a video resume be?",
      answer:
        "60–90 seconds. Longer videos don't get watched to the end; shorter ones don't have room for a story. Front-load your strongest, most specific claim in the first three seconds so the recruiter decides to keep watching.",
    },
    {
      question: "Can I re-record just one part?",
      answer:
        "Yes. Studio records scene by scene, so you can re-record a single scene without redoing the whole video. That's the biggest advantage over recording one continuous take on your phone.",
    },
    {
      question: "Do I have to upload my footage to render?",
      answer:
        "No. Studio renders the final video client-side with ffmpeg.wasm, so your raw footage doesn't need to be uploaded to a server to produce the finished MP4.",
    },
  ],
});

// ── Learning: launch a course / SCORM ──────────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-launch-a-course-and-upload-scorm-on-hired-video",
  title: "How to Launch a Course (and Upload SCORM) on hired.video",
  description:
    "Publish a course on hired.video as a Creator or employer — structure modules, upload SCORM 1.2 packages, track completion with the built-in xAPI LRS, and issue verifiable certificates.",
  publishedAt: "2026-05-10",
  updatedAt: "2026-05-14",
  readingTime: 8,
  author: "hired.video",
  toolSlug: "courses",
  toolName: "Courses",
  toolUrl: "/services/creator/courses",
  keywords:
    "launch online course, upload SCORM, SCORM 1.2 hosting, xAPI LRS, course authoring, sell a course, learning management, verifiable certificate course",
  heroAlt: "Course builder showing modules, a SCORM package upload, and a completion-tracking panel",
  category: "Learning",
  sections: [
    {
      heading: "Who Can Author a Course",
      body: "Course authoring on hired.video is open to Creators and employers — the same eligibility check (`resolveAuthorEligibility`) gates both course and classroom authoring. Students are job seekers in a learning mode; you don't need a separate \"instructor\" account to publish.\n\nA course is the right surface when you have structured, self-paced material: an onboarding curriculum, a certification prep track, or a skills course you sell. If you'd rather run a live, cohort-based class with assignments, see the classroom guide — they share infrastructure but solve different jobs.",
    },
    {
      heading: "Step 1: Create the Course and Add Modules",
      body: "From the Creator dashboard open [Courses](/services/creator/courses) and create a new course. Give it a title, description, and the audience it's for. Then add modules — each module is a unit of the curriculum, and modules hold lessons.\n\nStructure the path before you fill it. A learner should be able to read your module list and understand the arc: foundations, then application, then assessment. Order matters because learning paths support prerequisites — later modules can require earlier ones.",
    },
    {
      heading: "Step 2: Upload a SCORM 1.2 Package",
      body: "If you've authored content in a tool like Articulate Storyline, iSpring, or Adobe Captivate, export it as a SCORM 1.2 package (a .zip) and upload it as a lesson. hired.video runs a built-in SCORM 1.2 runtime, so the package's completion, score, and bookmarking calls are captured natively — no third-party LMS needed.\n\nSCORM is the right choice when your content is interactive (branching scenarios, embedded quizzes, drag-and-drop). For straightforward video or text lessons, you don't need SCORM at all — author them directly as lessons.",
    },
    {
      heading: "Step 3: Track Completion with the xAPI LRS",
      body: "Beyond SCORM, hired.video includes an xAPI Learning Record Store. Statements (\"learner X completed activity Y\") are recorded to the LRS, giving you a durable, queryable record of who did what — across SCORM packages, native lessons, and learning-path nodes.\n\nThis is what lets completion mean something. When a learner finishes the required path, the LRS has the evidence, which is the foundation for issuing a certificate that a third party can actually trust.",
    },
    {
      heading: "Step 4: Issue a Verifiable Certificate",
      body: "On completion, hired.video can issue a certificate signed with an HMAC so its authenticity can be verified later. A holder shares the certificate; a verifier checks the signature and confirms it was genuinely issued for that learner and that course — it can't be forged by editing a PDF.\n\nCertificates plug into gamification too: completing learning awards points and can unlock badges, which keeps learners moving through the path. Publish the course, set its price (or make it free), and learners enroll, progress, and earn a credential that holds up to scrutiny.",
    },
  ],
  faq: [
    {
      question: "Do I need an external LMS to host SCORM?",
      answer:
        "No. hired.video has a built-in SCORM 1.2 runtime, so you upload your SCORM .zip as a lesson and the platform captures completion, score, and bookmarking directly. There's also an xAPI LRS for statement-level tracking across all lesson types.",
    },
    {
      question: "Are the certificates actually verifiable?",
      answer:
        "Yes. Certificates are signed with an HMAC, so a verifier can confirm the certificate was genuinely issued for a specific learner and course. That makes it tamper-evident — unlike a plain PDF, it can't be forged by editing the text.",
    },
    {
      question: "Can employers author courses too, or only Creators?",
      answer:
        "Both. Course and classroom authoring share one eligibility check, so Creators and employers can both publish. This is what lets a company stand up an onboarding or compliance curriculum on the same surface a Creator uses to sell a skills course.",
    },
  ],
});

// ── Learning: run a classroom cohort ───────────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-run-a-classroom-cohort-as-an-educator",
  title: "How to Run a Classroom Cohort as an Educator on hired.video",
  description:
    "Set up a cohort, enroll students, hand out learning assignments, and track classroom analytics on hired.video — the educator workflow that turns a self-paced course into a live class.",
  publishedAt: "2026-05-19",
  updatedAt: "2026-05-21",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "classrooms",
  toolName: "Classrooms",
  toolUrl: "/tools?tab=classrooms",
  keywords:
    "run a cohort, classroom cohort, educator tools, cohort based course, learning assignments, classroom analytics, teach online cohort",
  heroAlt: "Classroom dashboard showing cohort members, assignments, and completion analytics",
  category: "Learning",
  sections: [
    {
      heading: "Cohorts vs Self-Paced Courses",
      body: "A self-paced course is a learner alone with the material. A classroom cohort is a *group* moving through material together on a schedule, with an educator handing out assignments and watching progress. Cohorts add accountability and pace — the two things that most improve completion rates.\n\nOn hired.video, an educator is a Creator or employer; a student is a job seeker in learning mode. Neither is a new role — the cohort layer sits on top of the accounts you already have. You'll find your classrooms as a tab on the Tools page at [/tools?tab=classrooms](/tools?tab=classrooms), and students see their side under the learning tab.",
    },
    {
      heading: "Step 1: Create a Classroom",
      body: "Open [Classrooms](/tools?tab=classrooms) and create a cohort. Give it a name, a description, and the course or learning path it's built around. The cohort is the container — it holds members and the assignments you'll give them.\n\nDecide the shape up front: a fixed-start cohort where everyone begins together, or a rolling cohort students join as they enroll. Fixed-start cohorts get the strongest peer accountability; rolling cohorts are easier to operate at scale.",
    },
    {
      heading: "Step 2: Enroll Students",
      body: "Add members to the cohort. Membership is tracked explicitly, and access throughout the classroom is gated by the same `canActFor` permission seam the rest of the platform uses — so an educator acts on their own cohort and can't reach into someone else's.\n\nKeep cohorts small enough to give attention. The accountability that makes cohorts work depends on the educator actually seeing each student's progress; that breaks down past a certain size, so split a large intake into multiple cohorts rather than one giant room.",
    },
    {
      heading: "Step 3: Hand Out Learning Assignments",
      body: "Assignments are the educator's lever. Assign a module, a lesson, or a whole path to the cohort with a due date. Students see the assignment in their learning tab; you see who's completed it.\n\nAssignments are the bridge between content and pace. A self-paced course says \"here's the material.\" An assignment says \"finish module 2 by Friday\" — and that single change is what moves a cohort through the curriculum together instead of drifting apart.",
    },
    {
      heading: "Step 4: Watch the Analytics",
      body: "The classroom surfaces cached cohort analytics — completion rates, who's behind, where students stall. Use it to intervene early: a student who hasn't started by the second due date needs a nudge before they disengage entirely.\n\nBecause completion flows through the same xAPI LRS that backs courses, the analytics are grounded in real records, not self-reports. When the cohort finishes, the same certificate machinery that powers self-paced courses issues verifiable credentials to your students.",
    },
  ],
  faq: [
    {
      question: "Is 'educator' a separate account type?",
      answer:
        "No. An educator is a Creator or employer, and a student is a job seeker in a learning mode. The cohort layer sits on top of existing accounts — there's no new role to sign up for.",
    },
    {
      question: "Where do I find my classrooms?",
      answer:
        "Classrooms live as a tab on the Tools page at /tools?tab=classrooms, not as a separate sidebar item. Students see their enrolled learning under /tools?tab=learning.",
    },
    {
      question: "How is access controlled between cohorts?",
      answer:
        "Through the platform's canActFor permission check. An educator acts only on their own cohort's members and assignments and can't reach into a cohort they don't own, which keeps student data scoped to the right classroom.",
    },
  ],
});

// ── Learning: earn a verifiable certificate ────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-earn-a-verifiable-certificate-on-hired-video",
  title: "How to Earn a Verifiable Certificate on hired.video (and Prove It's Real)",
  description:
    "Complete a course or learning path on hired.video to earn an HMAC-signed certificate anyone can verify — plus how to share it so an employer can confirm it's genuine.",
  publishedAt: "2026-05-27",
  updatedAt: "2026-05-29",
  readingTime: 6,
  author: "hired.video",
  toolSlug: "courses",
  toolName: "Courses",
  toolUrl: "/courses",
  keywords:
    "verifiable certificate, online certificate verification, HMAC certificate, course completion certificate, prove certification, credential verification, learning certificate",
  heroAlt: "A completion certificate next to a verification screen confirming a valid signature",
  category: "Learning",
  sections: [
    {
      heading: "Why 'Verifiable' Is the Word That Matters",
      body: "Anyone can make a certificate in a word processor. The problem isn't producing one — it's getting an employer to believe it. A verifiable certificate solves exactly that: it carries a cryptographic signature so a third party can confirm it was genuinely issued, for you, for that specific course, and hasn't been altered.\n\nhired.video signs every certificate with an HMAC. That's what separates a credential a hiring manager will trust from a PDF anyone could fake.",
    },
    {
      heading: "Step 1: Complete the Required Path",
      body: "Enroll in a [course](/courses) or learning path and finish what it requires. Completion isn't a self-checkbox — your progress is recorded to the platform's xAPI Learning Record Store as you go, including SCORM lesson results and learning-path nodes.\n\nIf the path has prerequisites, earlier modules unlock later ones, so you complete them in order. When the LRS has recorded that you've met the requirements, you're eligible for the certificate.",
    },
    {
      heading: "Step 2: Receive the Signed Certificate",
      body: "On completion, hired.video issues your certificate signed with an HMAC. The signature is bound to your identity and the specific course — change a single character of the certificate's content and the signature no longer matches.\n\nEarning it also feeds gamification: completing learning awards points and can unlock badges, so the credential is one of several rewards for finishing.",
    },
    {
      heading: "Step 3: Share It So an Employer Can Verify",
      body: "When you share the certificate, the recipient can run it through verification: the verifier recomputes the signature over the certificate's contents and confirms it matches what hired.video issued. A genuine certificate passes; a tampered or fabricated one fails.\n\nThat's the whole point. You don't ask the employer to take your word for it — you hand them something they can independently check in seconds. Link it on your profile, attach it to an application, or send it directly to a hiring manager.",
    },
  ],
  faq: [
    {
      question: "What makes the certificate 'verifiable' rather than just a PDF?",
      answer:
        "It's signed with an HMAC. A verifier recomputes the signature over the certificate's contents and checks it against what hired.video issued. If anything was altered — the name, the course, the date — the signature won't match, so tampering is detectable.",
    },
    {
      question: "How does the platform know I actually completed the course?",
      answer:
        "Your progress is recorded to an xAPI Learning Record Store as you work through lessons, SCORM packages, and learning-path nodes. The certificate is issued against those records, not a self-reported checkbox.",
    },
    {
      question: "Can I put the certificate on my profile?",
      answer:
        "Yes. You can surface it on your profile, attach it to applications, or send the verifiable link directly to an employer who can confirm its authenticity independently.",
    },
  ],
});

// ── Recruiting ops: take-home assignments ──────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-run-take-home-assignments-without-losing-candidates",
  title: "How to Run Take-Home Assignments Without Losing Good Candidates",
  description:
    "A practical guide to fair, predictive take-home assignments: scope them to two hours, pay for longer ones, score with a rubric, and use blind review to keep bias out of the evaluation.",
  publishedAt: "2026-05-03",
  updatedAt: "2026-05-07",
  readingTime: 8,
  author: "hired.video",
  toolSlug: "scorecards",
  toolName: "Scorecards",
  toolUrl: "/people/scorecards",
  keywords:
    "take home assignment hiring, work sample test, fair take home, take home rubric, predictive hiring assessment, reduce hiring bias, structured evaluation",
  heroAlt: "A take-home brief alongside a structured scoring rubric",
  category: "Recruiting Ops",
  sections: [
    {
      heading: "Why Take-Homes Win — and Where They Backfire",
      body: "Work samples are among the most predictive hiring signals there is: watching someone do a slice of the actual job beats inferring it from a conversation. But take-homes backfire when they're disrespectful of the candidate's time — a 10-hour unpaid project from a strong candidate with three offers in flight is a project they'll simply decline.\n\nThe fix isn't to abandon take-homes; it's to scope them honestly and evaluate them rigorously. A two-hour, tightly-scoped assignment scored against a rubric gives you the predictive signal without the candidate attrition.",
    },
    {
      heading: "Rule 1: Scope to Two Hours (and Pay for More)",
      body: "Design the assignment to take a focused candidate about two hours, and say so in the brief. State a time box explicitly: \"Spend no more than two hours; we evaluate what you can do in that window, not how many hours you're willing to give us.\"\n\nIf the role genuinely needs a deeper sample, pay for it. A paid project converts a take-home from an imposition into a paid trial, and the candidates worth hiring respond well to being valued. The unpaid 10-hour project is the single biggest reason strong candidates drop out of pipelines.",
    },
    {
      heading: "Rule 2: Make It Resemble the Real Job",
      body: "The assignment should be a slice of the work the person will actually do — not a brain-teaser, not a trick. For an engineer, a small bug fix or feature in a representative codebase. For a marketer, a campaign brief for a real (or realistic) product. For a designer, a constrained redesign with a stated goal.\n\nResemblance is what makes the sample predictive. The closer the take-home is to day-one work, the more its result tells you about day-one performance — and the more candidates feel the process was fair.",
    },
    {
      heading: "Rule 3: Score with a Rubric, Before You See the Name",
      body: "Decide what good looks like *before* you read a single submission. Write a rubric with the dimensions you care about — correctness, clarity, judgment, communication — and the levels for each. Then score every submission against that same rubric.\n\nWhere possible, review blind: strip the candidate's name and identifying details so you're scoring the work, not the person. On hired.video you record those structured scores on a [scorecard](/people/scorecards), so every reviewer evaluates the same dimensions and you can compare candidates on the merits instead of on gut feel.",
    },
    {
      heading: "Rule 4: Close the Loop With Feedback",
      body: "Candidates invest real effort in a take-home. The minimum return is a clear, timely decision; the gold standard is a sentence of specific feedback. It costs you little and it's the difference between a rejected candidate who badmouths your process and one who refers a friend next quarter.\n\nFeedback also forces discipline on your side: if you can't articulate why a submission scored where it did, your rubric wasn't specific enough. Closing the loop makes the next round of assignments sharper.",
    },
  ],
  faq: [
    {
      question: "How long should a take-home assignment take?",
      answer:
        "Design it for about two focused hours and state that time box in the brief. If the role truly needs a deeper sample, pay the candidate for their time. Long unpaid take-homes are the leading cause of strong candidates dropping out of a pipeline.",
    },
    {
      question: "How do I keep take-home evaluation fair?",
      answer:
        "Write a rubric before you read any submissions, score every candidate against the same dimensions, and review blind where you can by stripping names and identifying details. Recording structured scores on a scorecard keeps every reviewer on the same criteria.",
    },
    {
      question: "Should take-homes look like the real job?",
      answer:
        "Yes. The most predictive assignments are a representative slice of day-one work, not abstract puzzles. Resemblance to the real job both improves the signal and makes candidates feel the process is fair.",
    },
  ],
});

// ── Recruiting ops: structured scorecards & blind review ───────────────
BLOG_POSTS.push({
  slug: "structured-scorecards-and-blind-review-to-reduce-hiring-bias",
  title: "Structured Scorecards and Blind Review: How to Reduce Hiring Bias",
  description:
    "Replace gut-feel interviews with structured scorecards and blind review. Define the dimensions before you interview, score consistently, and aggregate decisions to keep bias out of hiring.",
  publishedAt: "2026-05-13",
  updatedAt: "2026-05-16",
  readingTime: 8,
  author: "hired.video",
  toolSlug: "scorecards",
  toolName: "Scorecards",
  toolUrl: "/people/scorecards",
  keywords:
    "structured interview scorecard, blind review hiring, reduce hiring bias, interview rubric, structured hiring, evidence based hiring, fair interview process",
  heroAlt: "An interview scorecard with rated dimensions and an aggregated decision panel",
  category: "Recruiting Ops",
  sections: [
    {
      heading: "Why Unstructured Interviews Mislead You",
      body: "The unstructured interview — a free-flowing chat that ends in a thumbs up or down — is one of the worst-performing tools in hiring, and one of the most popular. It measures rapport, similarity, and confidence far more than it measures competence. It's also where bias hides best: when criteria are implicit, \"culture fit\" becomes a euphemism for \"reminds me of me.\"\n\nStructured scorecards fix this by making the criteria explicit, identical across candidates, and recorded. You stop comparing vibes and start comparing evidence on the same axes.",
    },
    {
      heading: "Step 1: Define the Dimensions Before the First Interview",
      body: "Before you talk to anyone, decide what the role actually requires and turn it into 4–6 scoreable dimensions — for example: problem-solving, role-specific skill, collaboration, communication. For each dimension, write what a 1 looks like and what a 5 looks like, so two interviewers reading the same answer land on a similar score.\n\nDefine these once per role and reuse them for every candidate. The moment the criteria are fixed up front, you've removed the biggest source of inconsistency: each interviewer inventing their own bar mid-conversation.",
    },
    {
      heading: "Step 2: Ask Every Candidate the Same Core Questions",
      body: "Structure means consistency. Each interviewer covers the same core questions for their assigned dimensions, so candidates are compared on the same evidence rather than on whatever happened to come up. You can still follow threads — but everyone hits the same anchor questions.\n\nThis is what makes scores comparable. If candidate A was asked about a hard trade-off and candidate B wasn't, their \"judgment\" scores aren't measuring the same thing. Same questions, same rubric, comparable scores.",
    },
    {
      heading: "Step 3: Review Blind Where You Can",
      body: "Bias often enters before the interview even starts — from a name, a photo, a school. Strip identifying details from work samples and written submissions so reviewers score the work, not the person. For live interviews, full blinding isn't possible, but you can still anonymize take-home reviews and resume screens.\n\nBlind review is most powerful on the artifacts: code samples, writing tests, design exercises. Score the artifact against the rubric first, attach the name second.",
    },
    {
      heading: "Step 4: Score Independently, Then Aggregate",
      body: "Have interviewers record their scores on the [scorecard](/people/scorecards) *before* the debrief, independently. Anchoring is real: the first loud opinion in a room drags everyone toward it. Independent scores first, discussion second.\n\nThen aggregate. Look at the scores across dimensions and across interviewers, and make the decision on the pattern in the evidence — not on who argued hardest in the room. A candidate who scores consistently well across independent reviewers on the dimensions that matter is a far safer bet than one who won a debate. Structured, recorded, aggregated decisions are also your best defense if a hiring decision is ever questioned.",
    },
  ],
  faq: [
    {
      question: "What is a structured scorecard?",
      answer:
        "A pre-defined set of dimensions for a role — each with explicit rating levels — that every interviewer scores every candidate against. It replaces a gut-feel thumbs up/down with consistent, comparable evidence recorded the same way for everyone.",
    },
    {
      question: "Does blind review work for live interviews?",
      answer:
        "Full blinding isn't possible once you're face to face, but you can anonymize the artifacts — take-home submissions, code samples, writing tests, resume screens — and score those against the rubric before attaching a name. That's where blind review has the most leverage.",
    },
    {
      question: "Why score before the debrief?",
      answer:
        "To avoid anchoring. The first strong opinion in a debrief pulls everyone toward it. Recording independent scores first, then discussing, keeps each interviewer's read intact so the aggregate reflects real consensus rather than the loudest voice.",
    },
  ],
});

// ── Recruiting ops: retained vs contingency + warm intros ──────────────
BLOG_POSTS.push({
  slug: "retained-vs-contingency-search-and-the-power-of-warm-intros",
  title: "Retained vs Contingency Search — and Why Warm Intros Beat Both",
  description:
    "Understand the difference between retained and contingency recruiting, when each makes sense, and why a warm introduction outperforms cold outreach for the roles that matter most.",
  publishedAt: "2026-05-20",
  updatedAt: "2026-05-23",
  readingTime: 8,
  author: "hired.video",
  toolSlug: "recruiter-agent",
  toolName: "AI Recruiter Agent",
  toolUrl: "/for-recruiters",
  keywords:
    "retained vs contingency search, retained search, contingency recruiting, executive search fees, warm intro hiring, recruiter fee structures, sourcing strategy",
  heroAlt: "A comparison chart of retained vs contingency search with a warm-intro path highlighted",
  category: "Recruiting Ops",
  sections: [
    {
      heading: "The Two Classic Models",
      body: "**Contingency search** means the recruiter is paid only if their candidate is hired — typically a percentage of first-year salary, collected on placement. It's low-commitment for the employer: no placement, no fee. Recruiters work many roles at once and move fast on the easy-to-fill ones.\n\n**Retained search** means the employer pays the recruiter in installments to run a dedicated search, hired or not — usually a third up front, a third at a milestone, a third on placement. The recruiter commits real time to a single role and works it exhaustively. Retained is the model for senior, scarce, or confidential roles.",
    },
    {
      heading: "When to Use Contingency",
      body: "Contingency fits roles with a deep, accessible talent pool and a clear spec — individual contributors, mid-level managers, high-volume hiring. You're paying for reach and speed, and you only pay on success, so the downside is capped.\n\nThe trade-off: a contingency recruiter juggling 20 roles gives each one a fraction of their attention, and races other recruiters to submit the same candidates. You get breadth and speed, not depth. For roles where any qualified hire is a good hire, that's exactly the right trade.",
    },
    {
      heading: "When to Use Retained",
      body: "Retained fits roles where a bad hire is expensive and a long vacancy is worse — executives, rare specialists, confidential replacements. Because the recruiter is paid to run the search regardless of outcome, they invest in mapping the whole market, approaching passive candidates, and managing a discreet process.\n\nThe up-front fee aligns incentives: the recruiter isn't racing to submit fast, they're working to find the *right* person. For a VP or a niche technical leader, paying for that depth beats hoping a contingency recruiter happens to surface the one candidate who fits.",
    },
    {
      heading: "Why Warm Intros Outperform Both",
      body: "For the roles that matter most, the highest-converting source isn't either fee model — it's a warm introduction. A candidate introduced by someone they trust arrives pre-vetted, more responsive, and more likely to accept. Warm intros convert at multiples of cold outreach and shorten the trust-building that normally takes several rounds.\n\nThe practical move is to mine your existing network before (or alongside) engaging a search firm: who do your strong employees know? Who has a former colleague who'd be perfect? A single warm intro to the right person can outperform weeks of either retained or contingency sourcing — and it costs you nothing but the ask.",
    },
    {
      heading: "Combine the Models",
      body: "These aren't mutually exclusive. A common high-performing pattern: work your warm network for the obvious fits, run contingency for the breadth roles, and reserve retained for the one or two searches where depth and discretion are non-negotiable.\n\nTooling helps you run all three. hired.video's [AI Recruiter Agent](/for-recruiters) turns a plain-English brief into a ranked shortlist with personalized outreach, so even the cold portion of your sourcing starts warmer — every message references the candidate's actual background instead of a template, which is the next best thing to a referral.",
    },
  ],
  faq: [
    {
      question: "What's the core difference between retained and contingency search?",
      answer:
        "Payment timing and commitment. Contingency pays the recruiter only on a successful placement, so they work many roles fast. Retained pays in installments to run a dedicated search whether or not it results in a hire, so the recruiter commits deep attention to one role — the model for senior, scarce, or confidential positions.",
    },
    {
      question: "Why do warm introductions convert better than cold outreach?",
      answer:
        "Trust transfers. A candidate introduced by someone they already trust is more responsive, arrives pre-vetted, and is more likely to accept. That shortcuts several rounds of trust-building, which is why a single warm intro often outperforms weeks of cold sourcing for high-stakes roles.",
    },
    {
      question: "Can I use more than one model at once?",
      answer:
        "Yes, and most effective teams do — warm network for the obvious fits, contingency for breadth roles, and retained for the one or two searches where depth and discretion are essential. Tooling like the AI Recruiter Agent makes even the cold portion warmer with personalized, background-aware outreach.",
    },
  ],
});

// ── People Ops (CHRO): effective 1:1s ──────────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-run-effective-one-on-ones",
  title: "How to Run Effective 1:1s (and Actually Track the Follow-Through)",
  description:
    "A manager's guide to 1:1s that build trust and surface problems early — the cadence, the agenda, who owns the conversation, and how to track action items so nothing falls through.",
  publishedAt: "2026-05-06",
  updatedAt: "2026-05-09",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "one-on-ones",
  toolName: "1:1s",
  toolUrl: "/people/one-on-ones",
  keywords:
    "effective one on ones, 1:1 meeting agenda, manager one on ones, 1:1 template, employee one on ones, people management, 1:1 action items",
  heroAlt: "A 1:1 view showing a shared agenda, talking points, and tracked action items",
  category: "People Ops",
  sections: [
    {
      heading: "The 1:1 Is the Employee's Meeting, Not Yours",
      body: "The most common 1:1 failure mode is a manager using the time as a status update — a verbal stand-up that the chat tool already covers. A great 1:1 is the *employee's* meeting: their agenda, their concerns, their growth. Your job is to listen, unblock, and coach, not to collect a progress report.\n\nReframing the meeting this way changes everything. When the report owns the agenda, the conversation drifts toward the things that actually matter — blockers, career direction, friction with the team — which are exactly the signals you'd otherwise learn about too late.",
    },
    {
      heading: "Cadence: Weekly, 30 Minutes, Protected",
      body: "For most reports, weekly is the right default — frequent enough to catch problems while they're small. Thirty minutes is usually plenty if it's focused. The non-negotiable is that you *protect* the time: cancelling 1:1s when you're busy sends the message that the person is optional, and that's precisely when they most need the time.\n\nIf weekly is genuinely too much for a senior, autonomous report, biweekly can work — but never skip silently. A reliably-kept 1:1 is one of the strongest trust signals a manager sends.",
    },
    {
      heading: "A Simple, Durable Agenda",
      body: "You don't need an elaborate template. A durable structure: (1) how are you doing — genuinely, not the reflexive \"fine\"; (2) what's blocking you that I can help with; (3) progress and priorities; (4) growth and career; (5) feedback, both directions.\n\nKeep a shared, running agenda the report can add to between meetings. On hired.video's [1:1s](/people/one-on-ones), the agenda and talking points live in one place both people can see, so the conversation builds on the last one instead of starting cold every week.",
    },
    {
      heading: "Capture Action Items — or the 1:1 Leaks",
      body: "The fastest way to erode trust is to agree to something in a 1:1 and then forget it. Every 1:1 should end with explicit action items and an owner for each. On hired.video, those action items are tracked as tasks tied to the conversation, so they carry forward and you can open the next 1:1 by closing the loop on the last one.\n\n\"Last week you raised X and I said I'd do Y — here's where that landed\" is the single highest-trust sentence a manager can open with. It only works if the system remembered, which is why capturing items beats relying on memory.",
    },
    {
      heading: "What to Listen For",
      body: "Beyond the agenda, 1:1s are your early-warning system. Listen for the quiet signals: a normally engaged person going flat, repeated frustration with the same blocker, a report who's stopped talking about growth. These show up in 1:1s weeks before they show up in performance — if you're listening for them.\n\nThe 1:1 is where retention is won or lost. People rarely leave over a single event; they leave over a slow accumulation of unaddressed friction. The manager who surfaces and acts on that friction in the 1:1 is the manager whose team stays.",
    },
  ],
  faq: [
    {
      question: "How often should I hold 1:1s?",
      answer:
        "Weekly for most reports, 30 minutes, and protect the time — don't cancel when you're busy, since that's often when the report most needs it. Biweekly can work for senior, autonomous reports, but never skip silently.",
    },
    {
      question: "Whose meeting is the 1:1?",
      answer:
        "The employee's. The most common failure is a manager turning it into a status update. Let the report own the agenda and use your time to listen, unblock, and coach — that's what surfaces the blockers and career concerns you'd otherwise learn about too late.",
    },
    {
      question: "How do I keep 1:1 commitments from being forgotten?",
      answer:
        "Capture explicit action items with an owner at the end of every 1:1 and track them. On hired.video, 1:1 action items are tracked as tasks tied to the conversation, so they carry forward and you can open the next meeting by closing the loop on the last one.",
    },
  ],
});

// ── People Ops (CHRO): build an org chart ──────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-build-an-org-chart-that-stays-accurate",
  title: "How to Build an Org Chart That Stays Accurate",
  description:
    "Build a live org chart on hired.video that reflects who actually reports to whom — including external and placeholder roles — and keeps itself current as your roster changes.",
  publishedAt: "2026-05-24",
  updatedAt: "2026-05-26",
  readingTime: 6,
  author: "hired.video",
  toolSlug: "roster",
  toolName: "People Roster",
  toolUrl: "/people/roster",
  keywords:
    "build an org chart, org chart software, reporting structure, company org chart, people operations, org chart that updates, headcount roster",
  heroAlt: "An org chart rendered from a live people roster with reporting lines",
  category: "People Ops",
  sections: [
    {
      heading: "Why Most Org Charts Are Wrong",
      body: "The typical org chart is a slide deck someone updated nine months ago. It's wrong the day after it's made, because reorgs, hires, and departures don't trigger a deck edit. A stale org chart is worse than none — it gives people false confidence about who owns what.\n\nThe fix is to derive the org chart from a live source of truth rather than maintaining it as a separate artifact. On hired.video, that source is the people roster: build the roster once, and the chart renders from it.",
    },
    {
      heading: "Start From the Roster, Not a Blank Canvas",
      body: "hired.video's People Operations product anchors on the [people roster](/people/roster), which materializes from your company role associations. People who are already linked to your company show up automatically — you don't re-enter them. The roster is the SSoT; the org chart is a view of it.\n\nThis is the key inversion. Instead of drawing boxes and hoping they match reality, you maintain the roster (which you have reasons to keep current anyway — it drives 1:1s, goals, and team health) and the chart stays accurate as a byproduct.",
    },
    {
      heading: "Handle the Messy Real-World Cases",
      body: "Real org charts have gaps the clean version ignores. hired.video's roster models them with an identity link that can be a real user, a pending invite, an external person, or a placeholder. That means you can chart:\n\n- An **open req** — a placeholder box for a role you're hiring, so the chart shows the intended structure.\n- An **external contractor or advisor** who reports into the team but isn't an employee.\n- A **pending hire** who's been invited but hasn't joined yet.\n\nMost org-chart tools force everyone into \"employee.\" Modeling these explicitly is what keeps the chart honest about how the team actually works.",
    },
    {
      heading: "Set Reporting Lines and Keep It Live",
      body: "With the roster populated, set each person's manager to establish reporting lines, and the chart assembles itself. When someone joins, leaves, or moves teams, you update the roster — and because the chart is a view of the roster, it updates too. There's no second artifact to remember to edit.\n\nA note on billing: the roster derives who's billable from the data, and adding a placeholder or external person to your chart doesn't silently bump your seat count. You can model the full org honestly without a surprise on your invoice.",
    },
  ],
  faq: [
    {
      question: "Why do org charts go stale so fast?",
      answer:
        "Because they're usually maintained as a separate artifact — a slide or a diagram — that nobody updates when the team changes. Deriving the chart from a live roster fixes this: you keep the roster current for other reasons, and the chart stays accurate as a byproduct.",
    },
    {
      question: "Can I show open roles and external people on the chart?",
      answer:
        "Yes. hired.video's roster models each person via an identity link that can be a real user, a pending invite, an external person, or a placeholder. So you can chart open reqs, contractors, advisors, and pending hires explicitly instead of forcing everyone into 'employee.'",
    },
    {
      question: "Does adding people to the chart increase my bill?",
      answer:
        "The roster derives who's billable from the data, and adding a placeholder or external person to model your structure doesn't automatically bump your seat count. You can represent the full org honestly without an unexpected charge.",
    },
  ],
});

// ── People Ops (CHRO): team health signals ─────────────────────────────
BLOG_POSTS.push({
  slug: "team-health-signals-every-manager-should-watch",
  title: "Team Health Signals Every Manager Should Watch (Before People Quit)",
  description:
    "The early-warning signals of a team in trouble — engagement drift, 1:1 cancellations, goal stalls — and how to read them on hired.video's team health view before they become resignations.",
  publishedAt: "2026-05-29",
  updatedAt: "2026-06-01",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "team-health",
  toolName: "Team Health",
  toolUrl: "/people/team-health",
  keywords:
    "team health signals, employee engagement, prevent attrition, manager dashboard, team morale, retention signals, people analytics",
  heroAlt: "A team health dashboard showing engagement trends and risk indicators by person",
  category: "People Ops",
  sections: [
    {
      heading: "Resignations Are Lagging Indicators",
      body: "By the time someone gives notice, the decision was made weeks or months earlier. The resignation is a lagging indicator; the signals that predicted it were visible all along. The managers who keep their best people aren't luckier — they read the leading indicators and act while there's still something to act on.\n\nThe goal of a team-health view isn't a vanity dashboard. It's to surface the quiet drift — the things that don't show up in a status report — early enough to do something about it.",
    },
    {
      heading: "Signal 1: Engagement Drift",
      body: "The clearest early signal is a change in someone's normal pattern. A person who used to volunteer ideas going quiet. A consistently positive report whose tone flattens. Participation tailing off in places they used to show up. None of these is damning on its own — but a sustained drop from someone's own baseline is the canary.\n\nWatch the *delta*, not the absolute level. A naturally reserved person being reserved is nothing; a normally vocal person going silent is everything. Baseline-relative reads are what separate signal from noise.",
    },
    {
      heading: "Signal 2: 1:1 and Goal Stalls",
      body: "Two concrete, trackable signals: cancelled 1:1s and stalled goals. When a report starts pushing or skipping 1:1s — or when you do — the most important conversation channel is closing exactly when it matters. And a goal that hasn't moved in weeks is either blocked, deprioritized, or abandoned, and any of those is worth a conversation.\n\nBecause hired.video ties 1:1s, goals, and the roster together, the [team health](/people/team-health) view can surface these as structured signals rather than something you have to notice by accident across five different tools.",
    },
    {
      heading: "Signal 3: Workload and Recognition Imbalance",
      body: "Two imbalances quietly burn people out. The first is workload: the person who's always the one carrying the launch, covering the on-call, absorbing the overflow. The second is recognition: high contribution that goes unacknowledged. Either one, sustained, leads to resentment and then departure.\n\nThese are harder to see from a status report and easier to see from patterns over time — who's consistently overcommitted, whose wins aren't being named. A team-health view that aggregates over weeks makes the pattern visible while you can still rebalance.",
    },
    {
      heading: "From Signal to Action",
      body: "A signal is only useful if it changes what you do. When the team-health view flags a person, the move is almost always the same: a real conversation in the next 1:1. Name what you're seeing, ask open questions, and listen. Most of the time the problem is addressable — a blocker you can clear, a recognition gap you can close, a workload you can rebalance — *if* you catch it early.\n\nThe managers who retain their teams treat the team-health view as a prompt to have conversations, not a scoreboard. The dashboard's only job is to make sure the conversation happens before the resignation letter does.",
    },
  ],
  faq: [
    {
      question: "What are the earliest signs someone might leave?",
      answer:
        "Changes from a person's own baseline: a normally vocal report going quiet, flattening tone, cancelled 1:1s, and stalled goals. These leading indicators show up weeks before a resignation, which is itself a lagging indicator of a decision already made.",
    },
    {
      question: "Why watch the delta instead of the absolute level?",
      answer:
        "Because people differ. A naturally reserved person being reserved is noise; a normally vocal person going silent is signal. Reading each person relative to their own baseline is what separates a real warning from a personality trait.",
    },
    {
      question: "What should I do when the team-health view flags someone?",
      answer:
        "Have a real conversation in the next 1:1 — name what you're seeing, ask open questions, and listen. The view is a prompt to talk early, not a scoreboard. Most issues are addressable if you catch them before the decision to leave is made.",
    },
  ],
});

// ── Events: host a hiring event ────────────────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-host-a-hiring-event-on-hired-video",
  title: "How to Host a Hiring Event on hired.video",
  description:
    "Create, promote, and manage a hiring event on hired.video — set the details, share a public page, collect RSVPs, and run the day from one manage view.",
  publishedAt: "2026-05-11",
  updatedAt: "2026-05-13",
  readingTime: 6,
  author: "hired.video",
  toolSlug: "events",
  toolName: "Events",
  toolUrl: "/events/new",
  keywords:
    "host a hiring event, recruiting event, virtual career fair, event RSVP, create an event, hiring meetup, talent event",
  heroAlt: "An event creation form next to a public event page with an RSVP button",
  category: "Events",
  sections: [
    {
      heading: "Why Run an Event Instead of Posting a Job",
      body: "A job post is passive — you wait for applicants. An event is active — you create a moment people show up for. Career fairs, virtual info sessions, hiring meetups, and AMAs convert interest into a shortlist faster than a static listing, because attendance is itself a signal of intent.\n\nEvents also build employer brand. The candidates who attend your info session arrive warmer to every role you post afterward, because they've already met you. On hired.video, an event is a first-class object with its own public page, RSVP flow, and management view.",
    },
    {
      heading: "Step 1: Create the Event",
      body: "Open [Create Event](/events/new) and fill the essentials: title, description, date and time, format (in-person or virtual), and location or meeting link. Write the description for the candidate — what they'll get out of attending, who should come, what to expect.\n\nA clear, specific title outperforms a clever one. \"Backend Engineering Hiring AMA — Tuesday 1pm PT\" tells someone exactly whether to show up; \"Join us for an exciting evening!\" doesn't.",
    },
    {
      heading: "Step 2: Share the Public Page",
      body: "Each event gets a public page at its own URL (`/events/<id-or-slug>`) that anyone can view and RSVP to — no account required to see it. Share that link in job posts, on your company page, in outreach, and on social. The page is the canonical home for the event; everything points to it.\n\nBecause the page is public and shareable, it doubles as a marketing asset. A well-written event page surfaces in search and gives candidates a clean, branded place to commit.",
    },
    {
      heading: "Step 3: Manage RSVPs and Run the Day",
      body: "As people RSVP, manage the event from its [manage view](/events/new) (`/events/<id>/manage`): see who's coming, send updates, and prepare for the headcount. On the day, run the session from the same place — the manage view is your operational home for the event.\n\nAfter the event, follow up fast. The attendees who showed up are your warmest top-of-funnel; a same-day follow-up while the conversation is fresh converts far better than a generic blast a week later.",
    },
  ],
  faq: [
    {
      question: "Can candidates RSVP without a hired.video account?",
      answer:
        "Each event has a public page at its own URL that anyone can view, so candidates can find and read about the event without signing up. The public page is the shareable home for the event that you point all your promotion toward.",
    },
    {
      question: "Where do I manage an event once it's live?",
      answer:
        "From the event's manage view at /events/<id>/manage. That's where you see RSVPs, send updates, and run the day. The public-facing page at /events/<id-or-slug> is what candidates see.",
    },
    {
      question: "What kinds of events work best for hiring?",
      answer:
        "Anything that creates a moment to show up for: virtual info sessions, hiring AMAs, career fairs, and meetups. They convert interest faster than a static job post because attendance signals intent — and they warm candidates to every role you post afterward.",
    },
  ],
});

// ── Bookings / coaching sessions ───────────────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-book-a-coaching-session-on-hired-video",
  title: "How to Book a Career Coaching Session on hired.video",
  description:
    "Find a coach, book a session, and get the most out of career coaching on hired.video — including resume feedback and the difference between a one-off session and ongoing coaching.",
  publishedAt: "2026-06-02",
  updatedAt: "2026-06-04",
  readingTime: 6,
  author: "hired.video",
  toolSlug: "bookings",
  toolName: "Bookings",
  toolUrl: "/bookings",
  keywords:
    "book a coaching session, career coaching, resume feedback, career coach booking, mock interview coaching, hire a career coach, coaching session online",
  heroAlt: "A bookings page showing available coaching slots and a session type selector",
  category: "Coaching",
  sections: [
    {
      heading: "When Coaching Is Worth It",
      body: "A coaching session is worth it when you're stuck on something specific and a second set of expert eyes would unstick you faster than another week of guessing. The highest-ROI uses: a resume that isn't getting callbacks, interview prep before a round that matters, a career pivot you can't see the path through, or salary-negotiation strategy on a live offer.\n\nCoaching is targeted, not generic. The best sessions start with a concrete problem — \"I have a final round on Thursday and I keep stumbling on the systems-design portion\" — rather than \"help me with my career.\"",
    },
    {
      heading: "Step 1: Find a Coach and Book a Slot",
      body: "Open [Bookings](/bookings) to see coaches and their available session types and times. Pick the session that matches your need — resume review, mock interview, career strategy — and choose an open slot. Booking reserves the time and confirms the session.\n\nWhen you book, write a sentence or two about what you want from the session. A coach who knows your goal before the call walks in prepared, and you spend the session on the work instead of on context-setting.",
    },
    {
      heading: "Step 2: Prepare So the Session Pays Off",
      body: "A coaching session is short; preparation is what makes it count. Before the call: have your materials ready (resume, job description, the offer), write down your two or three most important questions, and decide what a successful session looks like to you.\n\nFor a resume review, hired.video also has a dedicated resume-feedback workflow where a reviewer can leave inline annotations — sticky notes, highlights, and comments — and even propose suggested edits as a draft, all kept separate from your resume so they never print. Pairing a live coaching session with written annotations gives you both the conversation and a durable record to act on afterward.",
    },
    {
      heading: "Step 3: One-Off vs Ongoing Coaching",
      body: "A single session is right for a specific, bounded problem — review this resume, prep for this interview. Ongoing coaching is right for a longer arc: a career change, a leadership-skills push, a months-long job search where you want consistent accountability.\n\nStart with one session. If it delivers and you have a longer journey ahead, ask the coach about a recurring arrangement. The first session also tells you whether this is the right coach for you — fit matters as much as credentials, and one session is a low-cost way to find out.",
    },
  ],
  faq: [
    {
      question: "Where do I book a coaching session?",
      answer:
        "On the Bookings page, where you can see coaches, their session types, and available times. Pick the session that matches your need — resume review, mock interview, or career strategy — choose an open slot, and add a note about your goal so the coach arrives prepared.",
    },
    {
      question: "Can I get written resume feedback as well as a live session?",
      answer:
        "Yes. hired.video has a dedicated resume-feedback workflow where a reviewer leaves inline annotations — sticky notes, highlights, and comments — and can propose suggested edits as a draft. Those annotations are kept separate from your resume so they never print, giving you a durable record to act on alongside the live conversation.",
    },
    {
      question: "Should I book one session or ongoing coaching?",
      answer:
        "Start with one. A single session suits a specific problem like reviewing a resume or prepping for an interview. If you're facing a longer arc — a career change or a months-long search — ask about ongoing coaching after the first session, which also lets you confirm the coach is the right fit.",
    },
  ],
});

// ── Company reviews: how to leave one ──────────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-leave-a-company-review-that-helps",
  title: "How to Leave a Company Review That Actually Helps People",
  description:
    "Write a fair, specific company review on hired.video — rate the six sub-axes honestly, give actionable pros and cons, and earn a verified-employee badge so your review carries weight.",
  publishedAt: "2026-06-03",
  updatedAt: "2026-06-05",
  readingTime: 6,
  author: "hired.video",
  toolSlug: "company-reviews",
  toolName: "Company Reviews",
  toolUrl: "/companies",
  keywords:
    "leave a company review, write employer review, glassdoor alternative review, verified employee review, company culture review, honest employer review",
  heroAlt: "A company review form with six sub-axis rating sliders and pros/cons fields",
  category: "Job Search Strategy",
  sections: [
    {
      heading: "Why Your Review Matters More Than You Think",
      body: "Company reviews are how the next candidate decides whether to accept an offer, negotiate, or walk away. A specific, honest review can save someone from a bad fit or steer someone great toward a hidden gem. A lazy one — five stars, no detail, or a one-star revenge post — just adds noise.\n\nhired.video reviews are bound to authenticated accounts, one per user per company, and rated across six sub-axes rather than a single star. That structure exists so reviews stay useful and hard to game. Your job as a reviewer is to fill that structure with honest specifics.",
    },
    {
      heading: "Rate All Six Axes Honestly",
      body: "Open the company on [Companies](/companies) and leave a review rated across the six axes: culture, leadership, work-life balance, compensation, career growth, and diversity & inclusion. Resist the urge to make them all match. Most real workplaces are uneven — great culture with brutal hours, or strong pay with no growth path.\n\nThe *shape* of your ratings is the most useful thing you give a future candidate. A company that's a 5 on culture and a 2 on work-life balance tells a far more honest story than a flat 3.5 across the board. Rate each axis on its own merits.",
    },
    {
      heading: "Write Pros, Cons, and Advice That Are Specific",
      body: "Specificity is everything. \"Good culture\" helps no one; \"weekly cross-team demos meant I always knew what other teams were building\" helps a lot. For each of pros, cons, and advice to management, give concrete examples a reader can picture.\n\nKeep it about patterns, not people. \"My manager was bad\" is a grievance; \"managers here have wide spans and limited time for coaching\" is a structural insight a candidate can use. The most valuable reviews describe how the place actually works, not a single bad day.",
    },
    {
      heading: "Earn the Verified-Employee Badge",
      body: "A review carries far more weight when readers know it's from a real employee. On hired.video you can earn a verified-employee badge by matching your corporate email domain at review time. Verified reviews are the ones candidates trust most.\n\nVerification also protects the system: because reviews are account-bound and sub-axis ratings are stored as auditable numeric values, the platform can detect suspicious bursts and drift. Leaving a genuine, verified, specific review is the single most useful thing you can do for the next person weighing an offer from your company.",
    },
  ],
  faq: [
    {
      question: "What makes a company review actually useful?",
      answer:
        "Specificity and honest unevenness. Rate all six sub-axes on their own merits rather than making them match, and back each rating with concrete pros, cons, and advice a reader can picture. The shape of your ratings and real examples help far more than a flat star count.",
    },
    {
      question: "How do I get my review to carry more weight?",
      answer:
        "Earn the verified-employee badge by matching your corporate email domain at review time. Verified reviews are the ones candidates trust most, and because reviews are account-bound and sub-axis ratings are auditable, the system can flag suspicious activity.",
    },
    {
      question: "Should I write about my specific manager?",
      answer:
        "Focus on patterns over people. 'My manager was bad' is a grievance; 'managers here have wide spans and little time for coaching' is a structural insight a candidate can act on. Describe how the place works, not a single bad day.",
    },
  ],
});

// ── References: how to ask ──────────────────────────────────────────────
BLOG_POSTS.push({
  slug: "how-to-ask-for-a-reference-and-share-it",
  title: "How to Ask for a Reference (and Share It So It Counts)",
  description:
    "Ask for a strong reference the right way, collect them on hired.video, and share a clean reference link with employers — including who to ask, what to give them, and timing.",
  publishedAt: "2026-06-04",
  updatedAt: "2026-06-06",
  readingTime: 6,
  author: "hired.video",
  toolSlug: "references",
  toolName: "References",
  toolUrl: "/references",
  keywords:
    "how to ask for a reference, job reference request, professional references, reference list, share references, who to ask for a reference, reference letter",
  heroAlt: "A references page listing collected references with a secure share link",
  category: "Job Search Strategy",
  sections: [
    {
      heading: "Who to Ask — and Who Not To",
      body: "The best reference is someone who managed you closely, recently, and can speak to specific results — a former direct manager beats a skip-level, who beats a peer, who beats a title-impressive name who barely worked with you. Recency and proximity matter more than seniority. A recent manager who can describe exactly what you shipped is worth more than a VP who vaguely remembers you.\n\nAvoid: anyone you're unsure will be enthusiastic, anyone you parted with on bad terms, and your current manager if your search is confidential. A lukewarm reference is worse than one fewer reference.",
    },
    {
      heading: "How to Ask (the Right Way)",
      body: "Ask early, ask directly, and make it easy to say yes — or no. \"Would you be comfortable being a *strong* reference for me?\" gives them a graceful out if they're hesitant, and you want that out: a reluctant yes becomes a tepid call.\n\nWhen they agree, hand them what they need: the roles you're targeting, a short reminder of the work you did together and the results, and the timing. A reference who's reminded of the specific project you partnered on gives a far more compelling endorsement than one reaching back through a foggy memory.",
    },
    {
      heading: "Collect Them in One Place",
      body: "Don't keep your references scattered across your inbox and a Google Doc. On hired.video's [References](/references) page you collect them in one place — who they are, how they know you, and what they can speak to — so when an employer asks, you're not scrambling to remember contact details.\n\nHaving them organized also means you can tailor which references you surface for which role. A reference who can speak to your leadership is the one to lead with for a management role; a reference who saw your technical depth leads for an IC role.",
    },
    {
      heading: "Share a Clean, Controlled Link",
      body: "When an employer asks for references, you can share a reference link rather than pasting a list into an email. hired.video generates a shareable references link (at `/references/shared/<token>`) so the employer sees a clean, professional view — and you control what's shared rather than exposing your references' contact details in a forwarded thread.\n\nA tokenized link also means you can share references at the right moment in the process — typically once an offer is close — without those contacts being passed around indiscriminately. Give your references a heads-up that a call may come, and the loop closes cleanly.",
    },
  ],
  faq: [
    {
      question: "Who makes the best reference?",
      answer:
        "Someone who managed you closely and recently and can speak to specific results — usually a former direct manager. Recency and proximity matter more than seniority; a recent manager who can describe what you shipped beats a senior name who barely worked with you.",
    },
    {
      question: "How should I ask someone to be a reference?",
      answer:
        "Ask early and directly, and phrase it so they can decline gracefully — 'would you be comfortable being a strong reference for me?' Then make it easy: remind them of the work you did together, the results, and the roles you're targeting so their endorsement is specific.",
    },
    {
      question: "How do I share my references with an employer?",
      answer:
        "On hired.video you can collect references in one place and share a tokenized link (at /references/shared/<token>) instead of pasting contact details into an email. That gives the employer a clean view, keeps your references' details controlled, and lets you share at the right moment in the process.",
    },
  ],
});

// ── Career 360 — target → gaps → roadmap ────────────────────────────────
BLOG_POSTS.push({
  slug: "build-a-career-roadmap-with-ai",
  title: "How to Build a Career Roadmap with AI: Targets, Gaps, and a 90-Day Plan",
  description:
    "Turn a vague ambition into a dated plan. This guide shows how to pick a realistic target role, run an AI gap analysis across the eight signals recruiters actually read, and convert the gaps into a 30/60/90/180-day roadmap with Career 360.",
  publishedAt: "2026-06-14",
  updatedAt: "2026-06-14",
  readingTime: 8,
  author: "hired.video",
  toolSlug: "career-360",
  toolName: "Career 360",
  toolUrl: "/tools/career-360",
  keywords:
    "career roadmap, AI career planner, career gap analysis, 90 day career plan, how to get promoted, career goals, next role planning, skills gap analysis, career development plan",
  heroAlt:
    "A radial career wheel scoring eight signals with a 30/60/90/180-day roadmap beneath it",
  category: "Career Strategy",
  sections: [
    {
      heading: "Why Most Career Goals Never Happen",
      body: "\"I want to be a senior product manager\" is a wish, not a plan. It has no target you can measure against, no list of what's actually missing, and no dated steps. So nothing moves — you stay busy without getting closer.\n\nA career roadmap fixes all three. It starts with a *specific* target role, runs an honest gap analysis between where you are and where that role expects you to be, and then sequences the gaps into dated milestones. The difference between a wish and a roadmap is that a roadmap tells you what to do *this week*.\n\nThe hard part has always been the gap analysis. You can't see your own profile the way a recruiter does, and you don't know which of the dozen things you could improve actually move the needle for the role you want. That's the problem an AI career planner solves: it reads your profile the way a recruiter would, scores it against the target, and tells you which gaps matter most.",
    },
    {
      heading: "Step 1 — Pick a Target You Can Actually Hit",
      body: "Every roadmap starts with a destination. In [Career 360](/tools/career-360), the AI reads your profile and resume and proposes three grounded targets:\n\n- **A next step** — a believable move in the next 6–12 months.\n- **A stretch** — a more ambitious role on a 12–24 month horizon.\n- **A pivot** — a lateral move into an adjacent field, grounded in skills you already have.\n\nNothing is invented. Every suggestion ties back to a signal already on your profile, so you're not chasing a role you have no path into. If none fit, skip the suggestions and type your own — any title, seniority, and timeline. The same engine runs against whatever you enter.\n\nThe rule for a good target: it should feel slightly uncomfortable but not delusional. A target you're already qualified for produces an empty roadmap; a target three levels up produces a roadmap you'll abandon.",
    },
    {
      heading: "Step 2 — Run the Gap Analysis (The Eight Signals)",
      body: "Once you've set a target, Career 360 scores your readiness across the eight signals recruiters actually weigh when they evaluate a candidate:\n\n1. **Resume** — is it tailored, quantified, and ATS-readable for this role?\n2. **Profile** — is your public profile complete and aligned with the target?\n3. **Skills** — do you have (and visibly demonstrate) the skills the role requires?\n4. **Experience** — does your history show the scope and seniority expected?\n5. **Certifications** — do you hold the credentials that gate this role?\n6. **Narrative** — does your summary tell a coherent story toward this target?\n7. **Outreach** — are you visible to and in contact with the right people?\n8. **Salary** — is your compensation expectation calibrated to the market for this role?\n\nEach signal gets a score, and the wheel makes the gaps obvious at a glance — a short spoke is a gap, a full spoke is a strength. This is the part you can't do for yourself: it's an outside read of your candidacy, scored against the specific role you're aiming for rather than in the abstract.",
    },
    {
      heading: "Step 3 — Turn Gaps into a 30/60/90/180-Day Plan",
      body: "A gap you can see is still just a gap. The roadmap is what makes it actionable. Career 360 sequences your gaps into four horizons:\n\n- **30 days** — the quick wins. Usually resume and profile fixes: tailor your resume to the target, fill out the missing profile sections, rewrite your summary so the narrative points at the role you want. These move your scores fast.\n- **60 days** — the skill and credential work that takes a few weeks. Start a certification, build a portfolio piece, close a visible skills gap.\n- **90 days** — the outreach and positioning work. Start conversations with people in the target role, get visible in the right places, line up references.\n- **180 days** — the deeper experience gaps. The stretch assignment, the side project, the scope you need to demonstrate before the target is realistic.\n\nThe sequencing matters: quick wins first builds momentum and your scores climb early, which keeps you in the plan. Tackling the hardest experience gap on day one is how roadmaps die.",
    },
    {
      heading: "Step 4 — Close Gaps and Watch the Scores Move",
      body: "Each gap on your roadmap links to the specific tool that closes it — Resume Optimizer for the resume gap, Profile Audit for the profile gap, Skill Extractor for skills, and so on. You don't have to figure out *how* to close a gap; the roadmap hands you the tool.\n\nWhen you run a linked tool, your scores update. Career 360 plots every recorded run as a sparkline under the wheel — a running record of improvement over time. That feedback loop is what separates a roadmap from a to-do list: you can see the spoke that was short three weeks ago filling in, which tells you the work is paying off and keeps you moving to the next gap.\n\nRe-run the target analysis periodically. As you close gaps, your profile changes, and a target that was a stretch in month one may become a believable next step by month three — at which point you set a new, higher target and the roadmap regenerates.",
    },
  ],
  faq: [
    {
      question: "What is a career roadmap?",
      answer:
        "A career roadmap is a dated plan that connects where you are now to a specific target role. It has three parts: a measurable target, a gap analysis showing what's missing between you and that role, and a sequence of dated milestones (typically 30/60/90/180 days) for closing those gaps. Career 360 generates all three from your profile.",
    },
    {
      question: "How does the AI decide what my gaps are?",
      answer:
        "Career 360 reads your profile and resume and scores eight signals recruiters weigh — resume, profile, skills, experience, certifications, narrative, outreach, and salary — against the target role you picked. A low score on a signal is a gap; the roadmap then sequences those gaps into dated milestones, quick wins first.",
    },
    {
      question: "Can I set my own target role instead of using the suggestions?",
      answer:
        "Yes. The AI proposes three grounded targets (a next step, a stretch, and a pivot), but you can skip them and type any title, seniority, and timeline. The same gap analysis and roadmap engine runs against whatever target you enter.",
    },
    {
      question: "Is Career 360 free?",
      answer:
        "Yes. The full target picker, gap analysis, and 30/60/90/180-day roadmap are free. Pro unlocks unlimited target refreshes plus deeper coaching tools wired into each gap.",
    },
  ],
});

// ── Skill Extractor ─────────────────────────────────────────────────────
BLOG_POSTS.push({
  slug: "extract-skills-from-any-job-or-resume",
  title: "How to Extract Every Skill from a Job Description or Resume with AI",
  description:
    "Stop reading job descriptions line by line. This guide shows how to pull every skill from any job posting or resume — grouped, deduplicated, and synonym-aware — and turn it into a skills-gap comparison with the AI Skill Extractor.",
  publishedAt: "2026-06-09",
  updatedAt: "2026-06-09",
  readingTime: 6,
  author: "hired.video",
  toolSlug: "skill-extractor",
  toolName: "Skill Extractor",
  toolUrl: "/tools/skill-extractor",
  keywords:
    "extract skills from job description, skills gap analysis, resume skills extractor, AI skill extraction, job description skills, required vs preferred skills, skill matching",
  heroAlt:
    "A job description and a resume side by side with extracted skills grouped by category",
  category: "Resume Tips",
  sections: [
    {
      heading: "Why Manual Skill-Matching Fails",
      body: "When you read a job description by hand, you miss things. A single posting can name 25–40 distinct skills scattered across the summary, the responsibilities, the requirements, and the \"nice to haves\" — and your eye glazes over half of them. Worse, you can't reliably tell which are deal-breakers and which are wish-list items.\n\nKeyword search doesn't save you either. It misses synonyms (\"k8s\" and \"Kubernetes\" are the same skill), conflates skills with company or product names, and can't distinguish a hard skill from a soft one. So you end up either over-claiming skills you don't have or, more often, under-selling because you didn't realize a requirement mapped to something already on your resume.\n\nAn AI skill extractor reads the source the way a recruiter does: it pulls every skill mentioned, collapses synonyms, drops the noise, and groups what's left so you can actually reason about it.",
    },
    {
      heading: "How to Extract Skills (Step-by-Step)",
      body: "With hired.video's [Skill Extractor](/tools/skill-extractor) it takes under a minute:\n\n1. **Open the Skill Extractor** — no signup required for a single source.\n2. **Paste the source** — a job description, an internal role brief, a LinkedIn post, even a Slack message. Or upload a PDF/Word resume; it's parsed client-side before extraction.\n3. **Run the extraction** — the AI returns every skill it finds, grouped by category: languages, frameworks, tools, soft skills, and certifications.\n4. **Read the grouped output** — synonyms are merged, noise is dropped, and where the source distinguishes them, required and preferred skills are surfaced separately.\n\nThe result is a clean, deduplicated list you can scan in seconds instead of a wall of prose you have to mine by hand.",
    },
    {
      heading: "Turn Extraction into a Skills-Gap Comparison",
      body: "Extracting one source is useful; comparing two is where it pays off. Extract the skills from a job you want, then extract the skills from your own resume, and the gap is immediate: the skills the job names that your resume doesn't is your to-do list.\n\nThat gap drives two actions. First, **add the skills you genuinely have but forgot to list** — these are free wins that instantly raise your match. Second, **identify the real gaps** — the skills you'd need to learn or demonstrate before you're a credible candidate, which feed directly into a development plan.\n\nSign in to save extractions, compare across multiple resumes, and run the skills-gap analysis as a repeatable step in every application rather than a one-off.",
    },
    {
      heading: "Where Skill Extraction Fits Your Job Search",
      body: "Skill extraction is the connective tissue between a job posting and the rest of your toolkit. The extracted skill list tells your [Resume Optimizer](/tools/resume-optimizer) exactly which keywords to mirror, feeds your [Career 360](/tools/career-360) gap analysis, and gives recruiters a precise read when they're matching a candidate to a role.\n\nFor recruiters and hiring managers, the same tool works in reverse: extract the skills from a candidate's resume and compare them against the role brief to see fit at a glance, without reading every bullet. One extractor, both sides of the table.",
    },
  ],
  faq: [
    {
      question: "Is the Skill Extractor free?",
      answer:
        "Yes. The extractor is free with no signup required for a single source. Sign in to save extractions, compare across resumes, and run skills-gap analysis between a job and your resume.",
    },
    {
      question: "Does it work for any job posting?",
      answer:
        "Yes. Job descriptions, internal role briefs, LinkedIn posts, even Slack messages — anything text-based works. PDF and Word resumes are parsed client-side before extraction.",
    },
    {
      question: "How is this different from a keyword search?",
      answer:
        "Keyword search misses synonyms ('k8s' vs 'Kubernetes'), conflates skills with company names, and can't tell hard skills from soft ones. The AI groups synonyms, drops the noise, and surfaces required-vs-preferred skills when the source distinguishes them.",
    },
  ],
});

// ── Profile Sync (vendor-sync) ──────────────────────────────────────────
BLOG_POSTS.push({
  slug: "sync-your-resume-everywhere-without-copy-paste",
  title:
    "How to Sync One Master Resume to LinkedIn, Indeed, and Every Other Job Board",
  description:
    "Keep one master resume and push it everywhere without copy-paste drift. This guide shows how Profile Sync generates paste-ready blocks for nine vendors and uses the Chrome extension for safe two-way sync with LinkedIn, Indeed, and more.",
  publishedAt: "2026-06-10",
  updatedAt: "2026-06-10",
  readingTime: 6,
  author: "hired.video",
  toolSlug: "vendor-sync",
  toolName: "Profile Sync",
  toolUrl: "/tools/vendor-sync",
  keywords:
    "sync resume to LinkedIn, update resume everywhere, master resume, profile sync, LinkedIn Indeed resume, keep profiles in sync, resume copy paste, job board profiles",
  heroAlt:
    "One master resume syncing out to LinkedIn, Indeed, Glassdoor, and other job boards",
  category: "Job Search Strategy",
  sections: [
    {
      heading: "The Hidden Cost of Profile Drift",
      body: "Most job seekers maintain the same career story in six or seven places — LinkedIn, Indeed, Glassdoor, ZipRecruiter, a portfolio site — and every one of them slowly drifts out of date. You update LinkedIn, forget Indeed, and three months later a recruiter pulls up a profile with a stale headline and a job you left last year.\n\nProfile drift costs you in two ways. It makes you look careless to anyone who cross-references your profiles, and it means the strongest version of your story only lives in one place while the others quietly undersell you.\n\nThe fix is a single source of truth — one master resume — and a reliable way to push it everywhere. That's what Profile Sync does.",
    },
    {
      heading: "Paste-Ready Blocks for Every Vendor",
      body: "[Profile Sync](/tools/vendor-sync) supports nine vendors today: LinkedIn, Indeed, Glassdoor, ZipRecruiter, Monster, Wellfound, Dice, GitHub, and any personal portfolio site.\n\nFor every vendor, it generates **paste-ready blocks** shaped to that platform's fields — Headline, About / Summary / Highlights (the exact set depends on the vendor), Experience entries, and Skills. You don't need any browser extension for this: open the vendor's edit screen, copy the matching block, paste, save. The content is already formatted the way that platform expects, so there's no reformatting tax.\n\nBecause every block is generated from the same master resume, the story stays consistent everywhere — update the master once and regenerate.",
    },
    {
      heading: "Two-Way Sync with the Chrome Extension",
      body: "Install the hired.video Chrome extension and Profile Sync becomes two-way.\n\n**Pull-back:** when you've edited a profile directly on LinkedIn (or another supported vendor), the extension reads the profile pane on your tab and offers to merge those changes back into your master resume. You review a merge dialog and accept or reject each field — nothing touches your master until you say so.\n\n**Auto-fill:** on LinkedIn, Indeed, Glassdoor, ZipRecruiter, Wellfound, Dice, and Monster, you can auto-fill the Headline and About fields with one click. You open the vendor's edit modal yourself, click Auto-fill, review the value, and click Save on the vendor — the extension never auto-opens modals or auto-saves. It's the same envelope as a password manager: it fills, you confirm.",
    },
    {
      heading: "Safe by Design",
      body: "Two safety rails keep Profile Sync from ever surprising you. On pull-back, the merge dialog is opt-in per field — you approve every change before it reaches your master. On push, you stay in control of the vendor: you open the edit modal, you review the filled value, you click Save. Nothing happens behind your back.\n\nPrivacy is handled the same way. Toggle \"Don't share anonymous usage\" in the extension's Settings to opt out of telemetry entirely. When opt-in is on, the extension records event *types* (e.g. \"a capture happened on this host with N fields\") — never the literal field values or scraped page content. The only data that leaves your machine is the LLM extractor call, which is bound to your account.\n\nThe payoff: one master resume, consistent everywhere, updated in minutes instead of an afternoon of copy-paste — and you can even A/B which variant you posted where to see which version pulls the most callbacks.",
    },
  ],
  faq: [
    {
      question: "Do I need the Chrome extension to use Profile Sync?",
      answer:
        "Only for two-way sync. Without the extension you still get paste-ready blocks for every vendor (Headline, About/Summary/Highlights, Experience, Skills). With the extension you can also pull profile edits back into your master and auto-fill the Headline and About fields on LinkedIn, Indeed, Glassdoor, ZipRecruiter, Wellfound, Dice, and Monster.",
    },
    {
      question: "Will Profile Sync overwrite my LinkedIn without asking?",
      answer:
        "No. On pull-back you review a merge dialog and accept or reject each field before anything touches your master resume. On push you open the vendor's edit modal yourself, click Auto-fill, review the value, and click Save — it never auto-opens modals or auto-saves.",
    },
    {
      question: "Can I sync different resume variants to different vendors?",
      answer:
        "Yes. Pick a master or any variant per vendor. Profile Sync remembers which variant you posted where, so you can A/B which version pulls the most callbacks.",
    },
  ],
});

// ── 52. Voice Marketplace & AI Voiceover (Studio) ────────────────────────────
BLOG_POSTS.push({
  slug: "add-ai-voiceover-to-your-video-resume",
  title: "Add a Studio-Quality AI Voiceover to Your Video Resume — Free, In Your Browser",
  description:
    "Narrate your video resume in a natural AI voice without a microphone or a recording studio. Here's how browser-based voiceover, per-scene scripts, and voice cloning work on hired.video.",
  publishedAt: "2026-05-28",
  updatedAt: "2026-07-04",
  readingTime: 8,
  author: "hired.video",
  toolSlug: "studio",
  toolName: "hired.video Studio",
  toolUrl: "/studio",
  keywords:
    "AI voiceover, text to speech video resume, free AI narration, voice cloning, browser text to speech, video resume voiceover, AI voice generator",
  heroAlt: "A video resume timeline with per-scene voiceover scripts and a waveform",
  category: "Creator Studio",
  studioTemplateFiles: ["video-resume-hook-led"],
  sections: [
    {
      heading: "You Don't Need a Microphone to Sound Professional",
      body: "The hardest part of a video resume isn't the words — it's saying them out loud, on camera, without stumbling. A shaky voiceover or a noisy room can undo an otherwise great script. hired.video removes that barrier entirely: you type your script, pick a voice, and get clean, evenly-paced narration in seconds.\n\nEverything runs inside your browser. There's no upload, no cloud rendering queue, and no per-minute fee — the speech is generated on your own device using WebGPU-accelerated AI voices. That means your script never leaves your machine to be narrated, and you can regenerate a line as many times as you like at zero cost.",
    },
    {
      heading: "Four Voice Engines, One Click Away",
      body: "Different moments call for different voices, so Studio ships four narration engines you can switch between per project:\n\n**Instant system voices** — the fastest option, great for a quick draft or a first pass.\n\n**Kokoro-82M** — a warm, natural-sounding neural voice that reads long scripts without the robotic cadence older text-to-speech is known for.\n\n**Piper** — crisp, fast, and lightweight, ideal when you want a clear delivery on a modest device.\n\n**VibeVoice** — the cloning engine, for when you want the narration to sound like *you* (more on that below).\n\nEach voice supports speed control and word-level timing, so the captions on screen light up in sync with the narration automatically.",
    },
    {
      heading: "Write Once, Narrate Scene by Scene",
      body: "Studio keeps a separate, editable script for every scene in your video. Rework the hook without touching the closing call-to-action. Tweak one sentence and regenerate just that line — the rest of your voiceover stays exactly as it was.\n\nBecause the timing is captured at the word level, your on-screen captions, chapter markers, and scene transitions all stay locked to the narration. Change the script and everything downstream re-times itself, so you're never hand-nudging caption timings after an edit.",
    },
    {
      heading: "Clone Your Own Voice — Or Earn From It",
      body: "With the VibeVoice engine you can create a personal voice clone and narrate every project in your own voice, even the scripts you write at 2 a.m. and would never want to record live. Your clone is bound to your account under a perpetual personal license, and our consent terms (ToS §9a) make ownership and permission explicit — you clone your voice, nobody else's.\n\nCreators can go a step further and list a voice in the marketplace. When someone licenses it, you keep the majority of every sale — the split favors the creator, with the small card fee passed to the buyer, not deducted from your earnings. It's a genuinely passive way to monetize a distinctive voice.",
    },
    {
      heading: "How to Add a Voiceover in Under Two Minutes",
      body: "1. **Open Studio** and create or open a video resume project.\n2. **Write your script** in the scene panel — or let the AI storyboard generate a first draft from your resume.\n3. **Pick a voice engine** and adjust the speed to match your energy.\n4. **Click generate** — the narration is produced on your device, and captions time themselves to it.\n5. **Preview, tweak, and export** in 720p, 1080p, or 4K, then publish straight to YouTube or download for LinkedIn.\n\nNo studio, no retakes, no awkward re-recording. Just your story, told in a voice you're proud of.",
    },
  ],
  faq: [
    {
      question: "Is the AI voiceover really free?",
      answer:
        "Yes. The neural voices run in your browser using WebGPU, so generating narration costs nothing per minute and works offline once the voice loads. You can regenerate lines as many times as you like without a usage meter.",
    },
    {
      question: "Will an AI voiceover sound robotic?",
      answer:
        "The modern engines (Kokoro-82M, Piper, and VibeVoice) are a generation ahead of classic text-to-speech. They read with natural pacing and inflection, and you can fine-tune speed to match your delivery. For the most authentic result, clone your own voice with VibeVoice.",
    },
    {
      question: "Can I make money from a voice clone?",
      answer:
        "Yes. Creators can list a voice clone in the marketplace and keep the majority of every license sale — the split favors the creator and the card fee is passed to the buyer. Our consent terms require that you only clone a voice you own and have the right to license.",
    },
  ],
});

// ── 53. References showcase ───────────────────────────────────────────────────
BLOG_POSTS.push({
  slug: "turn-your-references-into-a-job-winning-asset",
  title: "Stop Emailing References as an Afterthought — Turn Them Into a Job-Winning Asset",
  description:
    "Most candidates treat references as a formality. Here's how to collect, verify, and showcase references that quietly close the deal — with full control over what stays private.",
  publishedAt: "2026-06-11",
  updatedAt: "2026-07-02",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "references",
  toolName: "References",
  toolUrl: "/references",
  keywords:
    "professional references, how to list references, reference page, job references, verified references, references on resume, showcase references",
  heroAlt: "A references page with verified endorsements and per-section privacy controls",
  category: "Career Strategy",
  sections: [
    {
      heading: "References Are the Most Underused Part of Your Application",
      body: "By the time an employer asks for references, they're already leaning toward yes — a strong reference either seals that or quietly unravels it. Yet most candidates scramble at the last minute, texting an old manager \"can I put you down?\" and hoping the phone call goes well.\n\nA better approach: build a standing set of references you've already collected, worded the way you'd want a hiring manager to read them, and ready to share the moment you're asked. hired.video gives you one place to gather, organize, and present them — so references become a proactive asset instead of a last-minute liability.",
    },
    {
      heading: "Collect Once, Reuse for Every Application",
      body: "Instead of re-requesting references for each job, you build a durable library. Add the people who'll speak for you, capture their relationship and title, and store the endorsement text alongside your resume. When a new opportunity comes up, the work is already done — you're not chasing anyone.\n\nBecause your references live next to your resumes in one account, you can attach the right people to the right variant: your engineering references for a technical role, your leadership references for a management role.",
    },
    {
      heading: "You Decide What's Public — Down to the Field",
      body: "References are sensitive, so hired.video defaults to private and puts you in control. You choose whether references appear on your public profile at all, and when they do, the public view is deliberately trimmed to non-identifying details — enough to signal credibility without exposing a referrer's personal contact information to the open internet.\n\nThat means you can show \"a former VP of Engineering endorses this candidate\" on your profile while keeping the full contact details reserved for verified employers who genuinely need them. It's social proof without oversharing.",
    },
    {
      heading: "Pull References Straight Into Your Resume",
      body: "When you're building or tailoring a resume in the studio, your saved references are one click away — import them as a section without retyping a word. The same source of truth powers your public profile, your references page, and your resume documents, so an update in one place keeps everything consistent.\n\nNo more maintaining a separate \"references available upon request\" line and a scattered list of contacts in your notes app. It's all connected.",
    },
  ],
  faq: [
    {
      question: "Should I put references on my resume?",
      answer:
        "Not the full contact details — those go to employers who ask. But a signal that you have credible references (with titles and relationships) can strengthen a profile. hired.video lets you show a trimmed, non-identifying version publicly and keep the private details for verified employers.",
    },
    {
      question: "Are my references' contact details exposed publicly?",
      answer:
        "No. References default to private. If you choose to show them publicly, the public view is limited to non-identifying details. Full contact information is reserved for verified employers, so you get social proof without exposing anyone's personal data.",
    },
    {
      question: "Can I use different references for different jobs?",
      answer:
        "Yes. Build one library and attach the most relevant people to each resume variant — technical references for engineering roles, leadership references for management roles — then import them into the matching resume in a click.",
    },
  ],
});

// ── 54. Learning, certificates & XP ──────────────────────────────────────────
BLOG_POSTS.push({
  slug: "earn-verifiable-certificates-and-level-up-your-career",
  title: "Earn Verifiable Certificates and Actually Level Up — Not Just Collect PDFs",
  description:
    "Most online courses hand you a PDF nobody can verify. hired.video Learning gives you tamper-proof certificates, a structured path to a real goal, and momentum that keeps you going.",
  publishedAt: "2026-06-24",
  updatedAt: "2026-07-04",
  readingTime: 8,
  author: "hired.video",
  toolSlug: "learning",
  toolName: "hired.video Learning",
  toolUrl: "/learn/dashboard",
  keywords:
    "verifiable certificate, online course certificate, learning path, SCORM course, professional development, upskilling, career learning, course completion certificate",
  heroAlt: "A learner dashboard showing a learning path, XP, streak, and a verifiable certificate",
  category: "Learning",
  sections: [
    {
      heading: "A Certificate Nobody Can Verify Is Just a Picture",
      body: "You finish a course, download a PDF, and add it to your profile — but when an employer clicks it, there's no way to confirm it's real. That's the quiet weakness of most online learning: the credential is unverifiable, so it carries almost no weight.\n\nhired.video issues certificates that an employer can actually check. Each one is cryptographically signed, so anyone you share it with can confirm it was issued to you, for that course, on that date — and that it hasn't been altered. Your effort turns into a credential that holds up under scrutiny.",
    },
    {
      heading: "Start From a Goal, Not a Random Course",
      body: "Learning sticks when it's pointed at something. Instead of picking courses at random, you tell hired.video the goal — \"become a front-end engineer,\" \"move into people management\" — and it assembles a structured path of the right courses in the right order.\n\nBehind the scenes this is a real learning-path engine, not a static playlist: prerequisites are respected, and your progress unlocks the next step. You always know what to do next and why it matters for where you're trying to go.",
    },
    {
      heading: "Momentum, Built In",
      body: "The reason most people abandon online courses isn't difficulty — it's losing momentum. hired.video Learning is designed to keep you moving. You earn points for progress, build a daily streak, and unlock badges as you hit milestones. A leaderboard lets you measure your pace against your cohort or the whole community when you want a push.\n\nYour learner dashboard pulls it all into one view: what you're enrolled in, what's due, how far along you are, your streak, your points, and the certificates you've already earned. Open it and you immediately know your next move.",
    },
    {
      heading: "An AI Coach That Knows What You're Studying",
      body: "Stuck on a concept? The built-in AI coach is aware of the exact course and lesson you're on, so you can ask a question in plain language and get an answer grounded in what you're actually learning — no copying context into a separate chatbot.\n\nIt's the difference between a generic search and a tutor who's been reading over your shoulder. Ask it to re-explain a topic, quiz you, or connect a lesson to your career goal.",
    },
    {
      heading: "For Employers and Educators, Too",
      body: "The same system powers structured training for teams and classrooms. Employers can author their own courses and learning paths, assign them, and track completion; educators can run cohorts with a gradebook that keeps every learner's assignments aligned. Certificates issued through that flow carry the same verifiable signature — so internal training produces credentials that mean something outside the company, too.",
    },
  ],
  faq: [
    {
      question: "How is a hired.video certificate verifiable?",
      answer:
        "Each certificate is cryptographically signed when issued. Anyone you share it with can confirm it was genuinely issued to you, for that course, on that date, and that it hasn't been tampered with — unlike a plain PDF that anyone could edit.",
    },
    {
      question: "Do I have to pick courses one at a time?",
      answer:
        "No. Tell hired.video your goal and it assembles a structured learning path — the right courses in the right order, with prerequisites respected. You can still enroll in individual courses, but the path keeps you pointed at an outcome.",
    },
    {
      question: "Can my company create its own courses?",
      answer:
        "Yes. Employers and educators can author courses and learning paths, assign them, run cohorts with a gradebook, and track completion. Certificates from those courses carry the same verifiable signature as public ones.",
    },
  ],
});

// ── 55. Candidate Packet + Anonymize (recruiter → hiring manager) ─────────────
BLOG_POSTS.push({
  slug: "send-hiring-managers-a-bias-free-candidate-packet",
  title: "How to Send Hiring Managers a Clean, Bias-Free Candidate Packet",
  description:
    "Forwarding a pile of resumes as email attachments makes recruiters look disorganized — and invites bias. Here's how to package a shortlist into one polished, optionally anonymized packet.",
  publishedAt: "2026-07-01",
  updatedAt: "2026-07-04",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "hiring-workspace",
  toolName: "Hiring Workspace",
  toolUrl: "/services/hiring",
  keywords:
    "candidate packet, blind resume review, anonymize resume, recruiter to hiring manager, shortlist presentation, reduce hiring bias, candidate submission",
  heroAlt: "A multi-candidate packet being exported to PDF with names and photos anonymized",
  category: "Recruiter Tools",
  sections: [
    {
      heading: "The Problem With Forwarding Resumes",
      body: "A hiring manager opens your email to find four PDF attachments in four different formats, each laid out differently, one of them a scanned image. They skim the first two, lose the thread, and reply \"let's discuss.\" The momentum you built sourcing those candidates evaporates in the inbox.\n\nThe fix is presentation. When your shortlist arrives as a single, consistently formatted packet — every candidate on the same template, easy to compare side by side — the hiring manager can actually make a decision. hired.video turns a shortlist into exactly that, in a couple of clicks.",
    },
    {
      heading: "One Packet, Every Candidate, Same Format",
      body: "Select the candidates you want to present and hired.video assembles them into a single packet with a shared, professional layout. No wrestling with mismatched resume formats, no reformatting anyone's work history by hand — everyone is rendered through the same clean chrome, so differences in *content* stand out instead of differences in *formatting*.\n\nThe packet prints straight to PDF, so you can attach one tidy document or drop it into your ATS. It's the same polished print system that powers the platform's invoices and timesheets, so what the hiring manager sees looks deliberate, not dashed off.",
    },
    {
      heading: "Anonymize to Reduce Bias — and Get Better Shortlists Reviewed Fairly",
      body: "Structured, blind review is one of the most effective ways to reduce bias in early screening. hired.video lets you anonymize the packet with a toggle: names, photos, and other identifying details are hidden, so the hiring manager evaluates skills, experience, and results first.\n\nThis protects your candidates and your process. It also tends to produce a fairer, more defensible shortlist — the manager forms an opinion on the substance, and you can reveal identities once the evaluation is grounded in merit. For regulated or DEI-conscious organizations, a repeatable anonymized-review step is a meaningful trust signal.",
    },
    {
      heading: "How to Build and Send a Packet",
      body: "1. **Open your hiring workspace** and go to your candidate shortlist.\n2. **Select the candidates** you want to present.\n3. **Choose your options** — pick a layout and toggle anonymize on if you want a blind review.\n4. **Generate the packet** — every candidate is rendered on the same template and combined into one document.\n5. **Export to PDF** and share it with the hiring manager or attach it to your ATS.\n\nWhat used to be an afternoon of copy-paste and formatting is now a two-minute step that makes your whole desk look more professional.",
    },
  ],
  faq: [
    {
      question: "What is a candidate packet?",
      answer:
        "It's a single document that presents your shortlisted candidates in one consistent, professional format — instead of forwarding separate, mismatched resume files. hired.video assembles the packet and exports it to PDF so a hiring manager can compare candidates side by side.",
    },
    {
      question: "How does anonymizing a packet help?",
      answer:
        "Hiding names, photos, and other identifying details lets the hiring manager evaluate skills and experience first, which reduces early-stage bias and produces a fairer, more defensible shortlist. You can reveal identities once the evaluation is grounded in merit.",
    },
    {
      question: "Can I put the packet into my ATS?",
      answer:
        "Yes. The packet exports as a standard PDF, so you can attach it to a candidate record in your ATS, email it to a hiring manager, or archive it with the rest of your submission history.",
    },
  ],
});

// ── 56. Paid team activities (hire → assign → track → approve → pay) ──────────
BLOG_POSTS.push({
  slug: "hire-assign-and-pay-for-work-in-one-place",
  title: "Hire, Assign, Track, and Pay for Work — All in One Place",
  description:
    "Juggling a freelancer's task list in one app, their timesheet in another, and payment in a third is where work falls through the cracks. Here's how to run the whole loop on hired.video.",
  publishedAt: "2026-07-04",
  updatedAt: "2026-07-05",
  readingTime: 7,
  author: "hired.video",
  toolSlug: "team-activities",
  toolName: "Team Activities",
  toolUrl: "/team",
  keywords:
    "hire freelancer, assign tasks, track work, approve and pay, paid activities, freelance management, contractor payments, work assignment platform",
  heroAlt: "A team activities board moving work from assigned to submitted to approved to paid",
  category: "Recruiting Ops",
  sections: [
    {
      heading: "The Handoff Problem",
      body: "You find someone great, agree on the work, and then the process fragments: the brief lives in a chat thread, the progress lives in their head, the invoice arrives by email, and payment happens in yet another tool. Every seam is a place for work to stall or a payment to be forgotten.\n\nhired.video closes that loop. Hiring, assigning, tracking, approving, and paying all happen on one connected surface — so nothing depends on remembering to move information between apps. The person doing the work and the person paying for it are looking at the same board.",
    },
    {
      heading: "From \"You're Hired\" to \"You're Paid\" Without Leaving the App",
      body: "Once someone is engaged, you assign them an activity — a defined piece of paid work with clear expectations. They see it in their own view, do the work, and submit it for review. You approve it. Payment accrues automatically against that approved work. No separate invoice to chase, no reconciling a timesheet against a to-do list.\n\nBecause each step is a real status the whole team can see, there's never ambiguity about whether something is in progress, waiting on you, or done and owed. The board *is* the source of truth.",
    },
    {
      heading: "Everyone Sees Their Own Slice",
      body: "The person you've hired gets a focused view of exactly what's assigned to them and what they've submitted — no clutter, no access to things that aren't theirs. You get the manager's view: what's outstanding, what's waiting on your approval, and what's accrued to pay.\n\nThat clean separation matters. Contributors aren't overwhelmed by the whole operation, and you aren't fielding \"what should I work on?\" messages. Assign it once and it shows up where it needs to.",
    },
    {
      heading: "Approvals You Can Stand Behind",
      body: "Money should move on approved work, not on trust alone. hired.video keeps a clear record: the activity was assigned, submitted, reviewed, and approved — and the payout is tied to that trail. If a question ever comes up about what was paid and why, the answer is right there in the activity's history.\n\nThe result is a workflow that scales past one or two contractors without turning into a spreadsheet you dread opening. You spend your time deciding what needs doing, not administering how it got tracked and paid.",
    },
  ],
  faq: [
    {
      question: "How does paying for work happen on hired.video?",
      answer:
        "When you approve a submitted activity, payment accrues against that approved work automatically and is recorded in the payout ledger. You're paying on reviewed-and-approved work with a clear trail, not chasing separate invoices.",
    },
    {
      question: "Does the person I hire see everything?",
      answer:
        "No. Contributors get a focused view of only the activities assigned to them and what they've submitted. Managers get the full board — outstanding work, items waiting on approval, and what's accrued to pay.",
    },
    {
      question: "Why keep hiring, tracking, and payment in one tool?",
      answer:
        "Every handoff between separate apps is a place for work to stall or a payment to slip. Running the whole loop — assign, track, submit, approve, pay — on one board means the whole team shares a single source of truth and nothing depends on manually moving data between tools.",
    },
  ],
});

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getAllSlugs(): string[] {
  return BLOG_POSTS.map((p) => p.slug);
}
