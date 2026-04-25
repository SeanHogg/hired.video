import { apiClient } from "@/lib/api-client";

export type CreatorProgram = "video" | "voice" | "services";
export const CREATOR_PROGRAMS: CreatorProgram[] = ["video", "voice", "services"];

export const CREATOR_PROGRAM_TERMS_KIND: Record<CreatorProgram, string> = {
  video: "program_video_terms",
  voice: "program_voice_terms",
  services: "program_services_terms",
};

export const CREATOR_PROGRAM_LABEL: Record<CreatorProgram, string> = {
  video: "Video Promo",
  voice: "Voice Clone",
  services: "Services",
};

export const CREATOR_PROGRAM_DESCRIPTION: Record<CreatorProgram, string> = {
  video: "Sell promo videos and creative cuts. Escrow + revisions handled by the platform.",
  voice: "List voice clones in the marketplace. Buyers license your voice for projects.",
  services: "Offer career-coaching, resume reviews, and other services. Lead-gen inquiries land in My Services.",
};

export interface CreatorProfile {
  id: string;
  userId: string;
  endedAt: string | null;
  videoActive: boolean;
  voiceActive: boolean;
  servicesActive: boolean;
  isActive: boolean;
  displayName: string | null;
  tagline: string | null;
  bio: string | null;
  categories: string[];
  languages: string[];
  payoutProvider: string | null;
  payoutAccountId: string | null;
  payoutOnboardedAt: string | null;
  payoutCountry: string | null;
  payoutCurrency: string;
  defaultPriceCents: number;
  extraRevisionPriceCents: number;
  averageDeliveryDays: number | null;
  platformFeeBps: number;
  completedProjectsCount: number;
  totalEarnedCents: number;
  averageRating: number | null;
  ratingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OptInInput {
  programs: CreatorProgram[];
  displayName?: string;
  tagline?: string;
  bio?: string;
  categories?: string[];
  languages?: string[];
}

export interface UpdateProfileInput {
  displayName?: string;
  tagline?: string;
  bio?: string;
  categories?: string[];
  languages?: string[];
  defaultPriceCents?: number;
  extraRevisionPriceCents?: number;
  averageDeliveryDays?: number;
}

export const creatorService = {
  async getMine(): Promise<CreatorProfile | null> {
    const res = await apiClient.get<CreatorProfile | null>("/api/creators/me");
    return res.data ?? null;
  },

  async optIn(input: OptInInput): Promise<CreatorProfile> {
    const res = await apiClient.post<CreatorProfile>("/api/creators/opt-in", input);
    return res.data;
  },

  async updateProfile(input: UpdateProfileInput): Promise<CreatorProfile> {
    const res = await apiClient.patch<CreatorProfile>("/api/creators/me", input);
    return res.data;
  },

  async enableProgram(program: CreatorProgram): Promise<CreatorProfile> {
    const res = await apiClient.post<CreatorProfile>(`/api/creators/me/programs/${program}`, {});
    return res.data;
  },

  async disableProgram(program: CreatorProgram): Promise<CreatorProfile> {
    const res = await apiClient.delete<CreatorProfile>(`/api/creators/me/programs/${program}`);
    return res.data;
  },

  async cancel(): Promise<CreatorProfile> {
    const res = await apiClient.post<CreatorProfile>("/api/creators/me/cancel", {});
    return res.data;
  },
};

export interface LegalDocument {
  id: string;
  kind: string;
  version: string;
  title: string;
  summary: string | null;
  body: string;
  locale: string;
  isCurrent: boolean;
}

export const legalService = {
  async getCurrent(kind: string): Promise<LegalDocument | null> {
    try {
      const res = await apiClient.get<LegalDocument | null>(`/api/legal/current/${kind}`);
      return res.data ?? null;
    } catch {
      return null;
    }
  },

  async accept(documentId: string, context?: string): Promise<void> {
    await apiClient.post("/api/legal/accept", { documentId, context });
  },
};
