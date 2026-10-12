/**
 * Native e-sign stub (#1349 Phase 4).
 *
 * Default e-sign provider when no third-party (DocuSign / Anvil / etc.)
 * is configured. Stores the signed-at timestamp directly on the
 * `placement_documents` row when the employer marks a doc as signed
 * in the UI; no third-party round-trip.
 *
 * Limitations: no audit trail, no cryptographic signature, no signer
 * identity verification. Useful for low-stakes internal docs only;
 * compliance-critical paperwork (I-9, contracts) should be wired to
 * a real provider.
 */

import type {
  ESignConnector,
  ESignEnvelopeRequest,
  ESignEnvelopeResult,
} from "./types.js";

export class NativeESignConnector implements ESignConnector {
  readonly name = "native";

  async createEnvelope(req: ESignEnvelopeRequest): Promise<ESignEnvelopeResult> {
    return {
      ok: true,
      envelopeId: `native:${req.documentId}`,
      signingUrl: undefined,            // Native flow doesn't produce a remote URL
    };
  }

  async getEnvelopeStatus(_envelopeId: string) {
    // Native docs are immediate — they're either signed on creation
    // (the employer manually marked it) or still pending.
    return { status: "pending" as const };
  }
}
