#!/usr/bin/env node

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

// Routes to prerender with their SEO metadata
const ROUTES = [
  { path: '/', title: DEFAULTS.title, description: DEFAULTS.description },
  { path: '/about', title: 'About Us - MyVideoResu.me', description: 'Learn about our mission to revolutionize hiring with video resumes.' },
  { path: '/pricing', title: 'Pricing - MyVideoResu.me', description: 'Flexible pricing plans for job seekers and recruiters.' },
  { path: '/careers', title: 'Careers - MyVideoResu.me', description: 'Join our team and help shape the future of hiring.' },
  { path: '/contact', title: 'Contact Us - MyVideoResu.me', description: 'Get in touch with our team.' },
  { path: '/help', title: 'Help Center - MyVideoResu.me', description: 'Find answers to common questions.' },
  { path: '/privacy', title: 'Privacy Policy - MyVideoResu.me', description: 'Our commitment to protecting your privacy.' },
  { path: '/terms', title: 'Terms of Service - MyVideoResu.me', description: 'Terms and conditions for using MyVideoResu.me.' },
  { path: '/cookies', title: 'Cookie Policy - MyVideoResu.me', description: 'How we use cookies on our platform.' },
];

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function setOrInsertMeta(html, { title, description, ogTitle, ogDescription, canonical }) {
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
      canonical,
    });

    const outDir = r.path === '/' ? DIST_DIR : path.join(DIST_DIR, r.path.replace(/^\//, ''));
    ensureDirSync(outDir);
    const outFile = path.join(outDir, 'index.html');
    fs.writeFileSync(outFile, html, 'utf8');
    console.log(`[prerender] Wrote ${path.relative(DIST_DIR, outFile)}`);
  }

  console.log(`✅ Prerendered ${ROUTES.length} routes`);
}

main();

