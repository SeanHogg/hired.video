/**
 * DNS MX-record check via DNS-over-HTTPS.
 *
 * A sign-up email whose domain has no MX records can never receive the
 * verification email anyway — accepting it is a guaranteed bounce.
 * We use Cloudflare's DoH endpoint (also available on Workers' fetch
 * with no extra binding) and cache definitive answers through the
 * canonical edge cache (key `mx:v1:<domain>`, 6h TTL).
 *
 * Failure mode: DNS errors or timeouts → return TRUE (fail-open).
 * Better to occasionally accept an undeliverable address than block a
 * whole signup wave when DoH has a hiccup. Fail-open results are NOT
 * cached (the loader throws, and throws are never cached).
 */

import { getOrSetIsolateCached } from "../../utils/isolate-cache.js";

// Isolate-only: one key per email domain is unbounded (no KV write per
// signup domain on Workers Free); the LRU bounds memory.
const MX_CACHE_TTL_SECONDS = 6 * 60 * 60; // 6 hours
const REQUEST_TIMEOUT_MS = 1500;

interface DohAnswer {
  data: string;
  type: number;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

async function lookupMx(domain: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`DoH ${res.status}`);
    const json = (await res.json()) as DohResponse;
    // type 15 = MX. Some domains use a CNAME to a host with MX; if no
    // MX is returned but A/AAAA exists, mail can still be delivered to
    // the A record (RFC 5321 §5.1). Treat presence of *any* answer as
    // good enough.
    return (json.Answer ?? []).length > 0;
  } finally {
    clearTimeout(timer);
  }
}

export async function verifyMxRecord(email: string): Promise<boolean> {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain) return false;

  try {
    return await getOrSetIsolateCached({
      key: `mx:v1:${domain}`,
      ttlSeconds: MX_CACHE_TTL_SECONDS,
      loader: () => lookupMx(domain),
    });
  } catch {
    return true; // fail-open on network/timeout/non-2xx
  }
}
