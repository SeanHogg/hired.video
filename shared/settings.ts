/**
 * Shared contract for the Settings endpoints (job preferences, privacy,
 * notifications). Moved out of routes/settings-handlers.ts so the settings
 * form components import from one place rather than the backend module.
 */

import { z } from "zod";

export const JobPreferencesSchema = z.object({
  desiredTitle: z.string().optional().nullable(),
  desiredLocation: z.string().optional().nullable(),
  remoteOnly: z.boolean().optional(),
  minSalaryExpectation: z.number().optional().nullable(),
  maxSalaryExpectation: z.number().optional().nullable(),
  isOpenToWork: z.boolean().optional(),
});
export type JobPreferencesInput = z.infer<typeof JobPreferencesSchema>;
