import { DEFAULT_LOCALE, PUBLIC_LOCALES } from "@shared/i18n";
import type { SEOData } from "./types";

/**
 * Update document meta tags
 */
export function updateMetaTags(seoData: SEOData): void {
  // Update title
  if (seoData.title) {
    document.title = seoData.title;
  }

  // Helper function to update or create meta tag
  const updateMetaTag = (name: string, content: string, property = false) => {
    const attribute = property ? "property" : "name";
    let meta = document.querySelector(`meta[${attribute}="${name}"]`);

    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute(attribute, name);
      document.head.appendChild(meta);
    }

    meta.setAttribute("content", content);
  };

  // Update meta tags
  if (seoData.description) updateMetaTag("description", seoData.description);
  if (seoData.keywords) updateMetaTag("keywords", seoData.keywords);
  if (seoData.author) updateMetaTag("author", seoData.author);
  if (seoData.robots) updateMetaTag("robots", seoData.robots);

  // Update Open Graph tags
  if (seoData.ogTitle) updateMetaTag("og:title", seoData.ogTitle, true);
  if (seoData.ogDescription)
    updateMetaTag("og:description", seoData.ogDescription, true);
  if (seoData.ogImage) updateMetaTag("og:image", seoData.ogImage, true);
  if (seoData.ogUrl) updateMetaTag("og:url", seoData.ogUrl, true);
  updateMetaTag("og:type", "website", true);

  // Update Twitter Card tags
  if (seoData.twitterCard) updateMetaTag("twitter:card", seoData.twitterCard);
  if (seoData.twitterSite) updateMetaTag("twitter:site", seoData.twitterSite);
  if (seoData.twitterCreator)
    updateMetaTag("twitter:creator", seoData.twitterCreator);
  if (seoData.twitterTitle)
    updateMetaTag("twitter:title", seoData.twitterTitle);
  if (seoData.twitterDescription)
    updateMetaTag("twitter:description", seoData.twitterDescription);
  if (seoData.twitterImage)
    updateMetaTag("twitter:image", seoData.twitterImage);

  // Update canonical URL
  if (seoData.canonical) {
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.setAttribute("rel", "canonical");
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", seoData.canonical);
  }

  // Inject hreflang alternate links. Each supported locale gets its own
  // <link rel="alternate" hreflang="X" href="...?lang=X"> plus one
  // `x-default` pointing at the bare URL (which the cookie/detector
  // resolves to the visitor's preferred locale). This is the signal
  // Google Search uses to surface the right language version per user
  // — without it, Mexican / Quebec Google never sees the localized
  // catalogue and only indexes the en variant.
  //
  // We use ?lang= query strings instead of /es/* /fr-CA/* path prefixes
  // because the SPA routes are flat and the i18n bootstrap already
  // honours ?lang= (see frontend/lib/i18n/i18n.ts). Each locale variant
  // is a separately-indexable URL with the same content surface.
  if (seoData.canonical) {
    // Wipe any prior hreflang links so navigating from /pricing to /jobs
    // doesn't leak stale alternates.
    document
      .querySelectorAll('link[rel="alternate"][hreflang]')
      .forEach((el) => el.remove());

    const baseUrl = seoData.canonical.split("?")[0];
    const addAlternate = (hreflang: string, href: string) => {
      const link = document.createElement("link");
      link.setAttribute("rel", "alternate");
      link.setAttribute("hreflang", hreflang);
      link.setAttribute("href", href);
      document.head.appendChild(link);
    };

    addAlternate("x-default", baseUrl);
    for (const loc of PUBLIC_LOCALES) {
      const href = loc === DEFAULT_LOCALE ? baseUrl : `${baseUrl}?lang=${loc}`;
      addAlternate(loc, href);
    }
  }

  // Reflect the active UI locale on <html lang> so screen readers and
  // crawlers know which language the body renders in. Falls back to the
  // page's existing attribute if no locale was supplied.
  if (seoData.htmlLang) {
    document.documentElement.setAttribute("lang", seoData.htmlLang);
  }

  // Add structured data
  if (seoData.structuredData) {
    // Remove existing structured data
    const existingScript = document.querySelector(
      'script[type="application/ld+json"]',
    );
    if (existingScript) {
      existingScript.remove();
    }

    // Add new structured data
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(seoData.structuredData);
    document.head.appendChild(script);
  }
}
