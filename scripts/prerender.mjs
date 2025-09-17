/*
  Simple prerender step for marketing routes.
  - Reads the built dist/index.html
  - For each route, writes dist/<route>/index.html with route-specific head (title, description, og tags, canonical)
  - Keeps the SPA body and scripts intact
*/

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.resolve(__dirname, '../dist');
const ENTRY_HTML = path.join(DIST_DIR, 'index.html');

const CANONICAL_ORIGIN = 'https://myvideoresu.me';

// Default/fallback SEO (aligns with client/lib/seo.ts DEFAULT_SEO)
const DEFAULTS = {
  title: 'MyVideoResu.me - AI-Powered Video Resume Platform',
  description:
    'Create compelling video resumes and connect with top talent through AI-powered matching. The future of recruitment is here.',
  ogTitle: 'MyVideoResu.me - Video Resume Platform',
  ogDescription:
    'Create compelling video resumes and connect with top talent through AI-powered matching.',
};

// Define the marketing routes to prerender with specific metadata
// Only static routes go here; dynamic pages (e.g., job detail) will rely on runtime useSEO
const ROUTES = [
  { path: '/', title: DEFAULTS.title, description: DEFAULTS.description },
  { path: '/careers', title: 'Careers - Join Our Team | MyVideoResu.me', description: 'Join MyVideoResu.me and help revolutionize how people showcase their talents. Explore our open positions and become part of our innovative team.' },
  { path: '/about', title: 'About MyVideoResu.me', description: DEFAULTS.description },
  { path: '/pricing', title: 'Pricing | MyVideoResu.me', description: 'Transparent pricing for job seekers and companies using AI-powered video resumes.' },
  { path: '/tools', title: 'AI Tools for Resumes | MyVideoResu.me', description: 'Explore resume tools including AI scorer, optimizer, salary calculator, job match and more.' },
  { path: '/tools/ai-resume-scorer', title: 'AI Resume Scorer | MyVideoResu.me', description: 'Score your resume with AI and get actionable recommendations to improve it.' },
  { path: '/tools/resume-optimizer', title: 'Resume Optimizer | MyVideoResu.me', description: 'Optimize your resume content with AI to match job descriptions and pass screeners.' },
  { path: '/tools/salary-calculator', title: 'Salary Calculator | MyVideoResu.me', description: 'Estimate your salary range based on role, location, and skills.' },
  { path: '/tools/job-resume-match', title: 'Job–Resume Match | MyVideoResu.me', description: 'Match your resume to job postings and see fit scores and gaps.' },
  { path: '/tools/sentiment-analysis', title: 'Resume Sentiment Analysis | MyVideoResu.me', description: 'Analyze tone and sentiment of your resume or job posting content.' },
  { path: '/privacy-policy', title: 'Privacy Policy | MyVideoResu.me', description: 'Learn how MyVideoResu.me collects, uses, and protects your data.' },
  { path: '/terms-of-service', title: 'Terms of Service | MyVideoResu.me', description: 'Read the terms and conditions for using MyVideoResu.me.' },
  { path: '/jobs', title: 'Jobs | MyVideoResu.me', description: 'Browse open roles and apply with your video resume.' },
];

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function setOrInsertMeta(html, { title, description, ogTitle, ogDescription, canonical }) {
  let out = html;

  // Title
  out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);

  // Meta description
  if (out.match(/<meta[^>]*name=["']description["'][^>]*>/i)) {
    out = out.replace(/<meta([^>]*?)name=["']description["']([^>]*?)>/i, (_m, pre, post) => {
      // replace content attribute or append
      if (/content=/i.test(pre + post)) {
        return `<meta${pre.replace(/content=["'][\s\S]*?["']/i, '')} name="description" content="${escapeHtml(description)}"${post.replace(/content=["'][\s\S]*?["']/i, '')}>`;
      }
      return `<meta${pre} name="description" content="${escapeHtml(description)}"${post}>`;
    });
  } else {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n    <meta name="description" content="${escapeHtml(description)}" />`);
  }

  // Open Graph title
  out = upsertMeta(out, { attr: 'property', name: 'og:title', content: ogTitle || title });
  // Open Graph description
  out = upsertMeta(out, { attr: 'property', name: 'og:description', content: ogDescription || description });
  // Open Graph type (website by default)
  out = upsertMeta(out, { attr: 'property', name: 'og:type', content: 'website' });

  // Canonical link
  if (out.match(/<link\s+rel=["']canonical["'][^>]*>/i)) {
    out = out.replace(/<link\s+rel=["']canonical["'][^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
  } else {
    // inject before favicon if possible, else into head
    if (out.match(/<link[^>]*rel=["']icon["'][^>]*>/i)) {
      out = out.replace(/<link([^>]*?)rel=["']icon["']([\s\S]*?)>/i, `<link rel="canonical" href="${canonical}" />\n    <link$1rel="icon"$2>`);
    } else {
      out = out.replace(/<head[^>]*>/i, (m) => `${m}\n    <link rel="canonical" href="${canonical}" />`);
    }
  }

  return out;
}

function upsertMeta(html, { attr, name, content }) {
  const re = new RegExp(`<meta[^>]*${attr}=["']${escapeRegExp(name)}["'][^>]*>`, 'i');
  if (re.test(html)) {
    return html.replace(re, `<meta ${attr}="${name}" content="${escapeHtml(content)}" />`);
  }
  return html.replace(/<head[^>]*>/i, (m) => `${m}\n    <meta ${attr}="${name}" content="${escapeHtml(content)}" />`);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      canonical,
    });

    const outDir = r.path === '/' ? DIST_DIR : path.join(DIST_DIR, r.path.replace(/^\//, ''));
    ensureDirSync(outDir);
    const outFile = path.join(outDir, 'index.html');
    fs.writeFileSync(outFile, html, 'utf8');
    console.log(`[prerender] Wrote ${path.relative(DIST_DIR, outFile)}`);
  }

  console.log(`[prerender] Completed prerender for ${ROUTES.length} routes.`);
}

main();

