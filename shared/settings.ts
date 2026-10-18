/**
 * Shared contract for Settings › Job preferences (`GET/PUT
 * /api/settings/job-preferences`). The API validates the PUT body with
 * `JobPreferencesPatchSchema` and answers with `JobPreferencesSchema` (the
 * saved state read back); the frontend settings service parses with the same
 * schema.
 *
 * Every field has exactly one home:
 *   • desiredTitle / desiredLocation / remoteOnly / min+maxSalaryExpectation
 *     → `job_preferences` (desired_title, desired_location, remote_preference,
 *       salary_min, salary_max)
 *   • preferredRoles / industries / salaryCurrency
 *     → `user_profiles` (preferred_roles, industries, salary_currency) — the
 *       single store for a person's roles/industries (mig 0631) and the
 *       currency their salary figures are in.
 * Open-to-work is NOT here: it lives on `user_profiles.open_to_work` and is
 * toggled through the profile (`useOpenToWorkToggle`).
 */

import { z } from "zod";

const listItem = z.string().trim().min(1).max(120);
const list = z.array(listItem).max(50);
const salary = z.number().nonnegative().max(100_000_000).nullable();

export const JobPreferencesSchema = z.object({
  desiredTitle: z.string().trim().max(255).nullable(),
  desiredLocation: z.string().trim().max(255).nullable(),
  remoteOnly: z.boolean(),
  minSalaryExpectation: salary,
  maxSalaryExpectation: salary,
  /** ISO 4217 code. */
  salaryCurrency: z.string().regex(/^[A-Z]{3}$/),
  preferredRoles: list,
  industries: list,
});
export type JobPreferences = z.infer<typeof JobPreferencesSchema>;

/** PUT body — any subset; omitted fields keep their stored value. */
export const JobPreferencesPatchSchema = JobPreferencesSchema.partial();
export type JobPreferencesPatch = z.infer<typeof JobPreferencesPatchSchema>;

export const DEFAULT_JOB_PREFERENCES: JobPreferences = {
  desiredTitle: null,
  desiredLocation: null,
  remoteOnly: false,
  minSalaryExpectation: null,
  maxSalaryExpectation: null,
  salaryCurrency: "USD",
  preferredRoles: [],
  industries: [],
};
