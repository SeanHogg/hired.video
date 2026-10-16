/**
 * Public mailbox providers — domains anyone can sign up on, so sharing one
 * says nothing about who owns the address. Data only; the helpers below are
 * the one place that normalizes an email / website down to its domain.
 *
 * Used by the contact duplicate scorer (shared/contacts.ts) and the
 * candidate-video consent approver check (a recruiter may not route the
 * candidate's approval to their own or their company's domain).
 */

export const PUBLIC_MAILBOX_DOMAINS: readonly string[] = [
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "yahoo.ca",
  "ymail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.co.uk",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zoho.com",
  "yandex.com",
  "fastmail.com",
  "hey.com",
  "tutanota.com",
];

const PUBLIC_MAILBOX_SET = new Set(PUBLIC_MAILBOX_DOMAINS);

/** Lower-cased, trimmed domain with any leading `www.` removed. */
function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

/** The domain part of an email ("Dana@Acme.com" → "acme.com"); null when malformed. */
export function emailDomain(email: string | null | undefined): string | null {
  const v = email?.trim().toLowerCase() ?? "";
  const at = v.lastIndexOf("@");
  if (at <= 0 || at === v.length - 1) return null;
  return normalizeDomain(v.slice(at + 1));
}

/** The host of a company website ("https://www.acme.com/about" → "acme.com"); null when unparseable. */
export function websiteDomain(website: string | null | undefined): string | null {
  const raw = website?.trim();
  if (!raw) return null;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname;
    return host ? normalizeDomain(host) : null;
  } catch {
    return null;
  }
}

export function isPublicMailboxDomain(domain: string | null | undefined): boolean {
  return !!domain && PUBLIC_MAILBOX_SET.has(normalizeDomain(domain));
}

/** `candidate` is `owned` or one of its subdomains (mail.acme.com ⊂ acme.com). */
export function domainBelongsTo(candidate: string, owned: string): boolean {
  const c = normalizeDomain(candidate);
  const o = normalizeDomain(owned);
  return c === o || c.endsWith(`.${o}`);
}
