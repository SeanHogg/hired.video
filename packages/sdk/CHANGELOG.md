# Changelog

All notable changes to `@seanhogg/hired-video-sdk` are documented here. This
project follows [Semantic Versioning](https://semver.org).

## 0.2.0

Partner-integration hardening — accurate types + documented contracts for the
freelance-marketplace flow. **No breaking changes to existing method signatures**
(new fields are additive; `ProfilePayload` gains fields).

### Added

- **Résumé file upload.** `uploadResume` / `create({ resume })` now accept a
  `file` (`Blob` | `File` | `ArrayBuffer` | `Uint8Array` | base64 string) plus
  `filename` / `contentType`. The SDK base64-encodes it for you. Text/JSON files
  are parsed server-side (no AI); max decoded size 256 KB. Binary PDF/DOC/DOCX
  return `UNSUPPORTED_MEDIA_TYPE` (415) for now — send extracted `rawText`.
- **Structured profile extract.** `getProfile` now returns a typed
  `profile: { skills, headline, summary, location, experience[], education[] }`
  for direct skill-prefill, plus `resumeStatus` (`ready`/`parsing`/`none`) and
  `updatedAt`.
- **Idempotent create.** `create` is idempotent on `externalUserId` and returns
  `alreadyExisted`. New `jobSeekers.getByExternalUserId(externalUserId)` maps
  your id → the Hired.Video account + connection status (post-consent
  reconciliation for `connect`).
- **Embed params.** `createEmbedToken` accepts `theme` (`auto`/`light`/`dark`)
  and `locale`; the token response echoes them and the embed URL forwards them.
- **Typed errors.** `HiredApiError.code` is now the `HiredErrorCode` union, with
  `error.isAlreadyExists` and a `HiredApiError.is(err)` type-guard.
- **Polling contract.** `getProfile` sets an `ETag` (= `updatedAt`); send
  `If-None-Match` for a `304` when unchanged.
- Full, accurate `.d.ts` for every input/output — no local mirror needed.

### Documented

- Embed token TTL (15 min, not single-use), `frame-ancestors`/allow-list
  registration, and viewer-authorization scoping.
- Claim-flow status semantics (profile/embed are populated before claim).
- Per-method scope requirements and the error-code enum.
- Résumé PII / retention: `connections.revoke` cuts off partner access but does
  not delete the job seeker's account/résumé.

### Deferred (tracked on the Hired.Video roadmap)

- Server-side PDF/DOC/DOCX text extraction (the `file` API is forward-compatible
  — the same call starts accepting those MIME types when it ships).
- Signed webhooks (`resume.updated`, `profile.updated`, `account.claimed`) — use
  the `updatedAt`/`ETag` polling contract until then.

## 0.1.1

- Released via Hired.Video CI (`publish-sdk`). No functional changes from 0.1.0.

## 0.1.0

- Initial release: `HiredClient` (`me`, `jobSeekers.create` / `uploadResume` /
  `getProfile`, `connect`, `connections.list` / `revoke`, `createEmbedToken`),
  the `mountHiredProfile` embed helper, and the `./react` `HiredProfileEmbed`.
