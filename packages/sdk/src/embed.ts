/**
 * Framework-agnostic embed helper. Renders a connected job seeker's Hired.Video
 * resume inside an iframe. Use this in plain JS / Vue / Svelte / etc.; React
 * users can use `@seanhogg/hired-video-sdk/react` instead.
 *
 * Pass the `embedUrl` returned by `HiredClient.createEmbedToken` — it points at
 * the canonical Hired.Video embed surface with the short-lived token attached.
 * The partner API key is NEVER exposed here.
 */

export interface MountHiredProfileOptions {
  /** The `embedUrl` from `HiredClient.createEmbedToken`. */
  embedUrl: string;
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

/**
 * Mount the Hired.Video profile embed into `target` and return a handle.
 *
 * ```js
 * import { mountHiredProfile } from "@seanhogg/hired-video-sdk";
 * // embedUrl came from your server: hired.createEmbedToken({ userId })
 * const embed = mountHiredProfile("#hired-profile", { embedUrl });
 * // later: embed.destroy();
 * ```
 */
export function mountHiredProfile(
  target: string | HTMLElement,
  options: MountHiredProfileOptions,
): HiredEmbedHandle {
  if (!options?.embedUrl) throw new Error("Hired.Video embed: `embedUrl` is required.");
  const container = resolveTarget(target);
  const iframe = document.createElement("iframe");
  iframe.src = options.embedUrl;
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
