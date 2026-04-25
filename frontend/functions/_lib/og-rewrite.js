// Shared OG-tag rewriter for Cloudflare Pages Functions.
// Only invoked for social-bot User-Agents — humans get the unmodified SPA
// response so there's no latency cost for normal page loads.

// Matches both social-card scrapers (LinkedIn / X / Facebook / Slack / etc.)
// and search-engine crawlers (Google / Bing / DuckDuckGo / Apple). All of
// them benefit from per-content title/description in the HTML — humans
// don't, so we skip the rewrite path on regular browser requests to keep
// SPA navigation latency at zero.
const BOT_REGEX = /bot|crawler|spider|facebookexternalhit|facebot|linkedinbot|twitterbot|slackbot|discordbot|whatsapp|telegrambot|skypeuripreview|embed|mastodon|pinterestbot|googlebot|bingbot|duckduckbot|baiduspider|yandexbot|applebot|google-inspectiontool|google.*site.*verification|adsbot/i;

export function isSocialCrawler(request) {
  const ua = request.headers.get("user-agent") || "";
  return BOT_REGEX.test(ua);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function setMeta(html, attr, key, value) {
  const re = new RegExp(`<meta([^>]*?)${attr}=["']${key}["']([^>]*?)>`, "i");
  const replacement = `<meta ${attr}="${key}" content="${escapeHtml(value)}" />`;
  return re.test(html)
    ? html.replace(re, replacement)
    : html.replace(/<\/head>/i, `  ${replacement}\n</head>`);
}

function setTitle(html, title) {
  return /<title>[\s\S]*?<\/title>/i.test(html)
    ? html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`)
    : html.replace(/<\/head>/i, `  <title>${escapeHtml(title)}</title>\n</head>`);
}

export function rewriteMeta(html, { title, description, image, url }) {
  let out = html;
  if (title) {
    out = setTitle(out, title);
    out = setMeta(out, "property", "og:title", title);
    out = setMeta(out, "name", "twitter:title", title);
  }
  if (description) {
    out = setMeta(out, "name", "description", description);
    out = setMeta(out, "property", "og:description", description);
    out = setMeta(out, "name", "twitter:description", description);
  }
  if (image) {
    out = setMeta(out, "property", "og:image", image);
    out = setMeta(out, "name", "twitter:image", image);
  }
  if (url) {
    out = setMeta(out, "property", "og:url", url);
  }
  return out;
}

// Fetch the SPA's index.html via `next()` and stream its text.
export async function getBaseHtml(next) {
  const res = await next();
  const html = await res.text();
  return { html, headers: res.headers };
}

export function htmlResponse(html, baseHeaders) {
  const headers = new Headers(baseHeaders);
  headers.set("content-type", "text/html; charset=utf-8");
  // Crawlers benefit from a short cache; humans bypass this path entirely.
  headers.set("cache-control", "public, max-age=600, s-maxage=3600");
  return new Response(html, { headers });
}

export function apiBase(env) {
  return env.PUBLIC_API_BASE || env.API_BASE || "https://hired.video";
}
