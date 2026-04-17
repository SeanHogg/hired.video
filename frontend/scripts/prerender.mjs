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
  title: 'hired.video — AI Video Resumes, Resume Builder & AI Job Search Platform',
  description:
    'hired.video turns your resume into an AI-generated video resume in 60 seconds. Build, score, and tailor resumes for every job — and connect with recruiters through AI-powered matching.',
  ogTitle: 'hired.video — AI Video Resumes & AI Job Search',
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
  { path: '/about', title: 'About Us — hired.video', description: 'Learn about hired.video\'s mission to revolutionize recruitment through AI-powered video resumes and talent matching.' },
  { path: '/pricing', title: 'Pricing — hired.video Plans for Job Seekers, Recruiters & Teams', description: 'Start free, upgrade when you\'re ready. Transparent monthly and annual plans for job seekers, recruiters, and employers — cancel anytime.' },
  { path: '/careers', title: 'Careers at hired.video', description: 'Join our team and help reshape how professionals showcase talent. Explore open roles and grow your career with us.' },
  { path: '/contact', title: 'Contact Us — hired.video', description: 'Get in touch with hired.video support. We\'re here to help you succeed in your career journey.' },
  { path: '/help', title: 'Help & Support — hired.video', description: 'Find answers, browse guides, and contact support to get the most from hired.video.' },
  { path: '/for-recruiters', title: 'For Recruiters — AI Candidate Sourcing, Screening & Video Resumes | hired.video', description: 'Source candidates from LinkedIn and Indeed, screen applicants with AI match scoring, and evaluate talent 3× faster with video resumes.' },

  // --- Products ---
  { path: '/studio', title: 'AI Video Resume Studio — hired.video', description: 'Generate a polished AI video resume in 60 seconds. Paste your resume, our AI writes the script, and you export a 1080p video — no camera, no editing required.' },
  { path: '/resumes', title: 'AI Video Resume Maker & Resume Builder — hired.video', description: 'Create a video resume in 60 seconds with AI, or build a traditional ATS-friendly resume. Track views, tailor variations per job, and share with recruiters.' },
  { path: '/jobs', title: 'Job Search — hired.video', description: 'Find your dream job with AI-powered matching. Browse thousands of opportunities and apply with your video resume.' },
  { path: '/companies', title: 'Companies — hired.video', description: 'Discover top companies hiring through video resumes. Connect with innovative employers and explore career opportunities.' },
  { path: '/people', title: 'Professional Network — hired.video', description: 'Connect with professionals, recruiters, and industry leaders. Build your network and advance your career.' },

  // --- Lead-gen & engagement ---
  { path: '/resume-roast', title: 'Free AI Resume Roast — Brutally Honest Resume Feedback', description: 'Upload your resume and get brutally honest, instant AI feedback on what\'s working, what\'s weak, and exactly how to fix it. 100% free.' },
  { path: '/interview', title: 'Free AI Interview Practice — hired.video', description: 'Practice live interviews with an AI interviewer tuned to your role. Get instant feedback on your answers, tone, and pacing. Completely free.' },
  { path: '/post-a-job', title: 'Post a Job for Free — hired.video', description: 'Post your open role and reach candidates with AI-generated video intros. Google for Jobs indexed, structured-data ready, and free to start.' },
  { path: '/affiliate-program', title: 'Affiliate Program — Earn 25% with hired.video', description: 'Earn 25% commission on every first-month subscription you refer. Promote AI video resumes and modern career tools to your audience.' },
  { path: '/chrome-extension', title: 'Chrome Extensions for Job Seekers & Recruiters — hired.video', description: 'Track jobs, score resumes, and source candidates on LinkedIn, Indeed, Glassdoor and 16+ job boards — without leaving the page.' },
  { path: '/signup', title: 'Sign Up — hired.video', description: 'Join hired.video today and create your professional video resume. Connect with top employers and advance your career.' },

  // --- AI Tools (high-value SEO pages) ---
  { path: '/tools', title: 'Free AI Career Tools — Resume Scorer, Optimizer, Value Prop | hired.video', description: 'Free AI career tools: resume scorer, ATS optimizer, salary calculator, job-resume match, sentiment analysis, and value proposition builder. No signup to try.' },
  { path: '/tools/ai-resume-scorer', title: 'AI Resume Scorer — Free ATS Resume Grader | hired.video', description: 'Grade your resume in seconds with our free AI resume scorer. Get an ATS-compatibility score, keyword match, and targeted recommendations.' },
  { path: '/tools/resume-optimizer', title: 'Resume Optimizer — AI ATS Keyword Matcher | hired.video', description: 'Optimize your resume for ATS and any target job in seconds. AI mirrors job-description keywords, suggests rewrites, and boosts your match rate.' },
  { path: '/tools/salary-calculator', title: 'Salary Calculator — AI Compensation Benchmarks | hired.video', description: 'Know your market rate. AI salary calculator estimates fair compensation by title, experience, location, and industry — with percentile ranges.' },
  { path: '/tools/job-resume-match', title: 'Job-Resume Match — AI Fit Score for Any Role | hired.video', description: 'See how well your resume fits any job in seconds. AI scores alignment, highlights missing skills, and tells you what to add before you apply.' },
  { path: '/tools/summarize-resume', title: 'AI Resume Summarizer — Professional Summaries in Seconds | hired.video', description: 'Turn your resume into a sharp, hireable professional summary with AI. Perfect for LinkedIn, cover letters, and profile bios.' },
  { path: '/tools/sentiment-analysis', title: 'Resume Sentiment Analysis — AI Tone Checker | hired.video', description: 'Check the tone and confidence of your resume with AI. Flags passive language, weak phrasing, and opportunities to sound more assertive.' },
  { path: '/tools/value-proposition', title: 'AI Value Proposition Builder — Elevator Pitch Generator | hired.video', description: 'Build a compelling value proposition tailored to your target role. AI combines your resume, the job, and the company\'s mission into a personal pitch.' },
  { path: '/tools/pdf-to-json', title: 'Resume PDF to JSON Converter — AI Resume Parser | hired.video', description: 'Convert any resume PDF to structured JSON. AI extracts basics, work history, skills, and education — ideal for builders, ATSes, and data pipelines.' },
  { path: '/tools/resume-consolidator', title: 'Resume Consolidator — Merge Multiple Resumes | hired.video', description: 'Have three resumes? Merge them into one master resume with AI. Dedupes work history, consolidates skills, and preserves every highlight.' },
  { path: '/tools/resume-tailor', title: 'Resume Tailor — AI Custom Resume for Every Job | hired.video', description: 'Tailor your resume to any job in seconds. AI rewrites bullets, rearranges sections, and injects the right keywords — all while keeping your voice.' },

  // --- Legal ---
  { path: '/privacy-policy', title: 'Privacy Policy — hired.video', description: 'Learn how hired.video protects your data and respects your privacy. Review our policies and your rights.' },
  { path: '/terms-of-service', title: 'Terms of Service — hired.video', description: 'Understand your rights and responsibilities when using hired.video. Review our platform terms and conditions.' },
];

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function setOrInsertMeta(html, { title, description, ogTitle, ogDescription, ogImage, canonical, twitterSite }) {
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
      ogImage: OG_IMAGE,
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
