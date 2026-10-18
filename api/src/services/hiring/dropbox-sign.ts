/**
 * Dropbox Sign (HelloSign) provider for offer-letter e-signature (#13).
 * Creates an embedded signature request and fetches the signer's embedded
 * signing URL. Provider failures are logged and yield nulls — the caller
 * still marks the offer sent (stub behaviour when no key is configured).
 */
import { isDevEnvironment } from "../../utils/runtime-env.js";
import { logger } from "../../lib/logger.js";
import type { OfferLetterRow } from "../../repositories/offerLettersRepository.js";

const API_BASE = "https://api.hellosign.com/v3";

export interface EmbeddedSignatureResult {
  signatureRequestId: string | null;
  signingUrl: string | null;
}

export async function createEmbeddedOfferSignature(
  apiKey: string,
  offer: OfferLetterRow,
  signerName: string,
  signerEmail: string,
): Promise<EmbeddedSignatureResult> {
  let signatureRequestId: string | null = null;
  let signingUrl: string | null = null;
  const auth = `Basic ${btoa(apiKey + ":")}`;

  try {
    const formData: Record<string, string> = {
      test_mode: isDevEnvironment() ? "1" : "0",
      "signers[0][email_address]": signerEmail,
      "signers[0][name]": signerName,
      "signers[0][order]": "0",
      title: `Offer Letter — ${offer.jobTitle}`,
      subject: `Please sign your offer letter for ${offer.companyName}`,
      message: `Hi ${signerName}, please review and sign your offer letter for the ${offer.jobTitle} position at ${offer.companyName}.`,
      signing_redirect_url: `${process.env.FRONTEND_URL ?? "https://hired.video"}/hiring/offers/${offer.id}/signed`,
      "files[0]": offer.bodyHtml ?? `<p>Offer for ${offer.jobTitle}</p>`,
      "file_type[0]": "HTML",
      "metadata[offerId]": offer.id,
    };
    const res = await fetch(`${API_BASE}/signature_request/create_embedded`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(formData).toString(),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        signature_request?: { signature_request_id?: string; signatures?: Array<{ signature_id?: string }> };
      };
      signatureRequestId = data?.signature_request?.signature_request_id ?? null;
      const firstSig = data?.signature_request?.signatures?.[0];
      if (firstSig?.signature_id) {
        const urlRes = await fetch(`${API_BASE}/embedded/sign_url/${firstSig.signature_id}`, {
          headers: { Authorization: auth },
        });
        if (urlRes.ok) {
          const urlData = (await urlRes.json()) as { embedded?: { sign_url?: string } };
          signingUrl = urlData?.embedded?.sign_url ?? null;
        }
      }
    }
  } catch (err) {
    logger.error("[e-sign] Dropbox Sign error", err);
  }

  return { signatureRequestId, signingUrl };
}
