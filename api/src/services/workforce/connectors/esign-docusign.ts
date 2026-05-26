/**
 * DocuSign e-sign connector (#1349 Phase 4).
 *
 * Real impl uses DocuSign's REST API v2.1 — OAuth2 JWT grant for service
 * accounts, then POST /v2.1/accounts/{accountId}/envelopes with the
 * envelope definition (template or document base64). Webhook (Connect)
 * fires on envelope-completed; that's the path that flips
 * `placement_documents.status` to `signed` and stamps `signedAt`.
 *
 * Phase-4 shipping: no-op stub. Real wiring tracked under DocuSign
 * sub-gap (#1421 follow-ups).
 *
 * Required secrets when activated:
 *   DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_ACCOUNT_ID,
 *   DOCUSIGN_PRIVATE_KEY (RSA pem), DOCUSIGN_BASE_URL.
 */

import type {
  ESignConnector,
  ESignEnvelopeRequest,
  ESignEnvelopeResult,
} from "./types.js";

export class DocuSignConnector implements ESignConnector {
  readonly name = "docusign";

  async createEnvelope(req: ESignEnvelopeRequest): Promise<ESignEnvelopeResult> {
    return {
      ok: true,
      envelopeId: `docusign-stub:${req.documentId}`,
      signingUrl: undefined,
    };
  }

  async getEnvelopeStatus(_envelopeId: string) {
    return { status: "pending" as const };
  }
}
