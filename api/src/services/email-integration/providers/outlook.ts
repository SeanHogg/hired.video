/**
 * Thin re-export — the canonical Outlook connector lives in
 * `shared/email-providers/outlook.ts` and is consumed by both the
 * server-side cron sweep and the client-driven PWA orchestrator. See
 * the shared module's docstring for the algorithm.
 */
export { outlookProvider } from "../../../../../shared/email-providers/outlook.js";
