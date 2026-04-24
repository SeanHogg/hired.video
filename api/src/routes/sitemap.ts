// sitemap.ts — Dynamic XML sitemap (#SEO)
// Generates a sitemap.xml from live jobs, user profiles, companies, and static pages.
// Served at GET /sitemap.xml (public, no auth).

import { Hono } from "hono";
import { getDb, schema } from "../db/index.js";
import { and, eq, desc } from "drizzle-orm";

export const sitemapRoutes = new Hono();

const BASE = process.env.APP_URL ?? "https://hired.video";

function url(loc: string, lastmod?: string, changefreq = "weekly", priority = "0.7") {
  return `  <url>
    <loc>${BASE}${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod.slice(0, 10)}</lastmod>` : ""}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

const STATIC_PAGES = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
  { loc: "/jobs", changefreq: "hourly", priority: "0.9" },
  { loc: "/resume-roast", changefreq: "monthly", priority: "0.9" },
  { loc: "/post-a-job", changefreq: "monthly", priority: "0.8" },
  { loc: "/feed", changefreq: "hourly", priority: "0.8" },
  { loc: "/people", changefreq: "daily", priority: "0.7" },
  { loc: "/companies", changefreq: "daily", priority: "0.7" },
  { loc: "/pricing", changefreq: "monthly", priority: "0.8" },
  { loc: "/for-recruiters", changefreq: "monthly", priority: "0.7" },
  { loc: "/tools/resume-optimizer", changefreq: "monthly", priority: "0.8" },
  { loc: "/tools/salary-calculator", changefreq: "monthly", priority: "0.8" },
  { loc: "/tools/ai-resume-scorer", changefreq: "monthly", priority: "0.7" },
  { loc: "/tools/job-resume-match", changefreq: "monthly", priority: "0.7" },
  { loc: "/tools/auto-fill", changefreq: "monthly", priority: "0.8" },
  { loc: "/about", changefreq: "monthly", priority: "0.5" },
  { loc: "/contact", changefreq: "monthly", priority: "0.5" },
  { loc: "/privacy-policy", changefreq: "yearly", priority: "0.3" },
  { loc: "/terms-of-service", changefreq: "yearly", priority: "0.3" },
];

sitemapRoutes.get("/sitemap.xml", async (c) => {
  const db = getDb(c.env as any);
  const now = new Date().toISOString();

  // Fetch dynamic content (limit to recent 500 of each to keep sitemap manageable)
  const [jobs, companies, publicUsers] = await Promise.allSettled([
    db
      .select({ id: schema.jobItems.id, title: schema.jobItems.title, updatedAt: schema.jobItems.updatedAt })
      .from(schema.jobItems)
      .where(eq((schema.jobItems as any).status, "active"))
      .orderBy(desc(schema.jobItems.updatedAt))
      .limit(500),

    db
      .select({ id: schema.companyProfiles.id, slug: schema.companyProfiles.slug, updatedAt: schema.companyProfiles.updatedAt })
      .from(schema.companyProfiles)
      .orderBy(desc(schema.companyProfiles.updatedAt))
      .limit(300),

    db
      .select({ id: schema.userProfiles.userId, slug: schema.userProfiles.customUrlSlug, updatedAt: schema.userProfiles.updatedAt })
      .from(schema.userProfiles)
      // Join users so we can require emailVerified — keeps unverified spam
      // signups out of the public XML sitemap (and therefore out of search
      // engine indexes).
      .innerJoin(schema.users, eq(schema.users.id, schema.userProfiles.userId))
      .where(and(
        eq(schema.userProfiles.profileVisibility, "public"),
        eq(schema.users.emailVerified, true),
      ))
      .orderBy(desc(schema.userProfiles.updatedAt))
      .limit(500),
  ]);

  const jobRows = jobs.status === "fulfilled" ? jobs.value : [];
  const companyRows = companies.status === "fulfilled" ? companies.value : [];
  const userRows = publicUsers.status === "fulfilled" ? publicUsers.value : [];

  // Build unique job slugs for resume guide + salary SEO pages
  const jobSlugs = [...new Set(
    jobRows
      .map((j) => j.title?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
      .filter(Boolean)
  )].slice(0, 200) as string[];

  const urls: string[] = [
    // Static pages
    ...STATIC_PAGES.map((p) => url(p.loc, now, p.changefreq, p.priority)),

    // Dynamic job listings
    ...jobRows.map((j) => url(`/jobs/${j.id}`, j.updatedAt?.toISOString(), "daily", "0.8")),

    // Dynamic company pages
    ...companyRows.map((c) => url(`/companies/${c.slug ?? c.id}`, c.updatedAt?.toISOString(), "weekly", "0.7")),

    // Dynamic public profiles
    ...userRows.map((u) => url(`/people/${u.slug ?? u.id}`, u.updatedAt?.toISOString(), "weekly", "0.6")),

    // Programmatic SEO: salary pages
    ...jobSlugs.map((s) => url(`/salary/${s}`, now, "weekly", "0.8")),

    // Programmatic SEO: resume guide pages
    ...jobSlugs.map((s) => url(`/resume-guide/${s}`, now, "weekly", "0.8")),
  ];

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

  c.header("Content-Type", "application/xml");
  c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
  return c.body(xml, 200);
});
