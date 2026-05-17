/**
 * Thin re-export — the canonical provider types live in
 * `shared/email-providers/` so the client-driven PWA sync runs the
 * SAME Gmail/Outlook code as the server-side cron sweep.
 *
 * `NormalisedEmail.receivedAt` is an ISO 8601 string here (single wire
 * shape across client + server). The server-side persistence layer
 * (`sync.ts`, `ingest.ts`) wraps `new Date(email.receivedAt)` at the
 * DB insert boundary.
 */

export type {
  NormalisedEmail,
  DeltaPullResult,
  ProviderAuth,
  EmailProvider,
  ClassifierInput,
} from "../../../../../shared/email-providers/index.js";
