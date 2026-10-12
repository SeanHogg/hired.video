/**
 * Idempotent dynamic <script> loader.  Used by payment clients to inject
 * provider SDKs only when they're actually needed (avoids loading Stripe.js
 * / HelcimPay.js on every page).
 */

const loaded = new Set<string>();

export function loadScript(src: string): Promise<void> {
  if (loaded.has(src)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      loaded.add(src);
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => {
      loaded.add(src);
      resolve();
    };
    script.onerror = () => reject(new Error(`Failed to load payment SDK: ${src}`));
    document.head.appendChild(script);
  });
}
