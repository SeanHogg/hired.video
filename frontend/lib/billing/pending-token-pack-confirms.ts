/**
 * Paid-but-unconfirmed token packs, remembered in this browser (gap #2352).
 *
 * The payment widget charges the card and hands the page a transaction id;
 * the server credits the pack only when the page then calls confirm. If the
 * tab closes, the network drops or the confirm call fails in between, the
 * charge would be orphaned. So the id is written here BEFORE confirm and
 * removed once the server has it (credited, pending on its side, or
 * definitively refused); `resumePendingTokenPackConfirms` re-sends anything
 * left on the next signed-in visit. The server is idempotent per transaction
 * id, so a re-send can never credit twice.
 */
import { apiServerErrorCode } from "@/lib/api-error-code";
import { tokenPackService } from "@/lib/services/token-pack-service";
import type { ConfirmTokenPackResultDTO } from "@shared/token-packs";

const STORAGE_KEY = "hired.tokenPacks.unconfirmed";
/** A stashed confirm older than this is dropped (the server cron owns it). */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface UnconfirmedTokenPack {
  packId: string;
  transactionId: string;
  userId: string;
  savedAt: number;
}

function read(): UnconfirmedTokenPack[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as UnconfirmedTokenPack[]) : [];
  } catch {
    return [];
  }
}

function write(entries: UnconfirmedTokenPack[]): void {
  try {
    if (entries.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    /* storage blocked (private mode): the server-side pending row still covers it */
  }
}

export function rememberUnconfirmedTokenPack(entry: Omit<UnconfirmedTokenPack, "savedAt">): void {
  const rest = read().filter((e) => e.transactionId !== entry.transactionId);
  write([...rest, { ...entry, savedAt: Date.now() }]);
}

export function forgetUnconfirmedTokenPack(transactionId: string): void {
  write(read().filter((e) => e.transactionId !== transactionId));
}

export function listUnconfirmedTokenPacks(userId: string, now = Date.now()): UnconfirmedTokenPack[] {
  const fresh = read().filter((e) => now - e.savedAt < MAX_AGE_MS);
  write(fresh);
  return fresh.filter((e) => e.userId === userId);
}

/** True when the server has settled this confirm for good: retrying can't help. */
export function isFinalConfirmFailure(err: unknown): boolean {
  const code = apiServerErrorCode(err);
  return code === "PAYMENT_NOT_VERIFIED" || code === "UNKNOWN_PACK" || code === "VALIDATION_ERROR";
}

/**
 * Confirm a charge with the server, keeping it remembered until the server
 * has it. The one confirm path the buy flow and the resume-on-load use.
 */
export async function confirmRememberedTokenPack(
  entry: Omit<UnconfirmedTokenPack, "savedAt">,
): Promise<ConfirmTokenPackResultDTO> {
  rememberUnconfirmedTokenPack(entry);
  try {
    const result = await tokenPackService.confirm(entry.packId, entry.transactionId);
    forgetUnconfirmedTokenPack(entry.transactionId);
    return result;
  } catch (err) {
    if (isFinalConfirmFailure(err)) forgetUnconfirmedTokenPack(entry.transactionId);
    throw err;
  }
}

/** Re-send every confirm this browser still holds for `userId`. Returns the
 *  results that the server accepted (credited or pending on its side). */
export async function resumePendingTokenPackConfirms(userId: string): Promise<ConfirmTokenPackResultDTO[]> {
  const results: ConfirmTokenPackResultDTO[] = [];
  for (const entry of listUnconfirmedTokenPacks(userId)) {
    try {
      results.push(await confirmRememberedTokenPack(entry));
    } catch {
      /* kept (unless final) for the next visit */
    }
  }
  return results;
}
