// Voice clone marketplace endpoints — re-exported by
// studio-features-service.ts.
import { apiClient } from "../../api-client";
import type {
  LicensedVoice,
  VoiceClone,
  VoiceCloneMarketplaceItem,
  VoiceCloneMarketplaceResponse,
} from "./features-types";

// ─── Voice Clone Marketplace ────────────────────────────────────────────────

/** List the caller's own voice clones (owner view). */
export async function getVoiceClones(): Promise<VoiceClone[]> {
  const res = await apiClient.get<VoiceClone[]>("/api/studio/voice-clones");
  return res.data;
}

/** Every voice clone the caller can synthesize with right now. */
export async function getLicensedVoices(): Promise<LicensedVoice[]> {
  const res = await apiClient.get<LicensedVoice[]>("/api/studio/voice-clones/library");
  return res.data;
}

/** Browse the public voice marketplace. */
export async function getVoiceCloneMarketplace(params?: {
  search?: string;
  language?: string;
  gender?: string;
  sort?: "popular" | "newest" | "price_asc" | "price_desc";
  page?: number;
  limit?: number;
}): Promise<VoiceCloneMarketplaceResponse> {
  const qs = new URLSearchParams();
  if (params?.search) qs.set("search", params.search);
  if (params?.language) qs.set("language", params.language);
  if (params?.gender) qs.set("gender", params.gender);
  if (params?.sort) qs.set("sort", params.sort);
  if (params?.page) qs.set("page", String(params.page));
  if (params?.limit) qs.set("limit", String(params.limit));
  const res = await apiClient.get<VoiceCloneMarketplaceResponse>(
    `/api/studio/voice-clones/marketplace${qs.toString() ? `?${qs}` : ""}`,
  );
  return res.data;
}

/** Every public voice clone authored by a specific creator. Used by the
 *  public profile (Voice tab) to surface the creator's catalogue without
 *  the search/pagination chrome of the global marketplace. */
export async function getVoiceClonesByCreator(userId: string): Promise<VoiceCloneMarketplaceItem[]> {
  const res = await apiClient.get<{ items: VoiceCloneMarketplaceItem[] }>(
    `/api/studio/voice-clones/public/by-user/${userId}`,
    undefined,
    { suppressErrorEvent: true },
  );
  return res.data?.items ?? [];
}

export async function createVoiceClone(params: {
  name: string;
  audioFile: File;
  description?: string;
  language?: string;
  gender?: "male" | "female" | "nonbinary";
  accent?: string;
}): Promise<VoiceClone> {
  const formData = new FormData();
  formData.append("name", params.name);
  formData.append("audio", params.audioFile);
  if (params.description) formData.append("description", params.description);
  if (params.language) formData.append("language", params.language);
  if (params.gender) formData.append("gender", params.gender);
  if (params.accent) formData.append("accent", params.accent);
  const res = await apiClient.post<VoiceClone>("/api/studio/voice-clones", formData);
  return res.data;
}

export async function updateVoiceClone(id: string, patch: {
  name?: string;
  description?: string | null;
  language?: string | null;
  gender?: "male" | "female" | "nonbinary" | null;
  accent?: string | null;
  visibility?: "private" | "unlisted" | "public";
  priceCents?: number;
  currency?: "USD";
  consentAccepted?: boolean;
  previewAudioBase64?: string;
  previewAudioMime?: string;
}): Promise<VoiceClone> {
  const res = await apiClient.patch<VoiceClone>(`/api/studio/voice-clones/${id}`, patch);
  return res.data;
}

export async function deleteVoiceClone(id: string): Promise<void> {
  await apiClient.delete(`/api/studio/voice-clones/${id}`);
}

/** Claim a free public listing (grants a 'free' license). */
export async function claimVoiceClone(id: string): Promise<void> {
  await apiClient.post(`/api/studio/voice-clones/${id}/claim`, {});
}

/** Pre-flight check before adding a paid voice clone to the cart. */
export async function checkoutVoiceClone(id: string): Promise<{
  cartLine: {
    type: "voice_clone";
    voiceCloneId: string;
    name: string;
    priceCents: number;
    currency: string;
    creatorId: string;
    platformFeeBps: number;
  };
}> {
  const res = await apiClient.post<{ cartLine: any }>(
    `/api/studio/voice-clones/${id}/checkout`,
    {},
  );
  return res.data;
}

/** Finalize a cart of voice clone purchases. */
export async function finalizeVoiceCloneCart(params: {
  items: Array<{ voiceCloneId: string; expectedPriceCents: number }>;
  paymentRef?: string;
}): Promise<{ granted: Array<{ voiceCloneId: string; source: string }> }> {
  const res = await apiClient.post<{ granted: Array<{ voiceCloneId: string; source: string }> }>(
    "/api/studio/voice-clones/cart-checkout",
    params,
  );
  return res.data;
}
