/**
 * SystemSettingsService — SuperAdmin read/write of the `system_settings`
 * key-value store (/api/admin/settings).
 */
import { getDb } from "../../db/index.js";
import { AdminMetricsRepository } from "../../repositories/adminMetricsRepository.js";

export const SystemSettingsService = {
  list(): Promise<Record<string, string | null>> {
    return new AdminMetricsRepository(getDb()).listSystemSettings();
  },

  async upsert(entries: Array<[string, string | null]>): Promise<number> {
    await new AdminMetricsRepository(getDb()).upsertSystemSettings(entries);
    return entries.length;
  },
};
