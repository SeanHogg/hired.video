/**
 * Identifier hashing helpers.
 *
 * Cache keys and the suppression-list `identifier_hash` column store
 * SHA-256(lowercased value) so we can index without storing raw email
 * addresses on the index. Cloudflare Workers expose Web Crypto, so we
 * use the same primitive Node 20+ provides.
 */

const enc = new TextEncoder();

export async function sha256Hex(value: string): Promise<string> {
  const bytes = enc.encode(value);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function normalizeLinkedinUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/$/, "");
}

export async function hashEmail(email: string): Promise<string> {
  return sha256Hex(normalizeEmail(email));
}

export async function buildQueryKey(query: { kind: string; value?: string; name?: string; company?: string }): Promise<string> {
  let canonical: string;
  if (query.kind === "email" && query.value) canonical = `email:${normalizeEmail(query.value)}`;
  else if (query.kind === "linkedin_url" && query.value) canonical = `linkedin:${normalizeLinkedinUrl(query.value)}`;
  else if (query.kind === "github_login" && query.value) canonical = `github:${query.value.trim().toLowerCase()}`;
  else if (query.kind === "name_company" && query.name && query.company)
    canonical = `name:${query.name.trim().toLowerCase()}|company:${query.company.trim().toLowerCase()}`;
  else if (query.kind === "domain" && query.value) canonical = `domain:${query.value.trim().toLowerCase()}`;
  else canonical = JSON.stringify(query);
  return sha256Hex(canonical);
}
