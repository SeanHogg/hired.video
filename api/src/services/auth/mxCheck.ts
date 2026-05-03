/**
 * DNS MX-record check via DNS-over-HTTPS.
 *
 * A sign-up email whose domain has no MX records can never receive the
 * verification email anyway — accepting it is a guaranteed bounce.
 * We use Cloudflare's DoH endpoint (also available on Workers' fetch
 * with no extra binding) and cache positive results in-memory for the
 * lifetime of the worker instance.
 *
 * Failure mode: DNS errors or timeouts → return TRUE (fail-open).
 * Better to occasionally accept an undeliverable address than block a
 * whole signup wave when DoH has a hiccup.
 */

const MX_CACHE = new Map<string, { ok: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const REQUEST_TIMEOUT_MS = 1500;

interface DohAnswer {
  data: string;
  type: number;
}

interface DohResponse {
  Status: number;
  Answer?: DohAnswer[];
}

export async function verifyMxRecord(email: string): Promise<boolean> {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain) return false;

  const cached = MX_CACHE.get(domain);
  if (cached && cached.expiresAt > Date.now()) return cached.ok;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`;
    const res = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      MX_CACHE.set(domain, { ok: true, expiresAt: Date.now() + 60_000 });
      return true; // fail-open
    }
    const json = (await res.json()) as DohResponse;
    // type 15 = MX. Some domains use a CNAME to a host with MX; if no
    // MX is returned but A/AAAA exists, mail can still be delivered to
    // the A record (RFC 5321 §5.1). Treat presence of *any* answer as
    // good enough.
    const ok = (json.Answer ?? []).length > 0;
    MX_CACHE.set(domain, { ok, expiresAt: Date.now() + CACHE_TTL_MS });
    return ok;
  } catch {
    return true; // fail-open on network/timeout
  }
}
