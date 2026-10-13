/**
 * readAfterGuestAdoption — a page's first read of work that may still belong
 * to the guest session the visitor just signed in from. A real sign-in (OAuth
 * comes back as a full reload) starts the claim (AuthProvider →
 * authService.adoptGuest) while the page is already reading its project /
 * résumé; until the claim lands those rows are the guest's, so the read fails.
 * Retry once, after the claim — never a blank workspace for work that is
 * already theirs.
 */
import { authService } from "@/lib/services/auth-service";

export async function readAfterGuestAdoption<T>(read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (err) {
    const claim = authService.adoptionInFlight();
    if (!claim || !(await claim)) throw err;
    return read();
  }
}
