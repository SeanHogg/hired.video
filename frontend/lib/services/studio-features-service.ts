/**
 * Studio Features Service — frontend API client for all new studio capabilities.
 *
 * Covers: TTS, captions, LinkedIn, webcam recording, delivery coaching,
 * ATS packages, interview practice, skills demos, voice cloning,
 * async interviews, and advanced analytics.
 */

import { apiClient } from "../api-client";

// ─── Types ──────────────────────────────────────────────────────────────────

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
  name: string;
  externalVoiceId?: string;
  sampleAudioUrl?: string;
  status: string;
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

export interface VideoAnalytics {
  totalViews: number;
  avgWatchTimeSec: number;
  avgPercentWatched: number;
  heatmap: number[];
  topDropOffSecond: number | null;
  viewers: Array<{
    id: string;
    email?: string;
    company?: string;
    lastViewed: string;
    views: number;
    avgPercent: number;
  }>;
}

// ─── TTS ────────────────────────────────────────────────────────────────────

export async function getTTSVoices(): Promise<TTSVoice[]> {
  const res = await apiClient.get<{ voices: TTSVoice[] }>("/api/studio/tts/voices");
  return res.data.voices;
}

export async function generateTTS(params: {
  text: string;
  voiceId?: string;
  voiceName?: string;
  projectId?: string;
  sceneId?: string;
  speed?: number;
}): Promise<TTSResult> {
  const res = await apiClient.post<TTSResult>("/api/studio/tts/generate", params);
  return res.data;
}

export async function generateTTSAll(params: {
  scenes: Array<{ sceneId: string; text: string }>;
  voiceId?: string;
  voiceName?: string;
  projectId?: string;
  speed?: number;
}): Promise<TTSAllResult> {
  const res = await apiClient.post<TTSAllResult>("/api/studio/tts/generate-all", params);
  return res.data;
}

// ─── Captions ───────────────────────────────────────────────────────────────

export async function generateCaptions(params: {
  projectId: string;
  wordTimestamps: WordTimestamp[];
  style?: "standard" | "bold-pop" | "word-by-word" | "lower-thirds";
  language?: string;
  wordsPerCue?: number;
}): Promise<CaptionResult> {
  const res = await apiClient.post<CaptionResult>("/api/studio/captions/generate", params);
  return res.data;
}

export async function getCaptions(projectId: string): Promise<CaptionResult | null> {
  const res = await apiClient.get<CaptionResult | null>(`/api/studio/captions/${projectId}`);
  return res.data;
}

// ─── LinkedIn ───────────────────────────────────────────────────────────────

export async function getLinkedInAuthUrl(): Promise<{ url: string; state: string }> {
  const res = await apiClient.get<{ url: string; state: string }>("/api/studio/linkedin/auth-url");
  return res.data;
}

export async function linkedInCallback(code: string, redirectUri: string): Promise<{ linkedinId: string; displayName: string }> {
  const res = await apiClient.post<{ linkedinId: string; displayName: string }>("/api/studio/linkedin/callback", { code, redirectUri });
  return res.data;
}

export async function getLinkedInAccounts(): Promise<Array<{ id: string; linkedinId: string; displayName: string; isActive: boolean }>> {
  const res = await apiClient.get<Array<{ id: string; linkedinId: string; displayName: string; isActive: boolean }>>("/api/studio/linkedin/accounts");
  return res.data;
}

export async function publishToLinkedIn(params: {
  linkedinAccountId: string;
  projectId: string;
  text: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
}): Promise<{ uploadUrl: string; videoUrn: string; accessToken: string }> {
  const res = await apiClient.post<{ uploadUrl: string; videoUrn: string; accessToken: string }>("/api/studio/linkedin/publish", params);
  return res.data;
}

export async function createLinkedInPost(params: {
  linkedinAccountId: string;
  videoUrn: string;
  text: string;
  visibility?: "PUBLIC" | "CONNECTIONS";
}): Promise<{ postId: string }> {
  const res = await apiClient.post<{ postId: string }>("/api/studio/linkedin/post", params);
  return res.data;
}

// ─── Recording ──────────────────────────────────────────────────────────────

export async function uploadRecording(
  file: File,
  type: "webcam" | "screen" | "screen+webcam",
  projectId?: string,
  durationMs?: number,
): Promise<{ id: string; videoUrl: string | null }> {
  const formData = new FormData();
  formData.append("video", file);
  formData.append("type", type);
  if (projectId) formData.append("projectId", projectId);
  if (durationMs) formData.append("durationMs", String(durationMs));

  const res = await apiClient.post<{ id: string; videoUrl: string | null }>("/api/studio/recording/upload", formData);
  return res.data;
}

export async function transcribeRecording(
  recordingId: string,
  audioFile: File,
): Promise<{ text: string; language: string; durationSec: number; words: WordTimestamp[] }> {
  const formData = new FormData();
  formData.append("audio", audioFile);
  const res = await apiClient.post<{ text: string; language: string; durationSec: number; words: WordTimestamp[] }>(
    `/api/studio/recording/${recordingId}/transcribe`,
    formData,
  );
  return res.data;
}

// ─── Delivery Coaching ──────────────────────────────────────────────────────

export async function analyzeDelivery(params: {
  recordingId: string;
  projectId?: string;
  words: WordTimestamp[];
  totalDurationSec: number;
  scriptText?: string;
  transcribedText?: string;
}): Promise<DeliveryCoachingResult> {
  const res = await apiClient.post<DeliveryCoachingResult>("/api/studio/coaching/analyze", params);
  return res.data;
}

export async function getCoachingResults(recordingId: string): Promise<DeliveryCoachingResult | null> {
  const res = await apiClient.get<DeliveryCoachingResult | null>(`/api/studio/coaching/${recordingId}`);
  return res.data;
}

// ─── ATS Package ────────────────────────────────────────────────────────────

export async function generateATSPackage(params: {
  projectId: string;
  candidateName: string;
  headline?: string;
  linkedinUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  scriptText: string;
}): Promise<ATSPackage> {
  const res = await apiClient.post<ATSPackage>("/api/studio/ats/generate", params);
  return res.data;
}

// ─── Interview Practice ─────────────────────────────────────────────────────

export async function getInterviewQuestions(filters?: {
  category?: string;
  difficulty?: string;
  industry?: string;
}): Promise<InterviewQuestion[]> {
  const params = new URLSearchParams();
  if (filters?.category) params.set("category", filters.category);
  if (filters?.difficulty) params.set("difficulty", filters.difficulty);
  if (filters?.industry) params.set("industry", filters.industry);
  const qs = params.toString();
  const res = await apiClient.get<InterviewQuestion[]>(`/api/studio/interview/questions${qs ? `?${qs}` : ""}`);
  return res.data;
}

export async function seedInterviewQuestions(): Promise<{ seeded: number }> {
  const res = await apiClient.post<{ seeded: number }>("/api/studio/interview/questions/seed", {});
  return res.data;
}

export async function startInterviewSession(params: {
  questionId: string;
  resumeText?: string;
}): Promise<InterviewSession> {
  const res = await apiClient.post<InterviewSession>("/api/studio/interview/session", params);
  return res.data;
}

export async function updateInterviewSession(
  sessionId: string,
  updates: Partial<{ recordingId: string; coachingId: string; answer: string; isPublic: boolean }>,
): Promise<InterviewSession> {
  const res = await apiClient.patch<InterviewSession>(`/api/studio/interview/session/${sessionId}`, updates);
  return res.data;
}

export async function getInterviewSessions(): Promise<InterviewSession[]> {
  const res = await apiClient.get<InterviewSession[]>("/api/studio/interview/sessions");
  return res.data;
}

// ─── Skills Demos ───────────────────────────────────────────────────────────

export async function createSkillsDemo(params: {
  skillName: string;
  template?: "general" | "code-walkthrough" | "design-portfolio" | "data-analysis";
  title: string;
  description?: string;
  projectUrl?: string;
  recordingId?: string;
  projectId?: string;
}): Promise<SkillsDemo> {
  const res = await apiClient.post<SkillsDemo>("/api/studio/skills-demo", params);
  return res.data;
}

export async function updateSkillsDemo(
  id: string,
  updates: Partial<{ videoUrl: string; thumbnailUrl: string; durationMs: number; isPublic: boolean; title: string; description: string }>,
): Promise<SkillsDemo> {
  const res = await apiClient.patch<SkillsDemo>(`/api/studio/skills-demo/${id}`, updates);
  return res.data;
}

export async function getSkillsDemos(): Promise<SkillsDemo[]> {
  const res = await apiClient.get<SkillsDemo[]>("/api/studio/skills-demos");
  return res.data;
}

export async function getUserSkillsDemos(userId: string): Promise<SkillsDemo[]> {
  const res = await apiClient.get<SkillsDemo[]>(`/api/studio/skills-demos/user/${userId}`);
  return res.data;
}

export async function generateSkillsDemoScript(params: {
  skillName: string;
  template: "general" | "code-walkthrough" | "design-portfolio" | "data-analysis";
  projectUrl?: string;
  projectDescription?: string;
  resumeText?: string;
}): Promise<SkillsDemoScript> {
  const res = await apiClient.post<SkillsDemoScript>("/api/studio/skills-demo/generate-script", params);
  return res.data;
}

// ─── Voice Cloning ──────────────────────────────────────────────────────────

export async function getVoiceClones(): Promise<VoiceClone[]> {
  const res = await apiClient.get<VoiceClone[]>("/api/studio/voice-clones");
  return res.data;
}

export async function createVoiceClone(name: string, audioFile: File, description?: string): Promise<VoiceClone> {
  const formData = new FormData();
  formData.append("name", name);
  formData.append("audio", audioFile);
  if (description) formData.append("description", description);
  const res = await apiClient.post<VoiceClone>("/api/studio/voice-clones", formData);
  return res.data;
}

export async function deleteVoiceClone(id: string): Promise<void> {
  await apiClient.delete(`/api/studio/voice-clones/${id}`);
}

// ─── Async Interviews ───────────────────────────────────────────────────────

export async function createAsyncInterview(params: {
  title: string;
  instructions?: string;
  candidateEmail?: string;
  candidateId?: string;
  jobId?: string;
  questions: Array<{ id: string; text: string; maxDurationSec?: number; required?: boolean }>;
  deadline?: string;
}): Promise<AsyncInterview & { inviteUrl: string }> {
  const res = await apiClient.post<AsyncInterview & { inviteUrl: string }>("/api/studio/async-interview", params);
  return res.data;
}

export async function getAsyncInterviewInvite(token: string): Promise<AsyncInterview> {
  const res = await apiClient.get<AsyncInterview>(`/api/studio/async-interview/invite/${token}`);
  return res.data;
}

export async function submitAsyncResponse(interviewId: string, params: {
  questionId: string;
  recordingId?: string;
  videoUrl?: string;
  transcription?: string;
  durationMs?: number;
}): Promise<void> {
  await apiClient.post(`/api/studio/async-interview/${interviewId}/respond`, params);
}

export async function finalizeAsyncInterview(interviewId: string): Promise<void> {
  await apiClient.post(`/api/studio/async-interview/${interviewId}/submit`, {});
}

export async function getAsyncInterviews(): Promise<AsyncInterview[]> {
  const res = await apiClient.get<AsyncInterview[]>("/api/studio/async-interviews");
  return res.data;
}

export async function getAsyncInterviewResponses(interviewId: string): Promise<{ interview: AsyncInterview; responses: any[] }> {
  const res = await apiClient.get<{ interview: AsyncInterview; responses: any[] }>(`/api/studio/async-interview/${interviewId}/responses`);
  return res.data;
}

// ─── Advanced Analytics ─────────────────────────────────────────────────────

export async function trackVideoView(params: {
  videoId: string;
  viewerId?: string;
  viewerEmail?: string;
  secondsWatched: number[];
  totalWatchTimeSec: number;
  percentWatched: number;
  dropOffSecond?: number;
  referrer?: string;
}): Promise<void> {
  await apiClient.post("/api/studio/analytics/track", {
    ...params,
    userAgent: navigator.userAgent,
  });
}

export async function getVideoAnalytics(videoId: string): Promise<VideoAnalytics> {
  const res = await apiClient.get<VideoAnalytics>(`/api/studio/analytics/${videoId}`);
  return res.data;
}

// ─── Stock Media (gap #128) ─────────────────────────────────────────────────

export type StockProvider = "unsplash" | "pexels" | "pixabay";
export type StockMediaType = "image" | "video" | "audio";

export interface StockSearchResult {
  provider: StockProvider;
  providerAssetId: string;
  mediaType: StockMediaType;
  thumbnailUrl: string;
  previewUrl: string;
  downloadUrl: string;
  width?: number;
  height?: number;
  durationMs?: number;
  title?: string;
  description?: string;
  author?: string;
  authorUrl?: string;
  licence: string;
  tags?: string[];
}

export interface StockSearchResponse {
  results: StockSearchResult[];
  page: number;
  perPage: number;
}

export interface StockPickResult {
  hash: string;
  cdnUrl: string | null;
  storageKey: string;
  mediaType: StockMediaType;
  mimeType: string;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  attribution: {
    provider: string;
    author: string | null;
    authorUrl: string | null;
    licence: string;
    sourceUrl: string;
  };
  /** "fresh" = first user to pick this asset; "provider-id" or "hash" = R2 hit avoided. */
  dedup: "provider-id" | "hash" | "fresh";
  storageBytesSaved: number;
}

export interface StockRecentItem {
  hash: string;
  cdnUrl: string | null;
  mediaType: StockMediaType;
  mimeType: string;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  title: string | null;
  author: string | null;
  licence: string | null;
  addedAt: string;
}

export async function searchStockMedia(params: {
  q: string;
  type?: StockMediaType;
  page?: number;
  perPage?: number;
}): Promise<StockSearchResponse> {
  const qs = new URLSearchParams({ q: params.q });
  if (params.type) qs.set("type", params.type);
  if (params.page) qs.set("page", String(params.page));
  if (params.perPage) qs.set("perPage", String(params.perPage));
  const res = await apiClient.get<StockSearchResponse>(`/api/studio/stock/search?${qs.toString()}`);
  return res.data;
}

export async function pickStockMedia(item: StockSearchResult & {
  projectId?: string;
  sceneId?: string;
}): Promise<StockPickResult> {
  const res = await apiClient.post<StockPickResult>("/api/studio/stock/pick", {
    provider: item.provider,
    providerAssetId: item.providerAssetId,
    downloadUrl: item.downloadUrl,
    mediaType: item.mediaType,
    title: item.title,
    description: item.description,
    author: item.author,
    authorUrl: item.authorUrl,
    licence: item.licence,
    width: item.width,
    height: item.height,
    durationMs: item.durationMs,
    tags: item.tags,
    projectId: item.projectId,
    sceneId: item.sceneId,
  });
  return res.data;
}

export async function getRecentStockMedia(limit = 20): Promise<StockRecentItem[]> {
  const res = await apiClient.get<{ recent: StockRecentItem[] }>(`/api/studio/stock/recent?limit=${limit}`);
  return res.data.recent;
}

export async function getStockMediaStats(): Promise<{
  totalPicks: number;
  uniqueAssetCount: number;
  actualBytes: number;
  naiveBytes: number;
  bytesSaved: number;
}> {
  const res = await apiClient.get<{
    totalPicks: number;
    uniqueAssetCount: number;
    actualBytes: number;
    naiveBytes: number;
    bytesSaved: number;
  }>("/api/studio/stock/stats");
  return res.data;
}

// ─── Project Versions (gap #131) ────────────────────────────────────────────

export interface ProjectVersionMeta {
  id: string;
  versionNumber: number;
  label: string | null;
  isAutosave: boolean;
  createdAt: string;
}

export interface ProjectVersionFull extends ProjectVersionMeta {
  storyboard: unknown;
}

export async function createProjectVersion(
  projectId: string,
  storyboard: unknown,
  opts: { label?: string; isAutosave?: boolean } = {},
): Promise<ProjectVersionMeta & { prunedCount: number }> {
  const res = await apiClient.post<ProjectVersionMeta & { prunedCount: number }>(
    `/api/studio/projects/${projectId}/versions`,
    { storyboard, label: opts.label, isAutosave: opts.isAutosave ?? true },
  );
  return res.data;
}

export async function listProjectVersions(projectId: string): Promise<ProjectVersionMeta[]> {
  const res = await apiClient.get<{ versions: ProjectVersionMeta[] }>(
    `/api/studio/projects/${projectId}/versions`,
  );
  return res.data.versions;
}

export async function getProjectVersion(projectId: string, versionId: string): Promise<ProjectVersionFull> {
  const res = await apiClient.get<ProjectVersionFull>(
    `/api/studio/projects/${projectId}/versions/${versionId}`,
  );
  return res.data;
}

export async function restoreProjectVersion(projectId: string, versionId: string): Promise<{
  restoredVersion: ProjectVersionMeta;
  storyboard: unknown;
}> {
  const res = await apiClient.post<{ restoredVersion: ProjectVersionMeta; storyboard: unknown }>(
    `/api/studio/projects/${projectId}/versions/${versionId}/restore`,
    {},
  );
  return res.data;
}

// ─── Video Chapters (gap #141) ──────────────────────────────────────────────

export interface VideoChapter {
  id: string;
  projectId: string;
  title: string;
  startSeconds: number;
  thumbnailUrl: string | null;
  orderIndex: number;
}

export async function getChapters(projectId: string): Promise<VideoChapter[]> {
  const res = await apiClient.get<{ chapters: VideoChapter[] }>(
    `/api/studio/projects/${projectId}/chapters`,
  );
  return res.data.chapters;
}

export async function saveChapters(
  projectId: string,
  chapters: Array<{ title: string; startSeconds: number; thumbnailUrl?: string }>,
): Promise<VideoChapter[]> {
  const res = await apiClient.post<{ chapters: VideoChapter[] }>(
    `/api/studio/projects/${projectId}/chapters`,
    { chapters, replace: true },
  );
  return res.data.chapters;
}

export async function updateChapter(
  id: string,
  patch: { title?: string; startSeconds?: number; thumbnailUrl?: string | null },
): Promise<VideoChapter> {
  const res = await apiClient.patch<VideoChapter>(`/api/studio/chapters/${id}`, patch);
  return res.data;
}

export async function deleteChapter(id: string): Promise<void> {
  await apiClient.delete(`/api/studio/chapters/${id}`);
}

export async function getChaptersAsYoutubeText(projectId: string): Promise<{ text: string; count: number }> {
  const res = await apiClient.get<{ text: string; count: number }>(
    `/api/studio/projects/${projectId}/chapters/youtube`,
  );
  return res.data;
}

// ─── AI Script Rewriter (gap #144) ──────────────────────────────────────────

export type ScriptRewriteMode = "shorten" | "lengthen" | "tone" | "persona";
export type ScriptRewriteTone = "professional" | "conversational" | "enthusiastic" | "executive";
export type ScriptRewritePersona = "job-seeker" | "recruiter" | "company-promo" | "personal-brand";

export interface ScriptRewriteResult {
  mode: ScriptRewriteMode;
  sceneCount: number;
  storyboard: { scenes: Array<Record<string, unknown>> };
}

export async function rewriteScript(params: {
  projectId: string;
  storyboard: unknown;
  mode: ScriptRewriteMode;
  targetSeconds?: number;
  tone?: ScriptRewriteTone;
  persona?: ScriptRewritePersona;
  instructions?: string;
}): Promise<ScriptRewriteResult> {
  const { projectId, ...body } = params;
  const res = await apiClient.post<ScriptRewriteResult>(
    `/api/studio/projects/${projectId}/script/rewrite`,
    body,
  );
  return res.data;
}

// ─── In-Video Lead Forms (gap #140) ─────────────────────────────────────────

export type VideoFormFieldType = "email" | "text" | "tel" | "select";
export interface VideoFormField {
  key: string;
  label: string;
  type: VideoFormFieldType;
  required: boolean;
  options?: string[];
}

export interface VideoForm {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  positionSeconds: number;
  fields: VideoFormField[];
  requireToContinue: boolean;
  redirectUrl: string | null;
  submitButtonText: string;
  isActive: boolean;
}

export async function listVideoForms(projectId: string): Promise<VideoForm[]> {
  const res = await apiClient.get<{ forms: VideoForm[] }>(`/api/studio/projects/${projectId}/forms`);
  return res.data.forms;
}

export async function createVideoForm(projectId: string, form: Omit<VideoForm, "id" | "projectId" | "isActive">): Promise<VideoForm> {
  const res = await apiClient.post<VideoForm>(`/api/studio/projects/${projectId}/forms`, form);
  return res.data;
}

export async function updateVideoForm(id: string, patch: Partial<Omit<VideoForm, "id" | "projectId" | "fields">>): Promise<VideoForm> {
  const res = await apiClient.patch<VideoForm>(`/api/studio/forms/${id}`, patch);
  return res.data;
}

export async function deleteVideoForm(id: string): Promise<void> {
  await apiClient.delete(`/api/studio/forms/${id}`);
}

export async function getPublicVideoForms(videoId: string): Promise<VideoForm[]> {
  const res = await apiClient.get<{ forms: VideoForm[] }>(`/api/studio/videos/${videoId}/forms/public`);
  return res.data.forms;
}

export async function submitVideoForm(formId: string, params: {
  answers: Record<string, string>;
  timestampSec?: number;
  videoId?: string;
}): Promise<{ id: string; redirectUrl: string | null }> {
  const res = await apiClient.post<{ id: string; redirectUrl: string | null }>(
    `/api/studio/forms/${formId}/submit`,
    params,
  );
  return res.data;
}

export async function getVideoFormSubmissions(formId: string): Promise<{
  submissions: Array<{
    id: string;
    viewerEmail: string | null;
    viewerName: string | null;
    answers: Record<string, string>;
    timestampSec: number | null;
    createdAt: string;
  }>;
  total: number;
}> {
  const res = await apiClient.get<{
    submissions: Array<{
      id: string;
      viewerEmail: string | null;
      viewerName: string | null;
      answers: Record<string, string>;
      timestampSec: number | null;
      createdAt: string;
    }>;
    total: number;
  }>(`/api/studio/forms/${formId}/submissions`);
  return res.data;
}

// ─── Review Comments + Share Links (gap #145) ───────────────────────────────

export interface ReviewComment {
  id: string;
  projectId: string;
  parentId: string | null;
  authorUserId: string | null;
  authorName: string;
  authorEmail: string | null;
  body: string;
  timestampSec: number | null;
  resolved: boolean;
  createdAt: string;
}

export interface ReviewLink {
  id: string;
  projectId: string;
  shareToken: string;
  name: string | null;
  expiresAt: string | null;
  isActive: boolean;
}

export async function createReviewLink(projectId: string, opts: { name?: string; expiresInDays?: number } = {}): Promise<ReviewLink> {
  const res = await apiClient.post<ReviewLink>(`/api/studio/projects/${projectId}/review-links`, opts);
  return res.data;
}

export async function listReviewLinks(projectId: string): Promise<ReviewLink[]> {
  const res = await apiClient.get<{ links: ReviewLink[] }>(`/api/studio/projects/${projectId}/review-links`);
  return res.data.links;
}

export async function deleteReviewLink(id: string): Promise<void> {
  await apiClient.delete(`/api/studio/review-links/${id}`);
}

export async function getProjectComments(projectId: string): Promise<ReviewComment[]> {
  const res = await apiClient.get<{ comments: ReviewComment[] }>(`/api/studio/projects/${projectId}/comments`);
  return res.data.comments;
}

export async function postProjectComment(projectId: string, params: {
  body: string;
  timestampSec?: number | null;
  parentId?: string | null;
}): Promise<ReviewComment> {
  const res = await apiClient.post<ReviewComment>(`/api/studio/projects/${projectId}/comments`, params);
  return res.data;
}

export async function resolveComment(id: string, resolved: boolean): Promise<ReviewComment> {
  const res = await apiClient.patch<ReviewComment>(`/api/studio/comments/${id}`, { resolved });
  return res.data;
}

export async function deleteComment(id: string): Promise<void> {
  await apiClient.delete(`/api/studio/comments/${id}`);
}

export async function getPublicReview(shareToken: string): Promise<{
  projectId: string;
  project: { id: string; status: string; videoId: string | null } | null;
  comments: ReviewComment[];
  linkName: string | null;
}> {
  const res = await apiClient.get<{
    projectId: string;
    project: { id: string; status: string; videoId: string | null } | null;
    comments: ReviewComment[];
    linkName: string | null;
  }>(`/api/studio/review/${shareToken}`);
  return res.data;
}

export async function postPublicReviewComment(shareToken: string, params: {
  authorName: string;
  authorEmail?: string;
  body: string;
  timestampSec?: number | null;
  parentId?: string | null;
}): Promise<ReviewComment> {
  const res = await apiClient.post<ReviewComment>(`/api/studio/review/${shareToken}/comments`, params);
  return res.data;
}

// ─── AI Thumbnails (gap #142) ───────────────────────────────────────────────

export interface ThumbnailCandidate {
  id: string;
  projectId: string;
  imageUrl: string;
  storageKey: string | null;
  sourceTimeSec: number | null;
  headlineText: string | null;
  score: number | null;
  isSelected: boolean;
  createdAt: string;
}

export async function scoreThumbnails(projectId: string, candidates: Array<{
  imageUrl: string;
  storageKey?: string;
  sourceTimeSec?: number;
}>, headlineHint?: string): Promise<ThumbnailCandidate[]> {
  const res = await apiClient.post<{ candidates: ThumbnailCandidate[] }>(
    `/api/studio/projects/${projectId}/thumbnails/score`,
    { candidates, headlineHint },
  );
  return res.data.candidates;
}

export async function listThumbnails(projectId: string): Promise<ThumbnailCandidate[]> {
  const res = await apiClient.get<{ thumbnails: ThumbnailCandidate[] }>(
    `/api/studio/projects/${projectId}/thumbnails`,
  );
  return res.data.thumbnails;
}

export async function selectThumbnail(projectId: string, thumbnailId: string): Promise<ThumbnailCandidate> {
  const res = await apiClient.patch<ThumbnailCandidate>(
    `/api/studio/projects/${projectId}/thumbnail`,
    { thumbnailId },
  );
  return res.data;
}
