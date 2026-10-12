/**
 * Public entry point for the shared scraping domain.
 *
 * One stop shop for everything the API, frontend, and Chrome extension
 * need to detect jobs, classify URLs, and extract form fields from a
 * page. All exports are pure functions OR take their DOM/clock/fetch
 * dependencies as parameters — no hidden side-effects, no module-level
 * singletons.
 */

export * from "./htmlUtils.js";
export * from "./urls.js";
export * from "./jsonLd.js";
export * from "./applyLink.js";
export * from "./siteConfigs.js";
export * from "./selector.js";
export * from "./formFields.js";
export * from "./jobExtract.js";
