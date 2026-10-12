/**
 * #978 — TikTok ad identity provisioning. Every TikTok ad is posted "as"
 * an identity; a CUSTOMIZED_USER identity (display name + avatar) is
 * owned by the advertiser account.
 *
 *   1. cached on the creative metadata for this advertiser → reuse;
 *   2. else GET /identity/get/ (CUSTOMIZED_USER) → reuse the one whose
 *      display_name matches, else the first one;
 *   3. else POST /identity/create/ with the display name.
 *
 * The id is cached as `metadata.tiktokIdentityIds[advertiserId]` (a manually
 * pasted legacy `tiktokIdentityId` is honoured for any advertiser).
 *
 * Docs: https://business-api.tiktok.com/portal/docs?id=1740218475032577 (identity/get)
 *       https://business-api.tiktok.com/portal/docs?id=1740218420379649 (identity/create)
 */

import { PaidMediaAdapterError } from "../../ports/adapter.js";

const IDENTITY_IDS_KEY = "tiktokIdentityIds";
export const DEFAULT_TIKTOK_DISPLAY_NAME = "hired.video";

export type TikTokGet = (pathWithQuery: string) => Promise<any>;
export type TikTokPostFn = (path: string, body: unknown) => Promise<any>;

export function cachedTikTokIdentityId(
  metadata: Record<string, unknown> | undefined,
  advertiserId: string,
): string | null {
  const map = metadata?.[IDENTITY_IDS_KEY];
  if (map && typeof map === "object") {
    const id = (map as Record<string, unknown>)[advertiserId];
    if (typeof id === "string" && id) return id;
  }
  const legacy = metadata?.tiktokIdentityId;
  return typeof legacy === "string" && legacy ? legacy : null;
}

export function tikTokIdentityPatch(
  metadata: Record<string, unknown> | undefined,
  advertiserId: string,
  identityId: string,
): Record<string, unknown> {
  const prev = metadata?.[IDENTITY_IDS_KEY];
  const map = prev && typeof prev === "object" ? (prev as Record<string, unknown>) : {};
  return { [IDENTITY_IDS_KEY]: { ...map, [advertiserId]: identityId } };
}

export interface EnsuredIdentity {
  identityId: string;
  /** Present when the id wasn't already cached — merge into metadata. */
  metadataPatch?: Record<string, unknown>;
  source: "cache" | "existing" | "created";
}

export async function ensureTikTokIdentity(
  get: TikTokGet,
  post: TikTokPostFn,
  args: { advertiserId: string; metadata?: Record<string, unknown> },
): Promise<EnsuredIdentity> {
  const cached = cachedTikTokIdentityId(args.metadata, args.advertiserId);
  if (cached) return { identityId: cached, source: "cache" };

  const rawName = args.metadata?.tiktokDisplayName;
  const displayName = typeof rawName === "string" && rawName.trim() ? rawName.trim().slice(0, 40) : DEFAULT_TIKTOK_DISPLAY_NAME;

  const params = new URLSearchParams({ advertiser_id: args.advertiserId, identity_type: "CUSTOMIZED_USER" });
  const listed = await get(`/identity/get/?${params.toString()}`);
  if (listed?.code !== 0) {
    throw new PaidMediaAdapterError("tiktok", "API_ERROR", `identity lookup failed: ${listed?.message ?? "unknown"}`, listed);
  }
  const identities: Array<{ identity_id?: string; display_name?: string }> = listed.data?.identity_list ?? [];
  const match = identities.find((i) => i.display_name === displayName) ?? identities[0];
  if (match?.identity_id) {
    return {
      identityId: match.identity_id,
      metadataPatch: tikTokIdentityPatch(args.metadata, args.advertiserId, match.identity_id),
      source: "existing",
    };
  }

  const created = await post("/identity/create/", { advertiser_id: args.advertiserId, display_name: displayName });
  const identityId = created?.data?.identity_id;
  if (created?.code !== 0 || typeof identityId !== "string" || !identityId) {
    throw new PaidMediaAdapterError("tiktok", "API_ERROR", `identity create failed: ${created?.message ?? "no identity_id"}`, created);
  }
  return {
    identityId,
    metadataPatch: tikTokIdentityPatch(args.metadata, args.advertiserId, identityId),
    source: "created",
  };
}
