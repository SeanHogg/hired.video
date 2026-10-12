/**
 * Campaign Service — client for the email-campaign engine. Drives both the
 * user-facing Outreach campaign list and the SuperAdmin campaign manager;
 * the only difference is the base path (`admin*` methods hit the SA route).
 *
 * Wire shape + enums come from @shared/campaigns so this can't drift from the
 * backend CampaignService.
 */
import { apiClient } from "../api-client";
import type {
  AudiencePreview,
  CampaignAudience,
  CampaignDTO,
  CampaignTemplateDTO,
  CreateCampaignInput,
  CreateTemplateInput,
  UpdateCampaignInput,
} from "@shared/campaigns";
import type { MarketingCategory } from "@shared/email-consent";

const ADMIN = "/api/admin/campaigns";

class CampaignService {
  // ── Campaigns (SuperAdmin) ────────────────────────────────────────────────
  async adminList(): Promise<CampaignDTO[]> {
    const res = await apiClient.get<CampaignDTO[]>(ADMIN);
    return res.data ?? [];
  }

  async adminGet(id: string): Promise<CampaignDTO> {
    const res = await apiClient.get<CampaignDTO>(`${ADMIN}/${id}`);
    return res.data;
  }

  async adminCreate(input: CreateCampaignInput): Promise<CampaignDTO> {
    const res = await apiClient.post<CampaignDTO>(ADMIN, input);
    return res.data;
  }

  async adminUpdate(id: string, patch: UpdateCampaignInput): Promise<CampaignDTO> {
    const res = await apiClient.patch<CampaignDTO>(`${ADMIN}/${id}`, patch);
    return res.data;
  }

  /** Schedule or send-now. Omit `scheduledAt` to send on the next cron tick. */
  async adminSchedule(id: string, scheduledAt?: string | null): Promise<CampaignDTO> {
    const res = await apiClient.post<CampaignDTO>(`${ADMIN}/${id}/schedule`, {
      scheduledAt: scheduledAt ?? null,
    });
    return res.data;
  }

  async adminPause(id: string): Promise<CampaignDTO> {
    const res = await apiClient.post<CampaignDTO>(`${ADMIN}/${id}/pause`);
    return res.data;
  }

  async adminCancel(id: string): Promise<CampaignDTO> {
    const res = await apiClient.post<CampaignDTO>(`${ADMIN}/${id}/cancel`);
    return res.data;
  }

  async previewAudience(
    audience: CampaignAudience,
    category?: MarketingCategory,
  ): Promise<AudiencePreview> {
    const res = await apiClient.post<AudiencePreview>(`${ADMIN}/audience/preview`, {
      audience,
      category,
    });
    return res.data;
  }

  // ── Templates (SuperAdmin) ────────────────────────────────────────────────
  async adminListTemplates(): Promise<CampaignTemplateDTO[]> {
    const res = await apiClient.get<CampaignTemplateDTO[]>(`${ADMIN}/templates`);
    return res.data ?? [];
  }

  async adminCreateTemplate(input: CreateTemplateInput): Promise<CampaignTemplateDTO> {
    const res = await apiClient.post<CampaignTemplateDTO>(`${ADMIN}/templates`, input);
    return res.data;
  }

  async adminUpdateTemplate(
    id: string,
    patch: Partial<CreateTemplateInput>,
  ): Promise<CampaignTemplateDTO> {
    const res = await apiClient.patch<CampaignTemplateDTO>(`${ADMIN}/templates/${id}`, patch);
    return res.data;
  }

  async adminDeleteTemplate(id: string): Promise<void> {
    await apiClient.delete(`${ADMIN}/templates/${id}`);
  }
}

export const campaignService = new CampaignService();
