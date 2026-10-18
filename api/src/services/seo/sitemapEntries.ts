/**
 * Sitemap building blocks (#SEO): the site origin, the static page list, and
 * the `<url>` / `<video:video>` entry renderers used by services/seo/sitemap.ts.
 */
import { publicVideoPath } from "../../../../shared/public-paths.js";

export const SITEMAP_BASE = process.env.APP_URL ?? "https://hired.video";
const BASE = SITEMAP_BASE;

export function url(loc: string, lastmod?: string, changefreq = "weekly", priority = "0.7") {
  return `  <url>
    <loc>${BASE}${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Video-sitemap entry (Google video indexing). `thumbnailLoc` MUST be a
 * crawlable raster/SVG image — we point it at the worker's own
 * `/api/og/v/:id` card endpoint (302s to a baked thumbnail when one exists),
 * which is why it uses the request origin (the worker) rather than BASE (the
 * SPA host, which doesn't proxy /api). Directly addresses the "videos can't
 * be indexed — missing thumbnail" report by handing Google the thumbnail.
 */
export function videoUrlEntry(opts: {
  id: string;
  title: string;
  description: string;
  thumbnailLoc: string;
  lastmod?: string;
}): string {
  const player = `${BASE}${publicVideoPath(opts.id)}`;
  return `  <url>
    <loc>${player}</loc>${opts.lastmod ? `\n    <lastmod>${opts.lastmod.slice(0, 10)}</lastmod>` : ""}
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
    <video:video>
      <video:thumbnail_loc>${xmlEscape(opts.thumbnailLoc)}</video:thumbnail_loc>
      <video:title>${xmlEscape(opts.title)}</video:title>
      <video:description>${xmlEscape(opts.description)}</video:description>
      <video:player_loc>${player}</video:player_loc>
    </video:video>
  </url>`;
}

export const STATIC_PAGES = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/studio/new", changefreq: "weekly", priority: "0.9" },
  { loc: "/templates", changefreq: "weekly", priority: "0.8" },
  { loc: "/jobs", changefreq: "hourly", priority: "0.9" },
  { loc: "/tools/resume-roast", changefreq: "monthly", priority: "0.9" },
  { loc: "/feed", changefreq: "hourly", priority: "0.8" },
  { loc: "/people", changefreq: "daily", priority: "0.7" },
  { loc: "/companies", changefreq: "daily", priority: "0.7" },
  { loc: "/tasks", changefreq: "daily", priority: "0.7" },
  { loc: "/vs-competitors", changefreq: "weekly", priority: "0.8" },
  { loc: "/pricing", changefreq: "monthly", priority: "0.8" },
  { loc: "/tools/resume-optimizer", changefreq: "monthly", priority: "0.8" },
  { loc: "/tools/salary-calculator", changefreq: "monthly", priority: "0.8" },
  { loc: "/tools/ai-resume-scorer", changefreq: "monthly", priority: "0.7" },
  { loc: "/tools/job-resume-match", changefreq: "monthly", priority: "0.7" },
  { loc: "/tools/auto-fill", changefreq: "monthly", priority: "0.8" },
  { loc: "/salary", changefreq: "weekly", priority: "0.9" },
  { loc: "/about", changefreq: "monthly", priority: "0.5" },
  { loc: "/contact", changefreq: "monthly", priority: "0.5" },
  { loc: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
  { loc: "/terms-of-service", changefreq: "yearly", priority: "0.3" },
  // AI-resilient sector surfaces (gap #1165). Sector slugs MUST stay in
  // sync with shared/sectors.ts SECTORS. Tracked as a consolidate-
  // marketing-route-SSoT follow-up gap.
  { loc: "/sectors", changefreq: "weekly", priority: "0.8" },
  { loc: "/sectors/healthcare", changefreq: "weekly", priority: "0.7" },
  { loc: "/sectors/legal", changefreq: "weekly", priority: "0.7" },
  { loc: "/sectors/government", changefreq: "weekly", priority: "0.7" },
  { loc: "/sectors/law_enforcement", changefreq: "weekly", priority: "0.7" },
  { loc: "/sectors/security", changefreq: "weekly", priority: "0.7" },
  { loc: "/sectors/skilled_trades", changefreq: "weekly", priority: "0.7" },
  { loc: "/sectors/beauty_personal_care", changefreq: "weekly", priority: "0.7" },
  { loc: "/sectors/gig_work", changefreq: "weekly", priority: "0.7" },
  { loc: "/sectors/politics_campaigns", changefreq: "weekly", priority: "0.7" },
  { loc: "/sectors/politics_civic", changefreq: "weekly", priority: "0.7" },
  { loc: "/sectors/tech", changefreq: "weekly", priority: "0.5" },
  { loc: "/pivot-explorer", changefreq: "weekly", priority: "0.8" },
  { loc: "/resume-templates", changefreq: "weekly", priority: "0.7" },
  { loc: "/articles", changefreq: "daily", priority: "0.7" },
  { loc: "/blog", changefreq: "weekly", priority: "0.7" },
];
