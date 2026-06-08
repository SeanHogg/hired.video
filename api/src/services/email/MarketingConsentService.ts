/**
 * MarketingConsentService — the single gate every marketing email passes
 * through (campaigns AND nurture drips). Owns the opaque unsubscribe token,
 * the preference-center reads/writes, and the send-time mailability filter
 * (hard suppression OR master opt-out OR per-category opt-out).
 *
 * Transactional email NEVER calls this. The opt-out is sticky + email-keyed;
 * the only re-subscribe path is an explicit preference update here (CAN-SPAM).
 */
import type {
  EmailConsentRepository,
  PreferenceRow,
} from "../../repositories/emailConsentRepository.js";
import {
  isCategoryMailable,
  maskEmail,
  resolveCategorySubscriptions,
  type EmailMarketingPreferencesDTO,
  type MarketingCategory,
  type UpdatePreferencesInput,
  MARKETING_CATEGORIES,
} from "../../../../shared/email-consent.js";

function getEnv(key: string): string {
  return (
    process.env[key] ||
    ((globalThis as any).__ENV?.[key] as string | undefined) ||
    ""
  );
}

function frontendBase(): string {
  const url = getEnv("FRONTEND_URL");
  return url.split(",")[0]?.trim().replace(/\/$/, "") || "https://hired.video";
}

/** 32 random bytes → base64url. Unguessable bearer credential. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

export interface FooterLinks {
  /** One-click unsubscribe-all (works without JS — CAN-SPAM). */
  unsubscribeUrl: string;
  /** Granular preference center (SPA). */
  manageUrl: string;
}

export class MarketingConsentService {
  constructor(private readonly repo: EmailConsentRepository) {}

  // ── Token + footer links ────────────────────────────────────────────────────
  /** Find-or-create the ledger row for an address, minting a token if new. */
  async getOrCreate(email: string, userId?: string | null): Promise<PreferenceRow> {
    const existing = await this.repo.findPrefByEmail(email);
    if (existing) return existing;
    return this.repo.insertPref({
      email,
      userId: userId ?? null,
      token: generateToken(),
      unsubscribedAll: false,
      categories: {},
    } as any);
  }

  async footerLinks(email: string, userId?: string | null): Promise<FooterLinks> {
    const row = await this.getOrCreate(email, userId);
    return {
      unsubscribeUrl: `${frontendBase()}/api/email/unsubscribe/${row.token}`,
      manageUrl: `${frontendBase()}/email-preferences/${row.token}`,
    };
  }

  // ── Send-time mailability ───────────────────────────────────────────────────
  /** Filter a recipient set down to who may receive `category`. Batched —
   *  two queries total regardless of recipient count (no N+1). */
  async filterMailable<T extends { email: string }>(
    recipients: T[],
    category: MarketingCategory | null,
  ): Promise<T[]> {
    if (recipients.length === 0) return [];
    const emails = recipients.map((r) => r.email);
    const [prefRows, hardSet] = await Promise.all([
      this.repo.prefsForEmails(emails),
      this.repo.hardSuppressedSet(emails),
    ]);
    const prefByEmail = new Map(prefRows.map((p) => [p.email.toLowerCase(), p]));
    return recipients.filter((r) => {
      const key = r.email.toLowerCase();
      if (hardSet.has(key)) return false;
      const pref = prefByEmail.get(key);
      if (!pref) return true; // no row = fully subscribed
      return isCategoryMailable(pref.categories, pref.unsubscribedAll, category);
    });
  }

  /** Single-address gate — used by 1:1 nurture drips (pass null category to
   *  check only the master switch + hard suppression). */
  async isMailable(email: string, category: MarketingCategory | null): Promise<boolean> {
    const [pref, hardSet] = await Promise.all([
      this.repo.findPrefByEmail(email),
      this.repo.hardSuppressedSet([email]),
    ]);
    if (hardSet.has(email.toLowerCase())) return false;
    if (!pref) return true;
    return isCategoryMailable(pref.categories, pref.unsubscribedAll, category);
  }

  // ── Preference center ───────────────────────────────────────────────────────
  async getByToken(token: string): Promise<EmailMarketingPreferencesDTO | null> {
    const row = await this.repo.findPrefByToken(token);
    return row ? this.toDTO(row) : null;
  }

  /** Authenticated Settings read — create-on-read so the panel always has a row. */
  async getByEmail(email: string, userId?: string | null): Promise<EmailMarketingPreferencesDTO> {
    const row = await this.getOrCreate(email, userId);
    return this.toDTO(row);
  }

  async updateByToken(
    token: string,
    input: UpdatePreferencesInput,
  ): Promise<EmailMarketingPreferencesDTO | null> {
    const row = await this.repo.findPrefByToken(token);
    if (!row) return null;
    return this.applyUpdate(row, input);
  }

  async updateByEmail(
    email: string,
    input: UpdatePreferencesInput,
    userId?: string | null,
  ): Promise<EmailMarketingPreferencesDTO> {
    const row = await this.getOrCreate(email, userId);
    return (await this.applyUpdate(row, input))!;
  }

  /** One-click unsubscribe-all (the no-JS email link). */
  async unsubscribeAllByToken(token: string): Promise<EmailMarketingPreferencesDTO | null> {
    return this.updateByToken(token, { unsubscribedAll: true });
  }

  // ── Internal ────────────────────────────────────────────────────────────────
  private async applyUpdate(
    row: PreferenceRow,
    input: UpdatePreferencesInput,
  ): Promise<EmailMarketingPreferencesDTO | null> {
    const now = new Date();
    const patch: Record<string, unknown> = {};

    if (input.unsubscribedAll !== undefined && input.unsubscribedAll !== row.unsubscribedAll) {
      patch.unsubscribedAll = input.unsubscribedAll;
      // Stamp the transition — `resubscribedAt` is how we prove a re-opt-in
      // was an explicit, affirmative user action (CAN-SPAM stickiness audit).
      if (input.unsubscribedAll) patch.unsubscribedAt = now;
      else patch.resubscribedAt = now;
    }

    if (input.categories) {
      // Merge only KNOWN categories onto the stored map (true = subscribe,
      // false = opt out). Unknown keys are ignored.
      const merged: Record<string, boolean> = { ...(row.categories ?? {}) };
      for (const c of MARKETING_CATEGORIES) {
        if (c in input.categories) merged[c] = input.categories[c];
      }
      patch.categories = merged;
    }

    if (Object.keys(patch).length === 0) return this.toDTO(row);
    const updated = await this.repo.updatePref(row.email, patch);
    return updated ? this.toDTO(updated) : null;
  }

  private toDTO(row: PreferenceRow): EmailMarketingPreferencesDTO {
    return {
      email: maskEmail(row.email),
      unsubscribedAll: row.unsubscribedAll,
      categories: resolveCategorySubscriptions(row.categories, row.unsubscribedAll),
      updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    };
  }
}
