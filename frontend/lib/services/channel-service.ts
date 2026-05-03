/**
 * Channel + profileMode service — single client-side surface that
 * wraps `/api/channels/*`. Every channel page consumer (the public
 * /u/:handle route, the user's own profile-mode setting toggle, the
 * YouTube ingest input) routes through here. Per the standing DRY
 * rule, no caller fetches /api/channels manually.
 */

import { apiClient } from "../api-client";

export type ProfileMode = "resume" | "channel";
export type ProfileModeSetting = "resume" | "channel" | "auto";

export interface YoutubeIngest {
  id: string;
  userId: string;
  youtubeVideoId: string;
  sourceUrl: string;
  title: string | null;
  thumbnailUrl: string | null;
  channelName: string | null;
  channelUrl: string | null;
  durationSec: number | null;
  displayOrder: number;
  isHidden: boolean;
  ingestedAt: string;
}

export interface NativeVideoSummary {
  id: string;
  title: string | null;
  thumbnailUrl: string | null;
  r2Key: string | null;
  duration: number | null;
  createdAt: string;
}

export interface ChannelPayload {
  user: { id: string; handle: string | null; name: string };
  mode: ProfileMode;
  modeSetting: ProfileModeSetting;
  modeAuto: boolean;
  signals: { publicVideoCount: number; totalViews: number; followerCount: number };
  nativeVideos: NativeVideoSummary[];
  youtubeIngests: YoutubeIngest[];
}

export const channelService = {
  getByHandle(handle: string) {
    return apiClient.get<ChannelPayload>(`/api/channels/${encodeURIComponent(handle)}`);
  },
  listMyIngests() {
    return apiClient.get<YoutubeIngest[]>("/api/channels/me/youtube");
  },
  ingestUrl(url: string) {
    return apiClient.post<{ ingest: YoutubeIngest; alreadyImported: boolean }>(
      "/api/channels/me/youtube",
      { url },
    );
  },
  setIngestHidden(id: string, hidden: boolean) {
    return apiClient.patch<{ ok: true }>(
      `/api/channels/me/youtube/${id}`,
      { hidden },
    );
  },
  deleteIngest(id: string) {
    return apiClient.delete<{ ok: true }>(`/api/channels/me/youtube/${id}`);
  },
  setProfileMode(mode: ProfileModeSetting) {
    return apiClient.patch<{
      mode: ProfileMode;
      setting: ProfileModeSetting;
      auto: boolean;
      signals: { publicVideoCount: number; totalViews: number; followerCount: number };
    }>("/api/channels/me/profile-mode", { profileMode: mode });
  },
};
