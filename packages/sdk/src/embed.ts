/**
 * Framework-agnostic embed helper. Renders a connected job seeker's Hired.Video
 * profile/resume inside an iframe. Use this in plain JS / Vue / Svelte / etc.;
 * React users can use `@seanhogg/hired-video-sdk/react` instead.
 *
 * The `token` must be minted server-side via `HiredClient.createEmbedToken` and
 * handed to the browser — the partner API key is NEVER exposed here.
 */
const DEFAULT_BASE_URL = "https://hired.video";

export interface MountHiredProfileOptions {
  /** Short-lived embed token from `HiredClient.createEmbedToken`. */
  token: string;
  /** API origin (must match the one that minted the token). */
  baseUrl?: string;
  /** iframe height (px or any CSS length). Default "720px". */
  height?: string | number;
  /** iframe title for accessibility. Default "Hired.Video profile". */
  title?: string;
  /** Fired when the iframe finishes loading. */
  onLoad?: () => void;
}

export interface HiredEmbedHandle {
  /** The created iframe element. */
  iframe: HTMLIFrameElement;
  /** Remove the iframe from the DOM. */
  destroy: () => void;
}

function resolveTarget(target: string | HTMLElement): HTMLElement {
  const el = typeof target === "string" ? document.querySelector<HTMLElement>(target) : target;
  if (!el) throw new Error(`Hired.Video embed: target "${String(target)}" not found.`);
  return el;
}

/** Build the embed iframe URL from a token. */
export function buildEmbedUrl(token: string, baseUrl: string = DEFAULT_BASE_URL): string {
  return `${baseUrl.replace(/\/$/, "")}/embedded/profile/${encodeURIComponent(token)}`;
}

/**
 * Mount the Hired.Video profile embed into `target` and return a handle.
 *
 * ```js
 * import { mountHiredProfile } from "@seanhogg/hired-video-sdk";
 * const embed = mountHiredProfile("#hired-profile", { token });
 * // later: embed.destroy();
 * ```
 */
export function mountHiredProfile(
  target: string | HTMLElement,
  options: MountHiredProfileOptions,
): HiredEmbedHandle {
  if (!options?.token) throw new Error("Hired.Video embed: `token` is required.");
  const container = resolveTarget(target);
  const iframe = document.createElement("iframe");
  iframe.src = buildEmbedUrl(options.token, options.baseUrl);
  iframe.title = options.title ?? "Hired.Video profile";
  iframe.loading = "lazy";
  iframe.style.width = "100%";
  iframe.style.border = "0";
  const h = options.height ?? "720px";
  iframe.style.height = typeof h === "number" ? `${h}px` : h;
  iframe.setAttribute("allow", "clipboard-write");
  if (options.onLoad) iframe.addEventListener("load", options.onLoad);
  container.appendChild(iframe);
  return {
    iframe,
    destroy: () => {
      iframe.remove();
    },
  };
}
