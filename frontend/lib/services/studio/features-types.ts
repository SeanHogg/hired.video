// Studio feature DTO types (captions, recording, coaching, ATS, interviews,
// skills demos, voice clones, async interviews) — split out of
// studio-features-service.ts, which re-exports everything here.

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface TTSVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url?: string;
}

export interface TTSResult {
  id: string;
  audioUrl: string | null;
  durationMs: number;
  wordTimestamps: WordTimestamp[];
  status: string;
}

export interface TTSAllResult {
  results: Array<{
    sceneId: string;
    audioUrl: string | null;
    durationMs: number;
    wordTimestamps: WordTimestamp[];
  }>;
}

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

export interface CaptionResult {
  id: string;
  cues: CaptionCue[];
  srtContent: string;
  vttContent: string;
  style: string;
}

export interface DeliveryCoachingResult {
  id: string;
  overallScore: number;
  pacingWpm: number;
  pacingScore: number;
  fillerWords: Array<{ word: string; count: number; timestamps: number[] }>;
  fillerScore: number;
  energyScore: number;
  clarityScore: number;
  suggestions: Array<{ type: string; message: string }>;
}

export interface ATSPackage {
  id: string;
  slug: string;
  pageUrl: string;
  textSummary: string;
  emailTemplate: string;
}

export interface InterviewQuestion {
  id: string;
  category: string;
  difficulty: string;
  question: string;
  framework: string | null;
  tips: string[];
  industry: string | null;
}

export interface InterviewSession {
  id: string;
  questionId: string;
  talkingPoints: string[];
  recordingId?: string;
  coachingId?: string;
  answer?: string;
  aiScore?: number;
  aiFeedback?: { content: string; delivery: string; structure: string };
  isPublic: boolean;
}

export interface SkillsDemo {
  id: string;
  skillName: string;
  template: string;
  title: string;
  description?: string;
  projectUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  durationMs?: number;
  isPublic: boolean;
}

export interface SkillsDemoScript {
  title: string;
  sections: Array<{
    heading: string;
    duration_sec: number;
    teleprompter_text: string;
    screen_instruction: string;
  }>;
  total_duration_sec: number;
}

export interface VoiceClone {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  provider: string; // 'vibevoice' | 'kokoro' | 'piper' | 'web-speech'
  sampleAudioUrl?: string | null;
  sampleAudioKey?: string | null;
  previewAudioUrl?: string | null;
  previewAudioKey?: string | null;
  status: "ready" | "failed" | string;
  visibility: "private" | "unlisted" | "public";
  listingSlug?: string | null;
  priceCents: number;
  currency: string;
  platformFeeBps: number;
  language?: string | null;
  gender?: "male" | "female" | "nonbinary" | null;
  accent?: string | null;
  consentAgreedAt?: string | null;
  playCount: number;
  purchaseCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Voice clone the caller can use right now (owned or licensed). */
export interface LicensedVoice {
  id: string;
  name: string;
  description: string | null;
  sampleAudioUrl: string | null;
  previewAudioUrl: string | null;
  language: string | null;
  gender: string | null;
  accent: string | null;
  licenseSource: "owner" | "free" | "purchase";
  isOwner: boolean;
}

export interface VoiceCloneMarketplaceItem {
  id: string;
  name: string;
  description: string | null;
  previewAudioUrl: string | null;
  priceCents: number;
  currency: string;
  language: string | null;
  gender: string | null;
  accent: string | null;
  listingSlug: string | null;
  playCount: number;
  purchaseCount: number;
  createdAt: string;
  creatorId: string;
}

export interface VoiceCloneMarketplaceResponse {
  items: VoiceCloneMarketplaceItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface AsyncInterview {
  id: string;
  title: string;
  instructions?: string;
  questions: Array<{
    id: string;
    text: string;
    maxDurationSec: number;
    required: boolean;
  }>;
  deadline?: string;
  status: string;
  inviteToken?: string;
  inviteUrl?: string;
}

/** One candidate response row from
 *  `GET /api/studio/async-interview/:id/responses` (the fields the UI reads). */
export interface AsyncInterviewResponseView {
  id?: string;
  durationMs?: number;
  videoUrl?: string;
  transcription?: string;
}

/** `GET /api/studio/async-interview/:id/responses` payload. */
export interface AsyncInterviewResponsesResult {
  interview: AsyncInterview;
  responses: AsyncInterviewResponseView[];
}

// VideoAnalytics + getVideoAnalytics removed — subsumed by the
// polymorphic `GET /api/analytics/artifacts/video/:id` endpoint and
// `fetchArtifactAnalytics` in artifact-view-service.ts (Gap Register
// #1019 L3). The legacy `/api/studio/analytics/projects/:id` endpoint
// stays mounted server-side during the bake window for any out-of-tree
// consumer; remove it in a follow-up gap.
