/**
 * Verification gate — module-level mirror of "can the current session
 * read `/api/users/me`?". Imperative (non-React) call paths consult this
 * before firing `/me`-shaped requests so verification limbo doesn't burn
 * a 403 round-trip.
 *
 * Single source of truth — every `/me` caller (auth-service,
 * user-service, future services) imports from here so the predicate
 * can't drift across modules.
 *
 * Sources that flip the flag:
 *   • `setVerificationGate(emailConfirmed)` — called from
 *     `authService.getVerificationStatus()` after every status check.
 *   • `auth-email-unverified` window event — dispatched by the api
 *     client when ANY request comes back `EMAIL_NOT_VERIFIED` /
 *     `ACCOUNT_UNVERIFIED`. Catches the case where a non-`/me` request
 *     surfaces the unverified state first.
 *   • `auth-logout` window event — clears the gate so the next
 *     session decides fresh.
 */

let verificationKnownBlocked = false;

if (typeof window !== "undefined") {
  window.addEventListener("auth-email-unverified", () => {
    verificationKnownBlocked = true;
  });
  window.addEventListener("auth-logout", () => {
    verificationKnownBlocked = false;
  });
}

/** True when we know the current session can't read `/me`. Callers
 *  short-circuit instead of firing a doomed request. */
export function isVerificationKnownBlocked(): boolean {
  return verificationKnownBlocked;
}

/** Sync the gate with an authoritative verification-status response. */
export function setVerificationGate(emailConfirmed: boolean): void {
  verificationKnownBlocked = !emailConfirmed;
}
