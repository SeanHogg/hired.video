/**
 * Guest accounts (mig 0496) — a signed-out visitor's silent server identity.
 * Guest rows carry a placeholder address on the RFC 2606 `.invalid` TLD,
 * which can never deliver; the email adapter skips it outright.
 */
export const GUEST_EMAIL_DOMAIN = "guest.invalid";

export function guestEmailFor(id: string): string {
  return `guest-${id}@${GUEST_EMAIL_DOMAIN}`;
}

export function isGuestEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${GUEST_EMAIL_DOMAIN}`);
}
