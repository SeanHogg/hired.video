/**
 * Active-form ids the AI tools write through (`active-form-bridge.ts`). A
 * leaf module so the surface that publishes a form (the studio's job
 * document) and the tool runner (`registry.ts`) share the id without the
 * editor importing the whole tool registry.
 */

/** The job-posting draft the `apply_job_draft` tool fills — published by the
 *  studio's job document (the retired JobCreatePage published it before). */
export const JOB_CREATE_FORM_ID = "jobs.create";
