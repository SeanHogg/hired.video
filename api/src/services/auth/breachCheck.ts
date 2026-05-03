/**
 * Compromised-password check via the haveibeenpwned k-anonymity API.
 *
 * NIST SP 800-63B §5.1.1.2 requires that user-chosen passwords be
 * checked against known breach corpora. The HIBP `/range/{prefix}` API
 * lets us do this without ever sending the password (or its full hash)
 * off-platform: we send the first 5 chars of the SHA-1, get back the
 * suffix list with counts, and look up the rest locally.
 *
 * Privacy: SHA-1 of the password leaves the worker only as a 5-char
 * prefix. Even a wire-tap on the response can't tell which password
 * was checked.
 *
 * Fail-open: if HIBP is unreachable, return false (i.e. "not breached"
 * — let the signup proceed). The cost of a rare breached-password slip
 * is lower than blocking a whole signup wave on third-party downtime.
 */

const REQUEST_TIMEOUT_MS = 1500;

async function sha1Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/**
 * Returns true if the password appears in HIBP's breach corpus.
 * `minOccurrences` is the threshold below which we treat the result as
 * "not breached enough to reject". Default 1 = any appearance counts;
 * raise to e.g. 100 if we want only "common" breached passwords.
 */
export async function isBreachedPassword(
  password: string,
  minOccurrences = 1,
): Promise<boolean> {
  if (!password || password.length < 1) return false;
  const sha1 = await sha1Hex(password);
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return false; // fail-open
    const text = await res.text();
    // Response is `SUFFIX:COUNT\r\n` per line. We scan for our suffix.
    const lines = text.split("\n");
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      const candidateSuffix = line.slice(0, colon).trim().toUpperCase();
      if (candidateSuffix !== suffix) continue;
      const count = parseInt(line.slice(colon + 1).trim(), 10);
      if (Number.isFinite(count) && count >= minOccurrences) return true;
      return false;
    }
    return false;
  } catch {
    return false; // fail-open on network/timeout
  }
}
