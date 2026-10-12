/**
 * Email Preferences Service — client for the marketing consent center. The
 * same DTO drives the public token page (from an email link) and the
 * authenticated Settings panel; only the resolution differs (token vs the
 * signed-in user's own email).
 *
 * Wire shape comes from @shared/email-consent so it can't drift from the
 * backend MarketingConsentService.
 */
import { apiClient } from "../api-client";
import type {
  EmailMarketingPreferencesDTO,
  UpdatePreferencesInput,
} from "@shared/email-consent";

const BASE = "/api/email/preferences";

class EmailPreferencesService {
  // Token-keyed (public, from an email link)
  async getByToken(token: string): Promise<EmailMarketingPreferencesDTO> {
    const res = await apiClient.get<EmailMarketingPreferencesDTO>(
      `${BASE}/token/${encodeURIComponent(token)}`,
    );
    return res.data;
  }

  async updateByToken(
    token: string,
    patch: UpdatePreferencesInput,
  ): Promise<EmailMarketingPreferencesDTO> {
    const res = await apiClient.put<EmailMarketingPreferencesDTO>(
      `${BASE}/token/${encodeURIComponent(token)}`,
      patch,
    );
    return res.data;
  }

  // Authenticated (Settings panel)
  async getMine(): Promise<EmailMarketingPreferencesDTO> {
    const res = await apiClient.get<EmailMarketingPreferencesDTO>(`${BASE}/me`);
    return res.data;
  }

  async updateMine(patch: UpdatePreferencesInput): Promise<EmailMarketingPreferencesDTO> {
    const res = await apiClient.put<EmailMarketingPreferencesDTO>(`${BASE}/me`, patch);
    return res.data;
  }
}

export const emailPreferencesService = new EmailPreferencesService();
