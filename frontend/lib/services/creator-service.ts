import type { ComponentType } from "react";
import {
  Briefcase,
  Calendar,
  FileText,
  GraduationCap,
  LayoutTemplate,
  Mic,
  Video,
} from "lucide-react";
import { apiClient } from "@/lib/api-client";
import {
  CREATOR_PROGRAMS,
  PROGRAM_TERMS_KIND,
  type CreatorProgram,
} from "@shared/creator-programs";
import type {
  PayoutProfileDTO,
  PayoutProfileUpdateInput,
} from "@shared/payout-profile";

export { CREATOR_PROGRAMS };
export type { CreatorProgram };
export const CREATOR_PROGRAM_TERMS_KIND = PROGRAM_TERMS_KIND;

export type {
  PayoutProfileDTO,
  PayoutProfileUpdateInput,
  EntityType,
  TaxIdType,
  TaxFormType,
  PayoutProvider,
} from "@shared/payout-profile";
export {
  ENTITY_TYPES,
  TAX_ID_TYPES,
  TAX_FORM_TYPES,
  PAYOUT_PROVIDERS,
  deriveTaxFormType,
} from "@shared/payout-profile";

export const CREATOR_PROGRAM_LABEL: Record<CreatorProgram, string> = {
  video: "Video Promo",
  voice: "Voice Clone",
  services: "Services",
  articles: "Articles",
  courses: "Courses",
  templates: "Templates",
  bookings: "1:1 Sessions",
};

// SSoT for the program → icon mapping. Imported by both the owner's
// YourProgramsPanel (program toggle cards) and the public-profile tab
// strip so a label/icon redesign lands in one place.
export const CREATOR_PROGRAM_ICON: Record<CreatorProgram, ComponentType<{ className?: string }>> = {
  video: Video,
  voice: Mic,
  services: Briefcase,
  articles: FileText,
  courses: GraduationCap,
  templates: LayoutTemplate,
  bookings: Calendar,
};

// Per-program "home" — where a creator goes to actually do the work after
// enabling a program from YourProgramsPanel. Each program lives on a
// different surface; this map keeps the destination DRY across the panel,
// dashboards, and onboarding handoffs.
//
// `services` lands back on the offerings page with `#my-services` so the
// list scrolls into view (the creator is already on the page when they
// see the program card). `voice`, `articles`, and `courses` open their
// sub-tab inside the Content Creator workspace (VoiceCloneManager /
// ArticlesManagerPanel / CoursesManagerPanel — Gap #785 tracks the full
// course authoring surface).
export const CREATOR_PROGRAM_HOME: Record<CreatorProgram, string> = {
  video: "/studio",
  voice: "/services/creator/voice-clones",
  services: "/services/offerings#my-services",
  articles: "/services/creator/articles",
  courses: "/services/creator/courses",
  // Templates today reach the marketplace via /studio's "Publish as
  // Marketplace Template" flow (studio video templates) and via the resume
  // / job builders (first-party templates only — user-authored resume +
  // job templates are tracked in the gap register). The marketplace
  // category page is the closest existing landing surface for "my
  // templates" until a dedicated manager ships.
  templates: "/search?category=templates",
  bookings: "/bookings",
};

export const CREATOR_PROGRAM_DESCRIPTION: Record<CreatorProgram, string> = {
  video: "Sell promo videos and creative cuts. Escrow + revisions handled by the platform.",
  voice: "List voice clones in the marketplace. Buyers license your voice for projects.",
  services: "Offer career-coaching, resume reviews, and other services. Lead-gen inquiries land in My Services.",
  articles: "Publish long-form articles to the community feed and search. Markdown editor + AI quality review.",
  courses: "Author courses with optional certifications. Studio-built lessons + SCORM export. Sell once, earn 95%.",
  templates: "Publish resume, job, and studio templates to the marketplace. Buyers fork your designs; you earn 95% of every sale.",
  bookings: "Offer bookable 1:1 sessions (30 / 60 / 90 / 120 min). Configure availability, take payments, and let your audience self-serve a magic-link reservation.",
};

export interface CreatorProfile {
  id: string;
  userId: string;
  endedAt: string | null;
  videoActive: boolean;
  voiceActive: boolean;
  servicesActive: boolean;
  articlesActive: boolean;
  coursesActive: boolean;
  templatesActive: boolean;
  isActive: boolean;
  displayName: string | null;
  tagline: string | null;
  bio: string | null;
  categories: string[];
  languages: string[];
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

// `categories` is derived server-side from the active program flags — it is
// not accepted from clients on opt-in or profile updates.
export interface OptInInput {
  programs: CreatorProgram[];
  displayName?: string;
  tagline?: string;
  bio?: string;
  languages?: string[];
}

export interface UpdateProfileInput {
  displayName?: string;
  tagline?: string;
  bio?: string;
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

  // Payout profile (tax + payout rail) — lives under the creators namespace
  // because only creators get paid. The same endpoints back both surfaces:
  // Settings → Payouts and the CreatorWorkspace payouts card.
  async getPayoutProfile(): Promise<PayoutProfileDTO> {
    const res = await apiClient.get<PayoutProfileDTO>("/api/creators/me/payout-profile");
    return res.data;
  },

  async updatePayoutProfile(input: PayoutProfileUpdateInput): Promise<PayoutProfileDTO> {
    const res = await apiClient.patch<PayoutProfileDTO>("/api/creators/me/payout-profile", input);
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
