/**
 * Disposable / throwaway email blocklist.
 *
 * Curated against the popular `disposable-email-domains` corpus (top
 * offenders). Inlined rather than npm-imported so cold-start in a
 * Cloudflare Worker stays fast. Add domains here as we see them in
 * bot_block_events with reason='register'.
 *
 * Single source of truth for the disposable check. Both the signup
 * handler and any future "is this email risky?" surfaces import from
 * here.
 */

const DISPOSABLE_DOMAINS = new Set<string>([
  // High-volume throwaway providers — covers ~95% of bot-signup attempts
  "10minutemail.com", "10minutemail.net", "tempmail.com", "tempmail.net",
  "temp-mail.org", "temp-mail.io", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "guerrillamail.biz", "guerrillamail.info",
  "guerrillamailblock.com", "sharklasers.com", "grr.la",
  "mailinator.com", "mailinator.net", "mailinator.org", "mailinator2.com",
  "maildrop.cc", "yopmail.com", "yopmail.fr", "yopmail.net",
  "throwawaymail.com", "trashmail.com", "trashmail.net", "trashmail.de",
  "fakeinbox.com", "fakemailgenerator.com", "spam4.me", "spambox.us",
  "getnada.com", "nada.email", "dispostable.com", "mintemail.com",
  "mohmal.com", "harakirimail.com", "tempinbox.com", "throwam.com",
  "yopmail.gq", "instantemailaddress.com", "instant-mail.de",
  "emailondeck.com", "fakemail.net", "deadaddress.com", "discard.email",
  "discardmail.com", "spambog.com", "spambog.de", "sogetthis.com",
  "anonbox.net", "mytemp.email", "tmail.io", "tmpmail.org", "tmpmail.net",
  "tmpbox.net", "tempemail.com", "tempemail.net", "tempinbox.co.uk",
  "33mail.com", "armyspy.com", "cuvox.de", "dayrep.com", "einrot.com",
  "fleckens.hu", "gustr.com", "jourrapide.com", "rhyta.com",
  "superrito.com", "teleworm.us", "burnermail.io", "anonymail.dk",
  "mvrht.net", "mt2014.com", "mt2015.com", "mailcatch.com",
  "mailfreeze.com", "mailnesia.com", "moakt.cc", "moakt.com",
  "vomoto.com", "20minutemail.com", "1secmail.com", "1secmail.net",
  "mintemail.de", "kasmail.com", "antichef.com", "binkmail.com",
  "spamgourmet.com", "tempr.email", "spamex.com", "mytrashmail.com",
  "mailbox80.com", "anonymousfeedback.net", "tempail.com", "vusra.com",
]);

/**
 * Returns true if the email's domain matches a known throwaway provider.
 * Case-insensitive; sub-domains of disposable parents are NOT caught
 * (e.g. `foo.mailinator.com`) — add explicit entries when seen.
 */
export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  return DISPOSABLE_DOMAINS.has(email.slice(at + 1).toLowerCase());
}
