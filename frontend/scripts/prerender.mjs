#!/usr/bin/env node

/*
  Pre-render step for marketing & SEO routes.
  - Reads the built dist/index.html
  - For each route, writes dist/<route>/index.html with route-specific
    <title>, <meta description>, OG tags, Twitter Card tags, and canonical URL
  - Keeps the SPA body and scripts intact (full client-side hydration)

  Keep ROUTES in sync with frontend/lib/seo.ts PAGE_SEO whenever new
  indexable pages are added.
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../dist');
const ENTRY_HTML = path.join(DIST_DIR, 'index.html');

const CANONICAL_ORIGIN = 'https://hired.video';
const OG_IMAGE = `${CANONICAL_ORIGIN}/og-image.svg`;
const TWITTER_SITE = '@hired_video';

// Default/fallback SEO (aligned with frontend/lib/seo.ts DEFAULT_SEO)
const DEFAULTS = {
  title: 'AI Video Resumes, Resume Builder & AI Job Search Platform — hired.video',
  description:
    'hired.video turns your resume into an AI-generated video resume in 60 seconds. Build, score, and tailor resumes for every job — and connect with recruiters through AI-powered matching.',
  ogTitle: 'AI Video Resumes & AI Job Search — hired.video',
  ogDescription:
    'Create an AI video resume in 60 seconds, tailor your resume for every job, and get matched with recruiters who are actively hiring.',
};

// ---------------------------------------------------------------------------
// Every indexable route. noindex pages (login, account, admin, settings) are
// intentionally excluded — they already carry robots: noindex,nofollow via
// the client-side useSEO hook.
// ---------------------------------------------------------------------------
const ROUTES = [
  // --- Core marketing ---
  { path: '/' },
  { path: '/about', title: 'About: Our Mission & Team — hired.video', description: 'Learn about hired.video\'s mission to revolutionize recruitment through AI-powered video resumes and talent matching.' },
  { path: '/pricing', title: 'Pricing: Plans for Job Seekers, Recruiters & Teams — hired.video', description: 'Start free, upgrade when you\'re ready. Transparent monthly and annual plans for job seekers, recruiters, and employers — cancel anytime.' },
  { path: '/careers', title: 'Careers — hired.video', description: 'Join our team and help reshape how professionals showcase talent. Explore open roles and grow your career with us.' },
  { path: '/contact', title: 'Contact Us — hired.video', description: 'Get in touch with hired.video support. We\'re here to help you succeed in your career journey.' },
  { path: '/help', title: 'Help & Support — hired.video', description: 'Find answers, browse guides, and contact support to get the most from hired.video.' },
  { path: '/for-recruiters', title: 'For Recruiters: AI Candidate Sourcing, Screening & Video Resumes — hired.video', description: 'Source candidates from LinkedIn and Indeed, screen applicants with AI match scoring, and evaluate talent 3× faster with video resumes.' },

  // --- Products ---
  { path: '/studio', title: 'AI Video Resume Studio — hired.video', description: 'Generate a polished AI video resume in 60 seconds. Paste your resume, our AI writes the script, and you export a 1080p video — no camera, no editing required.' },
  { path: '/resumes', title: 'AI Video Resume Maker & Resume Builder — hired.video', description: 'Create a video resume in 60 seconds with AI, or build a traditional ATS-friendly resume. Track views, tailor variations per job, and share with recruiters.' },
  { path: '/jobs', title: 'Job Search: AI Job Matching — hired.video', description: 'Find your dream job with AI-powered matching. Browse thousands of opportunities and apply with your video resume.' },
  { path: '/companies', title: 'Companies Hiring — hired.video', description: 'Discover top companies hiring through video resumes. Connect with innovative employers and explore career opportunities.' },
  { path: '/people', title: 'Professional Network — hired.video', description: 'Connect with professionals, recruiters, and industry leaders. Build your network and advance your career.' },
  { path: '/people/scorecards', title: 'Scorecards, Interview Kits, Calibration & Bias Linter — Structured Hiring on hired.video', description: 'Run Greenhouse-grade structured interviews: reusable scorecards, interview kits, calibration sessions, blind review, bias linter, take-home assignments, competency framework, and AI question generation.' },

  // --- Lead-gen & engagement ---
  { path: '/tools/resume-roast', title: 'Free AI Resume Roast: Brutally Honest Feedback — hired.video', description: 'Upload your resume and get brutally honest, instant AI feedback on what\'s working, what\'s weak, and exactly how to fix it. 100% free.' },
  { path: '/interview', title: 'Free AI Interview Practice — hired.video', description: 'Practice live interviews with an AI interviewer tuned to your role. Get instant feedback on your answers, tone, and pacing. Completely free.' },
  { path: '/post-a-job', title: 'Post a Job for Free — hired.video', description: 'Post your open role and reach candidates with AI-generated video intros. Google for Jobs indexed, structured-data ready, and free to start.' },
  { path: '/affiliate-program', title: 'Affiliate Program: Earn 25% — hired.video', description: 'Earn 25% commission on every first-month subscription you refer. Promote AI video resumes and modern career tools to your audience.' },
  { path: '/chrome-extension', title: 'Chrome Extensions for Job Seekers & Recruiters — hired.video', description: 'Track jobs, score resumes, and source candidates on LinkedIn, Indeed, Glassdoor and 16+ job boards — without leaving the page.' },
  { path: '/signup', title: 'Sign Up Free: AI Video Resumes & Career Tools — hired.video', description: 'Join hired.video today and create your professional video resume. Connect with top employers and advance your career.' },

  // --- AI Tools + Learning (high-value SEO pages) ---
  { path: '/tools', title: 'Tools & Learning: AI Career Tools + Built-in SCORM Learning Library — hired.video', description: 'Free AI career tools — resume scorer, ATS optimizer, salary calculator, interview practice — plus a built-in learning content library (AI, RAG, prompt engineering, must-have skills) with SCORM 1.2 + xAPI + verifiable certificates. No separate license required.' },
  { path: '/learning', title: 'Built-in Learning Content Library — AI, RAG, Must-Have Skills — hired.video', description: 'Platform-seeded SCORM 1.2 courses on AI fundamentals, Retrieval-Augmented Generation, prompt engineering, AI-era must-have skills, and the Claude API. Bundled with every plan — LinkedIn Learning is a separate ~$379/seat/yr SKU; ours is included.' },
  { path: '/courses/hired-video-learning/ai-fundamentals-for-job-seekers', title: 'AI Fundamentals for Job Seekers — hired.video Learning', description: 'Plain-English primer on what AI is, how modern LLMs work, and where they show up in the hiring pipeline. Free SCORM-tracked course with verifiable certificate.' },
  { path: '/courses/hired-video-learning/retrieval-augmented-generation-rag', title: 'Retrieval-Augmented Generation (RAG) — hired.video Learning', description: 'How RAG closes the LLM knowledge gap: chunking, embeddings, vector search, retrieval pipelines, and the failure modes you\'ll meet in production. Free SCORM-tracked course.' },
  { path: '/courses/hired-video-learning/prompt-engineering-essentials', title: 'Prompt Engineering Essentials — hired.video Learning', description: 'The patterns that consistently make LLM output better: roles, examples, constraints, chain-of-thought, and JSON-mode output contracts. Free SCORM-tracked course.' },
  { path: '/courses/hired-video-learning/ai-era-must-have-skills', title: 'AI-Era Must-Have Skills — hired.video Learning', description: 'Five durable skills that compound in an AI-saturated workplace: critical evaluation, systems thinking, prompt fluency, data literacy, and human-in-the-loop judgment.' },
  { path: '/courses/hired-video-learning/building-with-the-claude-api', title: 'Building with the Claude API — hired.video Learning', description: 'From hello-world to production patterns — auth, tool use, prompt caching, structured output, and the trade-offs across Opus / Sonnet / Haiku.' },
  { path: '/tools/ai-resume-scorer', title: 'AI Resume Scorer: Free ATS Resume Grader — hired.video', description: 'Grade your resume in seconds with our free AI resume scorer. Get an ATS-compatibility score, keyword match, and targeted recommendations.' },
  { path: '/tools/resume-optimizer', title: 'Resume Optimizer: AI ATS Keyword Matcher — hired.video', description: 'Optimize your resume for ATS and any target job in seconds. AI mirrors job-description keywords, suggests rewrites, and boosts your match rate.' },
  { path: '/tools/salary-calculator', title: 'Salary Calculator: AI Compensation Benchmarks — hired.video', description: 'Know your market rate. AI salary calculator estimates fair compensation by title, experience, location, and industry — with percentile ranges.' },
  { path: '/tools/job-resume-match', title: 'Job-Resume Match: AI Fit Score for Any Role — hired.video', description: 'See how well your resume fits any job in seconds. AI scores alignment, highlights missing skills, and tells you what to add before you apply.' },
  { path: '/tools/summarize-resume', title: 'AI Resume Summarizer: Professional Summaries in Seconds — hired.video', description: 'Turn your resume into a sharp, hireable professional summary with AI. Perfect for LinkedIn, cover letters, and profile bios.' },
  { path: '/tools/sentiment-analysis', title: 'Resume Sentiment Analysis: AI Tone Checker — hired.video', description: 'Check the tone and confidence of your resume with AI. Flags passive language, weak phrasing, and opportunities to sound more assertive.' },
  { path: '/tools/value-proposition', title: 'AI Value Proposition Builder: Elevator Pitch Generator — hired.video', description: 'Build a compelling value proposition tailored to your target role. AI combines your resume, the job, and the company\'s mission into a personal pitch.' },
  { path: '/tools/pdf-to-json', title: 'Resume PDF to JSON Converter: AI Resume Parser — hired.video', description: 'Convert any resume PDF to structured JSON. AI extracts basics, work history, skills, and education — ideal for builders, ATSes, and data pipelines.' },
  { path: '/tools/resume-consolidator', title: 'Resume Consolidator: Merge Multiple Resumes — hired.video', description: 'Have three resumes? Merge them into one master resume with AI. Dedupes work history, consolidates skills, and preserves every highlight.' },
  { path: '/tools/resume-tailor', title: 'Resume Tailor: AI Custom Resume for Every Job — hired.video', description: 'Tailor your resume to any job in seconds. AI rewrites bullets, rearranges sections, and injects the right keywords — all while keeping your voice.' },
  { path: '/tools/auto-fill', title: 'Application Autofill: AI Job Application Form Filler — hired.video', description: 'Fill any job application form in seconds. AI generates answers from your profile and resume for Greenhouse, Lever, Workday, Ashby, and any custom application form.' },

  // --- Blog & Guides ---
  { path: '/blog', title: 'Career Guides & AI Tool Tutorials — hired.video', description: 'Actionable guides to help you score, optimize, and tailor your resume, land more interviews, and negotiate the salary you deserve.' },
  { path: '/blog/how-to-score-your-resume-for-ats', title: 'How to Score Your Resume for ATS Compatibility in 2026 — hired.video', description: 'Learn how Applicant Tracking Systems score resumes, what makes a high ATS score, and how to use an AI resume scorer to grade your resume before you apply.' },
  { path: '/blog/optimize-your-resume-for-any-job', title: 'How to Optimize Your Resume for Any Job Description with AI — hired.video', description: 'A step-by-step guide to resume optimization: how to match keywords, rewrite bullets, and beat ATS filters using AI tools.' },
  { path: '/blog/how-to-research-your-market-salary', title: 'How to Research Your Market Salary and Negotiate with Confidence — hired.video', description: 'A data-driven guide to salary research: how to find your market rate, understand percentile bands, and negotiate compensation.' },
  { path: '/blog/how-to-match-your-resume-to-any-job', title: 'How to Match Your Resume to Any Job Posting (AI Fit Score Guide) — hired.video', description: 'Learn how to measure the fit between your resume and a job description, identify skill gaps, and close them before you apply.' },
  { path: '/blog/complete-guide-to-video-resumes', title: 'The Complete Guide to Video Resumes in 2026 — hired.video', description: 'Everything you need to know about video resumes: what they are, why employers love them, how to create one in 60 seconds with AI.' },
  { path: '/blog/tailor-your-resume-for-every-application', title: 'How to Tailor Your Resume for Every Job Application — hired.video', description: 'Why tailored resumes get 2x more interviews, and how to customize yours in under 2 minutes per job using AI.' },
  { path: '/blog/write-a-confident-resume-tone-guide', title: 'How to Write a Confident, Action-Driven Resume (Tone Guide) — hired.video', description: 'Your resume\'s tone matters as much as its content. Learn how AI sentiment analysis reveals weak phrasing and passive language.' },
  { path: '/blog/how-to-write-your-personal-value-proposition', title: 'How to Write a Personal Value Proposition That Wins Interviews — hired.video', description: 'A value proposition is your 30-second answer to "Why should we hire you?" Learn to craft one that combines your resume, the job, and the company\'s mission.' },
  { path: '/blog/merge-multiple-resumes-into-one', title: 'How to Merge Multiple Resumes Into One Master Resume — hired.video', description: 'Have 3 resumes for 3 different roles? Learn how to consolidate them into a single master resume using AI deduplication.' },
  { path: '/blog/write-a-professional-summary-that-gets-noticed', title: 'How to Write a Professional Summary That Gets Noticed — hired.video', description: 'Your professional summary is the first thing recruiters read. Learn how to write one that hooks in 5 seconds.' },
  { path: '/blog/parse-resume-pdf-to-structured-json', title: 'How to Parse a Resume PDF Into Structured JSON (Developer Guide) — hired.video', description: 'A technical guide to resume parsing: how to extract structured data from PDF resumes using AI, with schema examples.' },
  { path: '/blog/how-to-prepare-for-any-job-interview', title: 'How to Prepare for Any Job Interview with AI Practice — hired.video', description: 'A comprehensive guide to interview preparation: common questions, the STAR method, AI mock interviews, and building confidence.' },

  // --- AI-resilient sector surfaces (gap #1165). Sector slugs MUST stay
  //     in sync with shared/sectors.ts SECTORS. The duplication is tracked
  //     in the gap register as a consolidate-marketing-route-SSoT follow-up. ---
  { path: '/sectors', title: 'AI-Resilient Sectors: Browse Careers AI Can\'t Replace — hired.video', description: 'Healthcare, skilled trades, law enforcement, beauty, government, and more — sectors built around physical work, licensure, and in-person judgement. Browse jobs, pivot guides, and resume templates by sector.' },
  { path: '/sectors/healthcare', title: 'Healthcare & Medical Careers: AI-Resilient Jobs — hired.video', description: 'Patient-facing care, licensed clinicians, EMTs, nursing, surgical tech, and allied health roles. Browse jobs, see licensure requirements, and pivot into healthcare from tech.' },
  { path: '/sectors/legal', title: 'Legal Careers: Bar-Admitted Roles & Legal Adjacent — hired.video', description: 'Litigators, court reporters, mediators, compliance officers, and title agents. Honest read on which legal roles AI is replacing vs. which remain durable.' },
  { path: '/sectors/government', title: 'Government & Public Service Careers — hired.video', description: 'Federal, state, and municipal roles — inspectors, public works, cleared cyber, postal carriers, park rangers. Clearance roles remain in high demand.' },
  { path: '/sectors/law_enforcement', title: 'Law Enforcement Careers: Police, Sheriff, Federal Agents — hired.video', description: 'Sworn officer paths, federal agent roles (FBI/DEA/ATF), corrections, dispatch, and specialty units. POST certification + academy pathways.' },
  { path: '/sectors/security', title: 'Security & Protective Services Careers — hired.video', description: 'Armed and unarmed guards, executive protection, event security, armored transport, GSOC operators. State licensing + firearms endorsement pathways.' },
  { path: '/sectors/skilled_trades', title: 'Skilled Trades Careers: Electrician, Plumber, HVAC, Welding — hired.video', description: 'Journeyman and master license pathways for the trades. Union and non-union routes, apprenticeship programs, and the strongest AI-resilient category in the labor market.' },
  { path: '/sectors/beauty_personal_care', title: 'Beauty & Personal Care Careers: Cosmetology, Barbering, Massage — hired.video', description: 'Licensed cosmetologists, barbers, estheticians, nail technicians, massage therapists, tattoo artists. Booth-rental economics + small-business pathways.' },
  { path: '/sectors/gig_work', title: 'Gig & On-Demand Work: Rideshare, Delivery, TaskRabbit — hired.video', description: 'Platform-mediated physical work — rideshare, delivery, mobile services. Best fit for income bridging during pivots rather than a 20-year career.' },
  { path: '/sectors/politics_campaigns', title: 'Political Campaign & Legislative Staff Careers — hired.video', description: 'Field organizers, comms directors, legislative aides, chiefs of staff, lobbyists. Cycle-driven careers with concrete entry paths from tech and analytics backgrounds.' },
  { path: '/sectors/politics_civic', title: 'Running for Office: First-Time Candidate Guide — hired.video', description: 'Civic education for first-time candidates — school board, city council, state legislature. Filing rules, budget literacy, and candidate video tools.' },
  { path: '/sectors/tech', title: 'Technology Careers: Software, Data, IT — hired.video', description: 'Tech roles browsed on hired.video. Included so pivot-from-tech stories have a "from" side — many tech roles are AI-exposed today.' },
  { path: '/pivot-explorer', title: 'AI-Resilient Career Pivot Explorer — hired.video', description: 'Map your current skills against AI-resilient sectors. Ranks healthcare, trades, government, law enforcement, and more by transferable-skill match. Auto-populate from your resume.' },
  { path: '/resume-templates', title: 'Resume Templates by Sector: Medical, Trade, Law Enforcement & More — hired.video', description: 'Pick a resume template tuned for your sector. Credential-forward for licensed roles, work-product-forward for trades and beauty, story-led for portfolio careers.' },
  { path: '/articles', title: 'Career Articles by Sector & Audience — hired.video', description: 'Sector-specific career guides for job seekers and recruiters. Filter by sector (healthcare, trades, legal, etc.) and audience (job seekers, recruiters, pivoters).' },

  // --- Legal ---
  { path: '/privacy-policy', title: 'Privacy Policy — hired.video', description: 'Learn how hired.video protects your data and respects your privacy. Review our policies and your rights.' },
  { path: '/terms-of-service', title: 'Terms of Service — hired.video', description: 'Understand your rights and responsibilities when using hired.video. Review our platform terms and conditions.' },
];

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Per-route social card image. Every indexable route gets its OWN branded
// share card (served by GET /api/og/page) instead of all of them falling
// back to the single static og-image.svg — so a link shared in iMessage /
// WhatsApp / Slack previews with the page's actual headline. Derived purely
// from the title + description the route already carries (no second source
// of truth). The home route keeps the hand-designed og-image.svg hero.
// ---------------------------------------------------------------------------

/** Short category label rendered as the card's eyebrow tag. */
function eyebrowFor(p) {
  if (p === '/') return 'AI Video Resumes';
  if (p.startsWith('/tools')) return 'Free AI Tool';
  if (p.startsWith('/blog')) return 'Career Guide';
  if (p.startsWith('/sectors')) return 'AI-Resilient Careers';
  if (p.startsWith('/courses') || p.startsWith('/learning')) return 'Learning Library';
  if (p.startsWith('/guides')) return 'Guide';
  if (p === '/privacy-policy' || p === '/terms-of-service') return 'Legal';
  if (['/for-recruiters', '/post-a-job', '/people/scorecards', '/for-agencies'].includes(p)) return 'For Recruiters & Employers';
  if (p.startsWith('/resume-templates')) return 'Resume Templates';
  if (p === '/interview') return 'Interview Practice';
  if (p === '/pivot-explorer') return 'Career Pivot';
  if (p === '/affiliate-program') return 'Affiliate Program';
  if (p === '/chrome-extension') return 'Chrome Extensions';
  if (['/resumes', '/studio'].includes(p)) return 'AI Studio';
  return 'hired.video';
}

/** Drop the trailing brand suffix ("… — hired.video" / "… · hired.video")
 *  so the card headline reads as the page's own title. */
function cardTitle(title) {
  return title.replace(/\s*[—·-]\s*hired\.video\s*$/i, '').trim() || title;
}

/** Trim a description down to a one-line card subtitle at a word boundary. */
function cardSubtitle(desc) {
  if (!desc) return '';
  let s = desc.trim();
  if (s.length <= 110) return s;
  s = s.slice(0, 110);
  const i = s.lastIndexOf(' ');
  if (i > 60) s = s.slice(0, i);
  return s.replace(/[.,;:\s]+$/, '') + '…';
}

/** Full og:image URL for a route — its own generated card, or the static
 *  hero for the home page. */
function ogImageFor(routePath, title, description) {
  if (routePath === '/') return OG_IMAGE;
  const params = new URLSearchParams({
    title: cardTitle(title),
    eyebrow: eyebrowFor(routePath),
    subtitle: cardSubtitle(description),
  });
  return `${CANONICAL_ORIGIN}/api/og/page?${params.toString()}`;
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function setOrInsertMeta(html, { title, description, ogTitle, ogDescription, ogImage, canonical }) {
  let out = html;

  // Title
  out = out.replace(/<title>[^<]*<\/title>/i, `<title>${escapeHtml(title)}</title>`);

  // Meta description
  if (out.match(/<meta[^>]*name=["']description["'][^>]*>/i)) {
    out = out.replace(/<meta([^>]*?)name=["']description["']([^>]*?)>/i, (_m, pre, post) => {
      if (/content=/i.test(pre + post)) {
        return `<meta${pre.replace(/content=["'][^"']*["']/i, '')} name="description" content="${escapeHtml(description)}"${post.replace(/content=["'][^"']*["']/i, '')}>`;
      }
      return `<meta${pre} name="description" content="${escapeHtml(description)}"${post}>`;
    });
  } else {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n    <meta name="description" content="${escapeHtml(description)}" />`);
  }

  // OG title
  out = out.replace(/<meta([^>]*?)property=["']og:title["']([^>]*?)>/i, `<meta property="og:title" content="${escapeHtml(ogTitle)}" />`);

  // OG description
  out = out.replace(/<meta([^>]*?)property=["']og:description["']([^>]*?)>/i, `<meta property="og:description" content="${escapeHtml(ogDescription)}" />`);

  // OG image
  if (out.match(/<meta[^>]*property=["']og:image["'][^>]*>/i)) {
    out = out.replace(/<meta([^>]*?)property=["']og:image["']([^>]*?)>/i, `<meta property="og:image" content="${escapeHtml(ogImage)}" />`);
  }

  // Twitter image (kept in lockstep with og:image so the X / iMessage card
  // shows the same per-page art).
  if (out.match(/<meta[^>]*name=["']twitter:image["'][^>]*>/i)) {
    out = out.replace(/<meta([^>]*?)name=["']twitter:image["']([^>]*?)>/i, `<meta name="twitter:image" content="${escapeHtml(ogImage)}" />`);
  }

  // OG URL
  if (out.match(/<meta[^>]*property=["']og:url["'][^>]*>/i)) {
    out = out.replace(/<meta([^>]*?)property=["']og:url["']([^>]*?)>/i, `<meta property="og:url" content="${escapeHtml(canonical)}" />`);
  }

  // Twitter tags
  if (out.match(/<meta[^>]*name=["']twitter:title["'][^>]*>/i)) {
    out = out.replace(/<meta([^>]*?)name=["']twitter:title["']([^>]*?)>/i, `<meta name="twitter:title" content="${escapeHtml(ogTitle)}" />`);
  }
  if (out.match(/<meta[^>]*name=["']twitter:description["'][^>]*>/i)) {
    out = out.replace(/<meta([^>]*?)name=["']twitter:description["']([^>]*?)>/i, `<meta name="twitter:description" content="${escapeHtml(ogDescription)}" />`);
  }

  // Canonical
  if (out.match(/<link[^>]*rel=["']canonical["'][^>]*>/i)) {
    out = out.replace(/<link([^>]*?)rel=["']canonical["']([^>]*?)>/i, `<link rel="canonical" href="${escapeHtml(canonical)}" />`);
  } else {
    out = out.replace(/<\/head>/i, `  <link rel="canonical" href="${escapeHtml(canonical)}" />\n</head>`);
  }

  return out;
}

function main() {
  if (!fs.existsSync(ENTRY_HTML)) {
    console.error(`[prerender] Missing ${ENTRY_HTML}. Run vite build first.`);
    process.exit(1);
  }

  const baseHtml = fs.readFileSync(ENTRY_HTML, 'utf8');

  for (const r of ROUTES) {
    const canonical = r.path === '/' ? `${CANONICAL_ORIGIN}/` : `${CANONICAL_ORIGIN}${r.path}`;
    const title = r.title || DEFAULTS.title;
    const description = r.description || DEFAULTS.description;
    const html = setOrInsertMeta(baseHtml, {
      title,
      description,
      ogTitle: r.ogTitle || title,
      ogDescription: r.ogDescription || description,
      ogImage: r.ogImage || ogImageFor(r.path, r.ogTitle || title, r.ogDescription || description),
      canonical,
      twitterSite: TWITTER_SITE,
    });

    const outDir = r.path === '/' ? DIST_DIR : path.join(DIST_DIR, r.path.replace(/^\//, ''));
    ensureDirSync(outDir);
    const outFile = path.join(outDir, 'index.html');
    fs.writeFileSync(outFile, html, 'utf8');
    console.log(`[prerender] Wrote ${path.relative(DIST_DIR, outFile)}`);
  }

  console.log(`✅ Pre-rendered ${ROUTES.length} routes`);
}

main();
