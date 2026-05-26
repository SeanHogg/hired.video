/**
 * Professional-graph service — typed client for `/api/graph/*`.
 *
 * Closes the LinkedIn InMail gap: surfaces mutuals + 2nd-degree paths on
 * any profile and lets the viewer ask a mutual to introduce them via
 * `requestWarmIntro`, which opens a DM with the mutual carrying the
 * intro request. Target is intentionally NOT added to that conversation
 * — the mutual is the gatekeeper.
 */
import { apiClient } from "@/lib/api-client";

export interface PersonRef {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  headline: string | null;
}

export interface MutualConnectionsResult {
  fromUserId: string;
  toUserId: string;
  mutualCount: number;
  mutuals: PersonRef[];
  isDirectConnection: boolean;
}

export type Degree = 1 | 2 | "none";

export interface ConnectionPath {
  degree: Degree;
  via: PersonRef[];
}

export interface WarmIntroResult {
  conversationId: string;
  messageId: string;
}

export const graphService = {
  async mutuals(targetUserId: string): Promise<MutualConnectionsResult> {
    const res = await apiClient.get<MutualConnectionsResult>(
      `/api/graph/mutuals/${targetUserId}`,
    );
    return res.data;
  },

  async path(targetUserId: string): Promise<ConnectionPath> {
    const res = await apiClient.get<ConnectionPath>(
      `/api/graph/path/${targetUserId}`,
    );
    return res.data;
  },

  async requestIntro(input: {
    viaUserId: string;
    targetUserId: string;
    message: string;
  }): Promise<WarmIntroResult> {
    const res = await apiClient.post<WarmIntroResult>(`/api/graph/intro`, input);
    return res.data;
  },
};
