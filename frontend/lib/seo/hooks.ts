import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { DEFAULT_LOCALE, PUBLIC_LOCALES, type Locale } from "@shared/i18n";
import { generateBreadcrumbs } from "@shared/structured-data";
import { resolvePageSeoKey } from "@/lib/config/page-meta-registry";
import type { SEOData } from "./types";
import { DEFAULT_SEO } from "./defaults";
import { PAGE_SEO } from "./page-seo";
import { CANONICAL_ORIGIN, canonicalizePath, defaultBreadcrumbs } from "./canonical";
import { updateMetaTags } from "./dom";

/**
 * React hook for managing SEO.
 *
 * Locale-aware: the active i18n locale is reflected onto `<html lang>`,
 * baked into the canonical / og:url (`?lang=es` for non-default
 * locales), and used to look up `seo.<path>.title` / `seo.<path>.description`
 * catalogue keys that override the static English PAGE_SEO entries when
 * present. hreflang alternates are emitted unconditionally — the
 * non-English URL variants are always advertised to crawlers.
 */
export function useSEO(pathname: string, customSEO?: Partial<SEOData>): void {
  const { i18n, t } = useTranslation();
  const activeLocale = (PUBLIC_LOCALES as readonly string[]).includes(i18n.language)
    ? (i18n.language as Locale)
    : DEFAULT_LOCALE;

  useEffect(() => {
    // Canonicalize route path and normalize origin
    const canonicalPath = canonicalizePath(pathname);

    // Resolve the effective SEO key. An exact PAGE_SEO entry wins; if
    // there isn't one (dynamic / detail routes like /studio/editor/:id,
    // /jobs/:id, /articles/:slug), fall back to the parent surface's key
    // declared in the page-meta registry so the route inherits real
    // title / description / structured data instead of generic
    // DEFAULT_SEO (gap #1622). PAGE_SEO stays the single SEO store.
    const fallbackKey = resolvePageSeoKey(pathname);
    const effectiveSeoKey = PAGE_SEO[canonicalPath]
      ? canonicalPath
      : fallbackKey && PAGE_SEO[fallbackKey]
        ? fallbackKey
        : canonicalPath;

    // Get page-specific SEO or use defaults
    const pageSEO = PAGE_SEO[effectiveSeoKey] || {};

    // Merge default, page-specific, and custom SEO data
    const seoData: SEOData = {
      ...DEFAULT_SEO,
      ...pageSEO,
      ...customSEO,
    };

    // Build canonical + og:url. Non-default locales get a `?lang=X`
    // canonical so each language variant is a separately indexable URL.
    const baseUrl = `${CANONICAL_ORIGIN}${canonicalPath}`;
    const localizedUrl =
      activeLocale === DEFAULT_LOCALE ? baseUrl : `${baseUrl}?lang=${activeLocale}`;
    if (!seoData.canonical) {
      seoData.canonical = localizedUrl;
    }
    if (!seoData.ogUrl) {
      seoData.ogUrl = localizedUrl;
    }
    if (!seoData.htmlLang) {
      seoData.htmlLang = activeLocale;
    }

    // Locale-aware title + description overrides. When the catalogue
    // carries `seo.<canonicalPath>.title` / `.description`, they win
    // over the static English PAGE_SEO entry — so a Spanish or French
    // visitor sees translated meta tags in the browser tab and in
    // shared/social previews. Missing keys silently fall back to the
    // English defaults (no flash of raw key — `defaultValue: ""`).
    const titleKey = `seo.${effectiveSeoKey}.title`;
    const descKey = `seo.${effectiveSeoKey}.description`;
    const localizedTitle = t(titleKey, { defaultValue: "" });
    const localizedDesc = t(descKey, { defaultValue: "" });
    if (localizedTitle) {
      seoData.title = localizedTitle;
      seoData.ogTitle = seoData.ogTitle ?? localizedTitle;
      seoData.twitterTitle = seoData.twitterTitle ?? localizedTitle;
    }
    if (localizedDesc) {
      seoData.description = localizedDesc;
      seoData.ogDescription = seoData.ogDescription ?? localizedDesc;
      seoData.twitterDescription = seoData.twitterDescription ?? localizedDesc;
    }

    // Update meta tags
    updateMetaTags(seoData);

    // Cleanup function to reset to defaults when component unmounts
    return () => {
      // Only reset if we're navigating away from the current page
      if (window.location.pathname !== pathname) {
        updateMetaTags(DEFAULT_SEO);
      }
    };
  }, [pathname, customSEO, activeLocale, t]);
}

/**
 * Injects a BreadcrumbList JSON-LD script alongside (not replacing) the
 * page's primary structured data. Cleaned up on unmount.
 *
 * Usage in a tool page:
 *   useBreadcrumbs([
 *     { name: "Tools", url: "/tools" },
 *     { name: "AI Resume Scorer", url: "/tools/ai-resume-scorer" },
 *   ]);
 */
export function useBreadcrumbs(
  items: { name: string; url: string }[],
): void {
  useEffect(() => {
    const scriptId = "breadcrumb-jsonld";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.type = "application/ld+json";
      script.id = scriptId;
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(generateBreadcrumbs(items));

    return () => {
      const existing = document.getElementById(scriptId);
      if (existing) existing.remove();
    };
  }, [items]);
}
/**
 * One-call page chrome (#1869) — applies route-derived SEO + a default
 * breadcrumb trail in a single hook. Pages that don't need bespoke SEO /
 * breadcrumbs call `usePageChrome()` once instead of wiring `useSEO` +
 * `useBreadcrumbs` separately; pass `customSEO` to override per entity
 * (detail pages). Satisfies the `require-page-chrome` lint rule. Must be
 * used inside a Router (reads `useLocation`).
 */
export function usePageChrome(customSEO?: Partial<SEOData>): void {
  const { pathname } = useLocation();
  useSEO(pathname, customSEO);
  useBreadcrumbs(defaultBreadcrumbs(pathname));
}

/**
 * Breadcrumbs-only convenience (#1869) — emits a route-derived
 * BreadcrumbList for pages that already declare their own `useSEO` and
 * just need the breadcrumb JSON-LD. Self-contained (reads `useLocation`)
 * so callers add a single argument-free line. Satisfies the
 * `require-page-chrome` lint rule's breadcrumb requirement.
 */
export function useDefaultBreadcrumbs(): void {
  const { pathname } = useLocation();
  useBreadcrumbs(defaultBreadcrumbs(pathname));
}
