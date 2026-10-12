/**
 * Scheduled posts + off-platform reach — client for /api/distribution
 * (#2047 / #2048). The Distribution Hub and the Post dock's "Schedule"
 * option both create jobs through `schedule`; the analytics panel reads
 * `reach`.
 */
import { apiClient } from "@/lib/api-client";
import type {
  DistributionDestination,
  DistributionLane,
  PostMetricCounts,
  PublishJobStatus,
  PublishJobView,
} from "@shared/social-publish-jobs";
import type { TikTokPostSettings } from "@shared/tiktok-post-settings";

export interface ScheduleDestination {
  destination: DistributionDestination;
  lane: DistributionLane;
  /** The fitted cut rendered for this network before scheduling (#2045). */
  variantVideoId?: string;
  settings?: {
    tiktok?: TikTokPostSettings;
    youtube?: { privacy: "public" | "private" | "unlisted"; shorts?: boolean };
  };
  /** This destination's own caption (absent = the shared one). */
  caption?: string;
  /** This destination's own title, where the network shows one. */
  title?: string;
}

export interface ScheduleRequest {
  projectId: string;
  caption: string;
  /** ISO time; "now" is the current time (sent on the next queue run). */
  scheduledAt: string;
  destinations: ScheduleDestination[];
}

export interface ScheduleResult {
  scheduled: Array<{ id: string; destination: DistributionDestination; lane: DistributionLane }>;
  /** Destinations already queued for this video (not queued twice). */
  skipped: Array<{ destination: DistributionDestination; lane: DistributionLane }>;
}

/** One job as the Hub lists it. */
export interface PublishJob {
  id: string;
  projectId: string;
  projectTitle: string | null;
  destination: DistributionDestination;
  lane: DistributionLane;
  caption: string;
  status: PublishJobStatus;
  scheduledAt: string;
  nextAttemptAt: string;
  attempts: number;
  lastError: string | null;
  completedAt: string | null;
  externalUrl: string | null;
  /** Lane A: where the review stands (pending / published / failed / rejected). */
  promotionStatus: string | null;
  feedPostId: string | null;
}

export interface OffPlatformPost extends PostMetricCounts {
  destination: string;
  externalUrl: string | null;
  fetchedAt: string | null;
}

export interface OffPlatformReach {
  posts: OffPlatformPost[];
  totals: PostMetricCounts;
}

export const distributionService = {
  async schedule(request: ScheduleRequest): Promise<ScheduleResult> {
    const res = await apiClient.post<ScheduleResult>("/api/distribution/jobs", request);
    return res.data;
  },
  async list(view: PublishJobView): Promise<PublishJob[]> {
    const res = await apiClient.get<{ jobs: PublishJob[] }>(`/api/distribution/jobs?view=${view}`);
    return res.data.jobs;
  },
  async cancel(jobId: string): Promise<void> {
    await apiClient.post(`/api/distribution/jobs/${jobId}/cancel`, {});
  },
  async retry(jobId: string): Promise<void> {
    await apiClient.post(`/api/distribution/jobs/${jobId}/retry`, {});
  },
  /** "Mark as posted": record a post the creator uploaded themselves. */
  async markPosted(projectId: string, destination: string, url: string): Promise<{ tracksMetrics: boolean }> {
    const res = await apiClient.post<{ tracksMetrics: boolean }>(`/api/distribution/projects/${projectId}/manual-post`, {
      destination,
      url,
    });
    return res.data;
  },
  async reach(projectId: string): Promise<OffPlatformReach> {
    const res = await apiClient.get<OffPlatformReach>(`/api/distribution/projects/${projectId}/reach`);
    return res.data;
  },

  async getPostingAgentSettings(): Promise<PostingAgentSettingsDto> {
    const res = await apiClient.get<PostingAgentSettingsDto>("/api/distribution/posting-agent/settings");
    return res.data;
  },
  async savePostingAgentSettings(
    patch: Partial<Omit<PostingAgentSettingsDto, "pausedReason" | "globallyEnabled">>,
  ): Promise<PostingAgentSettingsDto> {
    const res = await apiClient.post<PostingAgentSettingsDto>("/api/distribution/posting-agent/settings", patch);
    return res.data;
  },
  async startPostingAgent(
    patch?: Partial<Omit<PostingAgentSettingsDto, "pausedReason" | "globallyEnabled">>,
  ): Promise<PostingAgentSettingsDto> {
    const res = await apiClient.post<PostingAgentSettingsDto>("/api/distribution/posting-agent/start", patch ?? {});
    return res.data;
  },
  async pausePostingAgent(): Promise<PostingAgentSettingsDto> {
    const res = await apiClient.post<PostingAgentSettingsDto>("/api/distribution/posting-agent/pause", {});
    return res.data;
  },
  async listPostingAgentDrafts(): Promise<PostingAgentDraftDto[]> {
    const res = await apiClient.get<{ drafts: PostingAgentDraftDto[] }>("/api/distribution/posting-agent/drafts");
    return res.data.drafts;
  },
  async approvePostingAgentDraft(id: string, renderVariantId?: string): Promise<void> {
    await apiClient.post(
      `/api/distribution/posting-agent/drafts/${id}/approve`,
      renderVariantId ? { renderVariantId } : {},
    );
  },
  async preparePostingAgentDraft(id: string, renderVariantId: string): Promise<void> {
    await apiClient.post(`/api/distribution/posting-agent/drafts/${id}/prepare`, { renderVariantId });
  },
  async skipPostingAgentDraft(id: string): Promise<void> {
    await apiClient.post(`/api/distribution/posting-agent/drafts/${id}/skip`, {});
  },
  async rewritePostingAgentDraft(id: string, caption?: string): Promise<{ rewritten: boolean; caption?: string }> {
    const res = await apiClient.post<{ rewritten: boolean; caption?: string }>(
      `/api/distribution/posting-agent/drafts/${id}/rewrite`,
      caption ? { caption } : {},
    );
    return res.data;
  },
  async undoPostingAgentDraft(id: string): Promise<void> {
    await apiClient.post(`/api/distribution/posting-agent/drafts/${id}/undo`, {});
  },
  async approveAllPostingAgentDrafts(): Promise<void> {
    await apiClient.post("/api/distribution/posting-agent/drafts/approve-all", {});
  },
};

export type PostingAgentCadence = "light" | "steady" | "daily";
export type PostingAgentMode = "approve" | "auto";

export interface PostingAgentSettingsDto {
  enabled: boolean;
  mode: PostingAgentMode;
  cadence: PostingAgentCadence;
  postMinute: number;
  destinations: string[];
  quietStartMinute: number;
  quietEndMinute: number;
  emailDigest: boolean;
  pausedReason: string | null;
  globallyEnabled: boolean;
}

export interface PostingAgentDraftDto {
  id: string;
  projectId: string;
  projectTitle: string | null;
  destination: string;
  lane: string;
  caption: string;
  captionSource: string | null;
  status: string;
  scheduledAt: string;
  runAt: string;
  expiresAt: string;
  createdAt: string;
  canUndo: boolean;
  postYourself?: boolean;
  renderVariantId?: string | null;
  variantKey?: string | null;
  needsClip?: boolean;
}
