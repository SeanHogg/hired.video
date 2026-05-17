/**
 * Thin re-export — the canonical Gmail connector lives in
 * `shared/email-providers/gmail.ts` and is consumed by both the
 * server-side cron sweep and the client-driven PWA orchestrator. See
 * the shared module's docstring for the algorithm.
 */
export { gmailProvider } from "../../../../../shared/email-providers/gmail.js";
