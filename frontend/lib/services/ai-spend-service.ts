/**
 * SuperAdmin AI spend client — GET /api/admin/sa/ai-spend.
 * Contract: shared/ai-spend.ts.
 */
import { apiClient } from "@/lib/api-client";
import type { AiSpendReportDTO, AiSpendWindow } from "@shared/ai-spend";

export const aiSpendService = {
  async report(days: AiSpendWindow): Promise<AiSpendReportDTO> {
    const res = await apiClient.get<AiSpendReportDTO>(`/api/admin/sa/ai-spend?days=${days}`);
    return res.data;
  },
};
