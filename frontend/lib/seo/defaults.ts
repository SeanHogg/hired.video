import { CHROME_EXTENSION_STORE_URL } from "@/lib/chrome-extension";
import type { SEOData } from "./types";

/**
 * Organization schema used as the default structured data payload on
 * marketing pages where a more specific schema (WebApplication,
 * JobPosting, FAQPage) is not provided. Establishes the hired.video
 * brand entity for Google Knowledge Graph, Bing, and AI overviews (GEO).
 */
export const ORGANIZATION_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "hired.video",
  alternateName: "Hired.video",
  url: "https://hired.video",
  logo: "https://hired.video/og-image.svg",
  description:
    "hired.video is an AI-powered video resume platform that helps candidates create compelling video resumes and helps recruiters find top talent faster.",
  sameAs: [
    "https://www.linkedin.com/company/hired-video",
    CHROME_EXTENSION_STORE_URL,
    "https://x.com/hired_video",
    "https://www.youtube.com/@hired-video",
    "https://github.com/hired-video",
  ],
  contactPoint: {
    "@type": "ContactPoint",
    contactType: "customer support",
    email: "info@hired.video",
    availableLanguage: ["English", "Spanish", "French"],
  },
};

/**
 * Default SEO configuration for the application
 */
export const DEFAULT_SEO: SEOData = {
  title:
    "AI Video Resumes, Resume Builder & AI Job Search Platform — hired.video",
  description:
    "hired.video turns your resume into an AI-generated video resume in 60 seconds. Build, score, and tailor resumes for every job — and connect with recruiters through AI-powered matching.",
  keywords:
    "AI video resume, video resume maker, resume builder, AI resume scorer, AI job matching, ATS resume, recruitment platform, job search, career tools, interview practice",
  ogTitle: "AI Video Resumes & AI Job Search — hired.video",
  ogDescription:
    "Create an AI video resume in 60 seconds, tailor your resume for every job, and get matched with recruiters who are actively hiring.",
  ogImage: "https://hired.video/og-image.svg",
  ogUrl: "https://hired.video",
  twitterCard: "summary_large_image",
  twitterSite: "@hired_video",
  twitterCreator: "@hired_video",
  author: "hired.video",
  robots: "index, follow",
  structuredData: ORGANIZATION_SCHEMA,
};
