// HTML sanitiser for email-body rendering inside the InboxDetailSheet.
//
// The iframe carries `sandbox=""` (no JS, no top-level navigation, no
// form submit, no popups), which already blocks the scariest classes
// of attack. The sanitiser layered on top exists for two reasons the
// sandbox alone doesn't address:
//
//   • Tracking pixels. `<img src="https://…/open?u=…">` loads the
//     moment the iframe renders, telling the sender the user opened
//     the message. Off by default; the per-message "Display images"
//     toggle re-enables it.
//   • Style hygiene. Strip `<script>` + `<style>` tags + every `on*`
//     attribute so even a future sandbox bug couldn't smuggle JS in,
//     and the message can't override the host app's CSS.
//
// Plain-text fallback path (bodyText → wrap in <pre>) goes through
// the same function so we get one rendering surface, not two.

export interface SanitizedBody {
  html: string;
  /** True when at least one image was stripped — drives the toggle
   *  affordance ("Display images" / "Images displayed"). */
  hadImages: boolean;
}

const HOST_STYLES = `
<style>
  html, body { margin: 0; padding: 0; }
  body {
    font: 14px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    color: #0f172a;
    word-break: break-word;
  }
  a { color: #2563eb; }
  img { max-width: 100%; height: auto; }
  pre { white-space: pre-wrap; font-family: inherit; }
  table { max-width: 100% !important; }
  /* Email designs are often display-only — kill quoting / signature
     blocks that explode visually inside our narrow panel. */
  blockquote { border-left: 3px solid #e2e8f0; margin: 0; padding: 0 0 0 10px; }
</style>
`.trim();

/** Strip every `<script>` and `<style>` tag (including the content
 *  between them) plus inline `on*` event handlers. Kept conservative
 *  because the iframe sandbox is the actual security boundary — this
 *  layer is defence-in-depth. */
function stripActiveContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    // Remove on* event handlers from any tag. The lookbehind on a
    // word-boundary keeps things like a `crayon` className intact.
    .replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, "")
    // javascript: hrefs — sandbox already blocks navigation, but
    // some clients route relative href to the parent. Replace to a
    // harmless anchor.
    .replace(/(href\s*=\s*["'])\s*javascript:[^"']*(["'])/gi, '$1#$2');
}

/** Replace `<img src="...">` with a placeholder. Stays a visible
 *  block so the user knows an image was here — clicking "Display
 *  images" re-renders with originals restored. */
function blockImages(html: string): { html: string; hadImages: boolean } {
  let hadImages = false;
  const next = html.replace(/<img\b[^>]*>/gi, () => {
    hadImages = true;
    return `<span style="display:inline-block;padding:2px 6px;margin:1px 0;font-size:11px;color:#64748b;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:3px;">[image blocked]</span>`;
  });
  return { html: next, hadImages };
}

export interface SanitizeOptions {
  /** When true, leave `<img>` tags intact (still strips scripts + JS).
   *  Default false — tracking pixels stay blocked until the user
   *  clicks "Display images" on the message. */
  loadImages?: boolean;
}

export function sanitizeEmailHtml(
  rawHtml: string,
  options: SanitizeOptions = {},
): SanitizedBody {
  const stripped = stripActiveContent(rawHtml);
  const { html: imageGated, hadImages } = options.loadImages
    ? { html: stripped, hadImages: /<img\b/i.test(rawHtml) }
    : blockImages(stripped);
  // `<base target="_blank">` makes every link open in a new tab when
  // the user clicks. The sandbox attribute "" blocks top-level
  // navigation by default; allowing it here would require
  // `allow-popups allow-popups-to-escape-sandbox`, which we don't want
  // — so links are rendered but not clickable from within the iframe.
  // Acceptable tradeoff: the user has "Open in gmail" / "Open in
  // outlook" for full interactivity, and copy-paste-link still works.
  const body = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  ${HOST_STYLES}
</head>
<body>${imageGated}</body>
</html>
`.trim();
  return { html: body, hadImages };
}

/** Wrap a plain-text body in the same iframe shell so the
 *  body-renderer has one code path. */
export function plainTextToIframeHtml(text: string): SanitizedBody {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const body = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  ${HOST_STYLES}
</head>
<body><pre>${escaped}</pre></body>
</html>
`.trim();
  return { html: body, hadImages: false };
}
