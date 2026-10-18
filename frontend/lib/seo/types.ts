/** Shape of a page's SEO payload (meta, Open Graph, Twitter, canonical, JSON-LD). */
export interface SEOData {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: "summary" | "summary_large_image" | "app" | "player";
  twitterSite?: string;
  twitterCreator?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  canonical?: string;
  robots?: string;
  author?: string;
  structuredData?: object;
  /** BCP47 tag for the document body's primary language. Reflected onto
   *  `<html lang>`. When omitted, the existing `<html lang>` attribute
   *  is left alone — useSEO supplies the active i18n locale by default. */
  htmlLang?: string;
}
