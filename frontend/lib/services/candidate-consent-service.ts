// candidate-consent-service.ts — client for candidate video consent
// (migration 0534): the recruiter asks, the candidate answers by a
// tokenized email link. Wire types live in @shared/candidate-video-consent.

import type {
  CandidateVideoConsent,
  CandidateVideoConsentDecision,
  PublicCandidateVideoConsent,
  RequestCandidateVideoConsentInput,
} from "@shared/candidate-video-consent";
import { apiClient } from "../api-client";

const RECRUITER_BASE = "/api/recruiter/candidate-video-consents";
const PUBLIC_BASE = "/api/public/candidate-video-consent";

export const candidateConsentService = {
  // ─── Recruiter (auth) ──────────────────────────────────────────────────────

  async requestConsent(input: RequestCandidateVideoConsentInput): Promise<CandidateVideoConsent> {
    const response = await apiClient.post<CandidateVideoConsent>(RECRUITER_BASE, input);
    return response.data;
  },

  async listConsents(projectId: string): Promise<CandidateVideoConsent[]> {
    const response = await apiClient.get<CandidateVideoConsent[]>(
      `${RECRUITER_BASE}?projectId=${encodeURIComponent(projectId)}`,
    );
    return response.data;
  },

  async resendConsent(consentId: string): Promise<CandidateVideoConsent> {
    const response = await apiClient.post<CandidateVideoConsent>(
      `${RECRUITER_BASE}/${encodeURIComponent(consentId)}/resend`,
      {},
    );
    return response.data;
  },

  // ─── Public (the candidate's link — no session needed) ─────────────────────

  async getPublicConsent(token: string): Promise<PublicCandidateVideoConsent> {
    const response = await apiClient.get<PublicCandidateVideoConsent>(
      `${PUBLIC_BASE}/${encodeURIComponent(token)}`,
    );
    return response.data;
  },

  /** approve / decline a pending ask, or `revoke` (withdraw) an approval. */
  async respond(token: string, decision: CandidateVideoConsentDecision): Promise<PublicCandidateVideoConsent> {
    const response = await apiClient.post<PublicCandidateVideoConsent>(
      `${PUBLIC_BASE}/${encodeURIComponent(token)}`,
      { decision },
    );
    return response.data;
  },
};
