/**
 * Thin re-export — the canonical provider types live in
 * `shared/email-providers/`, which the client-driven PWA sync
 * imports directly. The server only ever consumes the wire shape
 * (`NormalisedEmail`) here, on the receive side of the ingest route.
 *
 * `NormalisedEmail.receivedAt` is an ISO 8601 string (single wire
 * shape across client + server). `ingest.ts` wraps
 * `new Date(email.receivedAt)` at the DB insert boundary.
 */

export type {
  NormalisedEmail,
  DeltaPullResult,
  ProviderAuth,
  EmailProvider,
  ClassifierInput,
} from "../../../../../shared/email-providers/index.js";
