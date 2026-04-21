/**
 * Studio Features Schema — gap-closing tables for the AI video studio.
 *
 * Covers:
 *   - TTS voiceover & voice cloning
 *   - Auto-captions
 *   - LinkedIn publishing accounts
 *   - Webcam recordings & teleprompter sessions
 *   - AI delivery coaching results
 *   - ATS-compatible output packages
 *   - Interview question library & practice sessions
 *   - Skills demonstration videos
 *   - Async employer video interview requests
 *   - Advanced per-second video analytics
 */

import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  jsonb,
  real,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// TTS Voiceover — stores generated audio per scene or full video
// ---------------------------------------------------------------------------
export const studioVoiceovers = pgTable(
  "studio_voiceovers",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    userId:      text("user_id").notNull(),
    projectId:   text("project_id"),
    sceneId:     text("scene_id"),              // null = full-video voiceover
    provider:    text("provider").notNull().default("vibevoice"), // vibevoice | kokoro | piper | web-speech
    voiceId:     text("voice_id").notNull(),     // engine-specific voice ID (web-speech voiceURI, kokoro voice key, or studioVoiceClones.id)
    voiceName:   text("voice_name"),
    text:        text("text").notNull(),          // script text spoken
    audioUrl:    text("audio_url"),               // R2/S3 URL to the generated audio
    audioKey:    text("audio_key"),               // R2/S3 key
    durationMs:  integer("duration_ms"),          // audio duration in milliseconds
    wordTimestamps: jsonb("word_timestamps"),     // Array<{word, start, end}> for captions
    status:      text("status").notNull().default("pending"), // pending | generating | ready | failed
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_voiceovers_user").on(t.userId),
    index("idx_studio_voiceovers_project").on(t.projectId),
  ],
);

// ---------------------------------------------------------------------------
// Voice Clones — user-owned voice profiles, optionally listed in the
// Voice Marketplace.
//
// The reference audio sample is stored in object storage. Synthesis happens
// 100% client-side via WebGPU TTS engines (Kokoro / Piper / VibeVoice) — the
// backend never runs a model. Listed clones become buyable items in the
// homepage media catalog and the shopping cart; non-listed clones remain
// strictly private to their owner.
// ---------------------------------------------------------------------------
export const studioVoiceClones = pgTable(
  "studio_voice_clones",
  {
    id:              uuid("id").primaryKey().defaultRandom(),
    userId:          text("user_id").notNull(),
    name:            text("name").notNull().default("My Voice"),
    description:     text("description"),
    /** Engine the sample is intended for at synthesis time. */
    provider:        text("provider").notNull().default("vibevoice"),
    /** Reference audio in object storage. */
    sampleAudioUrl:  text("sample_audio_url"),
    sampleAudioKey:  text("sample_audio_key"),
    /** Optional short pre-rendered preview, generated client-side at publish time. */
    previewAudioUrl: text("preview_audio_url"),
    previewAudioKey: text("preview_audio_key"),
    status:          text("status").notNull().default("ready"), // ready | failed
    /**
     * Marketplace fields. A clone defaults to `private` and never appears in
     * public listings unless the owner explicitly publishes it. Once
     * `visibility = 'public'`, the row becomes a listing in the homepage media
     * catalog and is buyable through the shopping cart.
     */
    visibility:      text("visibility").notNull().default("private"), // private | unlisted | public
    listingSlug:     text("listing_slug").unique(),                    // public catalog URL slug
    /** Creator-set price. 0 = free (still requires the buyer to "claim" a license). */
    priceCents:      integer("price_cents").notNull().default(0),
    currency:        text("currency").notNull().default("USD"),
    /**
     * Platform fee taken on each sale, in basis points (10000 = 100%).
     * Stored per-row so historical sales remain auditable if the global rate
     * changes. Default 500 = 5% platform fee, 95% to creator. The CC
     * processing fee is additionally charged to the buyer at checkout. The
     * per-row value is snapshotted at opt-in time from either the
     * `PLATFORM_FEE_BPS_DEFAULT` constant or the creator's personal
     * `creatorPlatformFeeBpsOverride` on the users table, whichever applies.
     */
    platformFeeBps:  integer("platform_fee_bps").notNull().default(500),
    /** Optional descriptive tags surfaced in the marketplace. */
    language:        text("language"),     // e.g. "en-US"
    gender:          text("gender"),       // "male" | "female" | "nonbinary" | null
    accent:          text("accent"),       // free-form: "british", "southern", etc.
    /**
     * Consent record. Required to publish: the creator attests this is their
     * own voice or they have rights to license it. We snapshot the user agent
     * and timestamp for auditability.
     */
    consentAgreedAt: timestamp("consent_agreed_at", { withTimezone: true }),
    consentIp:       text("consent_ip"),
    consentUa:       text("consent_ua"),
    /** Marketplace stats. */
    playCount:       integer("play_count").notNull().default(0),
    purchaseCount:   integer("purchase_count").notNull().default(0),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_voice_clones_user").on(t.userId),
    index("idx_studio_voice_clones_visibility").on(t.visibility),
    index("idx_studio_voice_clones_slug").on(t.listingSlug),
  ],
);

// ---------------------------------------------------------------------------
// Voice Clone Licenses — grants of usage rights for a voice clone.
//
// One row = "this user has the right to synthesize speech from this voice
// clone." Sources:
//   • 'owner'    — the creator of the clone (auto-granted on creation)
//   • 'free'     — buyer claimed a free public listing
//   • 'purchase' — buyer paid via the cart; granted on Stripe/Helcim webhook
// The frontend's TTS engine refuses to use a clone unless a matching row
// exists. The pair (user_id, voice_clone_id) is unique.
// ---------------------------------------------------------------------------
export const studioVoiceCloneLicenses = pgTable(
  "studio_voice_clone_licenses",
  {
    id:               uuid("id").primaryKey().defaultRandom(),
    userId:           text("user_id").notNull(),
    voiceCloneId:     uuid("voice_clone_id").notNull(),
    source:           text("source").notNull(),     // 'owner' | 'free' | 'purchase'
    pricePaidCents:   integer("price_paid_cents").notNull().default(0),
    creatorCutCents:  integer("creator_cut_cents").notNull().default(0),
    platformCutCents: integer("platform_cut_cents").notNull().default(0),
    /** Payment provider reference (Stripe payment intent or Helcim transaction). */
    paymentRef:       text("payment_ref"),
    grantedAt:        timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_voice_clone_licenses_user").on(t.userId),
    index("idx_studio_voice_clone_licenses_clone").on(t.voiceCloneId),
    index("uq_studio_voice_clone_licenses_pair").on(t.userId, t.voiceCloneId),
  ],
);

// ---------------------------------------------------------------------------
// Captions — auto-generated subtitle tracks
// ---------------------------------------------------------------------------
export const studioCaptions = pgTable(
  "studio_captions",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    userId:      text("user_id").notNull(),
    projectId:   text("project_id").notNull(),
    language:    text("language").notNull().default("en"),
    style:       text("style").notNull().default("standard"), // standard | bold-pop | word-by-word | lower-thirds
    cues:        jsonb("cues").notNull(),         // Array<{start, end, text, words?}>
    srtContent:  text("srt_content"),             // pre-rendered SRT for export
    vttContent:  text("vtt_content"),             // pre-rendered WebVTT
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_studio_captions_project").on(t.projectId)],
);

// ---------------------------------------------------------------------------
// LinkedIn Accounts — OAuth tokens for publishing to LinkedIn
// ---------------------------------------------------------------------------
export const linkedinAccounts = pgTable(
  "linkedin_accounts",
  {
    id:             uuid("id").primaryKey().defaultRandom(),
    userId:         text("user_id").notNull(),
    linkedinId:     text("linkedin_id").notNull(),  // LinkedIn member URN
    displayName:    text("display_name"),
    profileUrl:     text("profile_url"),
    accessToken:    text("access_token").notNull(),
    refreshToken:   text("refresh_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    scopes:         text("scopes"),                  // space-separated scope list
    isActive:       boolean("is_active").notNull().default(true),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_linkedin_accounts_user").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Webcam Recordings — captured clips from in-browser webcam
// ---------------------------------------------------------------------------
export const studioRecordings = pgTable(
  "studio_recordings",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    userId:      text("user_id").notNull(),
    projectId:   text("project_id"),
    type:        text("type").notNull().default("webcam"),     // webcam | screen | screen+webcam
    audioUrl:    text("audio_url"),
    videoUrl:    text("video_url"),
    videoKey:    text("video_key"),               // R2 key
    durationMs:  integer("duration_ms"),
    transcription: text("transcription"),          // auto-transcribed text
    wordTimestamps: jsonb("word_timestamps"),      // from Whisper
    metadata:    jsonb("metadata"),                // resolution, codec, etc.
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_recordings_user").on(t.userId),
    index("idx_studio_recordings_project").on(t.projectId),
  ],
);

// ---------------------------------------------------------------------------
// AI Delivery Coaching — analysis results for recorded video
// ---------------------------------------------------------------------------
export const studioDeliveryCoaching = pgTable(
  "studio_delivery_coaching",
  {
    id:             uuid("id").primaryKey().defaultRandom(),
    userId:         text("user_id").notNull(),
    recordingId:    text("recording_id").notNull(),
    projectId:      text("project_id"),
    overallScore:   integer("overall_score"),       // 0-100
    pacingWpm:      integer("pacing_wpm"),           // words per minute
    pacingScore:    integer("pacing_score"),          // 0-100
    fillerWords:    jsonb("filler_words"),            // Array<{word, timestamp, count}>
    fillerScore:    integer("filler_score"),          // 0-100
    eyeContactPct:  real("eye_contact_pct"),          // 0-1
    eyeContactScore: integer("eye_contact_score"),    // 0-100
    energyScore:    integer("energy_score"),           // 0-100 (vocal variety)
    clarityScore:   integer("clarity_score"),          // 0-100 (AI message clarity)
    suggestions:    jsonb("suggestions"),              // Array<{type, message, timestamp?}>
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_coaching_user").on(t.userId),
    index("idx_studio_coaching_recording").on(t.recordingId),
  ],
);

// ---------------------------------------------------------------------------
// ATS Output Packages — shareable link pages with text summary
// ---------------------------------------------------------------------------
export const studioAtsPackages = pgTable(
  "studio_ats_packages",
  {
    id:             uuid("id").primaryKey().defaultRandom(),
    userId:         text("user_id").notNull(),
    projectId:      text("project_id").notNull(),
    slug:           text("slug").notNull(),           // unique URL slug
    videoUrl:       text("video_url"),
    thumbnailUrl:   text("thumbnail_url"),
    candidateName:  text("candidate_name").notNull(),
    headline:       text("headline"),                  // job title / tagline
    textSummary:    text("text_summary").notNull(),    // ATS-parseable text
    emailTemplate:  text("email_template"),             // suggested email body
    linkedinUrl:    text("linkedin_url"),
    viewCount:      integer("view_count").notNull().default(0),
    isActive:       boolean("is_active").notNull().default(true),
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_ats_user").on(t.userId),
    index("idx_studio_ats_slug").on(t.slug),
  ],
);

// ---------------------------------------------------------------------------
// Interview Questions — library + user practice sessions
// ---------------------------------------------------------------------------
export const studioInterviewQuestions = pgTable(
  "studio_interview_questions",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    category:    text("category").notNull(),        // behavioral | technical | situational | company-specific
    difficulty:  text("difficulty").notNull().default("medium"), // easy | medium | hard
    question:    text("question").notNull(),
    framework:   text("framework"),                  // STAR | CAR | SOAR | null
    tips:        jsonb("tips"),                       // Array<string>
    industry:    text("industry"),                    // tech | finance | healthcare | general | null
    isDefault:   boolean("is_default").notNull().default(true), // system-provided vs user-created
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_interview_questions_category").on(t.category)],
);

export const studioInterviewSessions = pgTable(
  "studio_interview_sessions",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    userId:       text("user_id").notNull(),
    questionId:   text("question_id").notNull(),
    recordingId:  text("recording_id"),              // linked webcam recording
    coachingId:   text("coaching_id"),               // linked delivery coaching result
    talkingPoints: jsonb("talking_points"),           // AI-generated from resume
    answer:       text("answer"),                     // transcribed answer
    aiScore:      integer("ai_score"),                // 0-100 overall
    aiFeedback:   jsonb("ai_feedback"),               // {content, delivery, structure}
    isPublic:     boolean("is_public").notNull().default(false), // show on profile
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_interview_sessions_user").on(t.userId),
    index("idx_interview_sessions_question").on(t.questionId),
  ],
);

// ---------------------------------------------------------------------------
// Skills Demonstrations — screen+webcam "show your work" videos
// ---------------------------------------------------------------------------
export const studioSkillsDemos = pgTable(
  "studio_skills_demos",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    userId:       text("user_id").notNull(),
    recordingId:  text("recording_id"),
    projectId:    text("project_id"),
    skillName:    text("skill_name").notNull(),
    template:     text("template").notNull().default("general"), // general | code-walkthrough | design-portfolio | data-analysis
    title:        text("title").notNull(),
    description:  text("description"),
    projectUrl:   text("project_url"),               // GitHub / portfolio link
    videoUrl:     text("video_url"),
    thumbnailUrl: text("thumbnail_url"),
    durationMs:   integer("duration_ms"),
    isPublic:     boolean("is_public").notNull().default(false),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_skills_demos_user").on(t.userId),
    index("idx_skills_demos_skill").on(t.skillName),
  ],
);

// ---------------------------------------------------------------------------
// Async Video Interview Requests — employer sends question set to candidate
// ---------------------------------------------------------------------------
export const studioAsyncInterviews = pgTable(
  "studio_async_interviews",
  {
    id:             uuid("id").primaryKey().defaultRandom(),
    recruiterId:    text("recruiter_id").notNull(),   // employer/recruiter user ID
    candidateId:    text("candidate_id"),              // null if invite-only (by email)
    candidateEmail: text("candidate_email"),
    jobId:          text("job_id"),                    // linked job posting
    title:          text("title").notNull(),
    instructions:   text("instructions"),
    questions:      jsonb("questions").notNull(),      // Array<{id, text, maxDurationSec, required}>
    deadline:       timestamp("deadline", { withTimezone: true }),
    status:         text("status").notNull().default("pending"), // pending | in_progress | submitted | reviewed | expired
    inviteToken:    text("invite_token"),              // unique token for email invites
    createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_async_interviews_recruiter").on(t.recruiterId),
    index("idx_async_interviews_candidate").on(t.candidateId),
    index("idx_async_interviews_token").on(t.inviteToken),
  ],
);

export const studioAsyncResponses = pgTable(
  "studio_async_responses",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    interviewId:   text("interview_id").notNull(),
    candidateId:   text("candidate_id").notNull(),
    questionId:    text("question_id").notNull(),
    recordingId:   text("recording_id"),
    videoUrl:      text("video_url"),
    videoKey:      text("video_key"),
    durationMs:    integer("duration_ms"),
    transcription: text("transcription"),
    coachingId:    text("coaching_id"),
    status:        text("status").notNull().default("pending"), // pending | recorded | submitted
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_async_responses_interview").on(t.interviewId),
    index("idx_async_responses_candidate").on(t.candidateId),
  ],
);

// ---------------------------------------------------------------------------
// Advanced Video Analytics — per-second engagement heatmap
// ---------------------------------------------------------------------------
export const studioVideoHeatmap = pgTable(
  "studio_video_heatmap",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    videoId:     text("video_id").notNull(),
    viewerId:    text("viewer_id"),                  // null = anonymous
    viewerEmail: text("viewer_email"),
    viewerCompany: text("viewer_company"),           // reverse-lookup from IP/email domain
    secondsWatched: jsonb("seconds_watched").notNull(), // Array<number> — each second 0|1
    totalWatchTimeSec: integer("total_watch_time_sec").notNull().default(0),
    percentWatched:    real("percent_watched").notNull().default(0),
    dropOffSecond:     integer("drop_off_second"),    // second where viewer stopped
    referrer:    text("referrer"),
    userAgent:   text("user_agent"),
    ipCountry:   text("ip_country"),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_video_heatmap_video").on(t.videoId),
    index("idx_video_heatmap_viewer").on(t.viewerId),
  ],
);

// ---------------------------------------------------------------------------
// Stock Media Assets — content-addressed, deduplicated stock library cache.
//
// One row per unique asset hash. The first user to pick a given Unsplash /
// Pexels / Pixabay item triggers the download into R2 at `stock/<sha256>.<ext>`;
// every subsequent user references the same R2 object via the hash. The
// `userStockMediaUsage` join table records per-user picks for credit
// accounting, "recently used" lists, and licence audit trails — without
// duplicating any bytes.
// ---------------------------------------------------------------------------
export const stockMediaAssets = pgTable(
  "stock_media_assets",
  {
    hash:            text("hash").primaryKey(),         // sha256(file bytes), hex
    provider:        text("provider").notNull(),         // unsplash | pexels | pixabay | freesound | storyblocks | shutterstock
    providerAssetId: text("provider_asset_id").notNull(),// remote asset id at provider
    mediaType:       text("media_type").notNull(),        // image | video | audio
    mimeType:        text("mime_type").notNull(),
    sizeBytes:       integer("size_bytes").notNull(),
    width:           integer("width"),                    // images + video
    height:          integer("height"),                   // images + video
    durationMs:      integer("duration_ms"),              // video + audio
    storageKey:      text("storage_key").notNull(),       // R2 key, e.g. "stock/<hash>.jpg"
    cdnUrl:          text("cdn_url"),                     // public CDN URL
    sourceUrl:       text("source_url").notNull(),        // provider download URL we fetched
    title:           text("title"),
    description:     text("description"),
    author:          text("author"),                      // artist / photographer
    authorUrl:       text("author_url"),
    licence:         text("licence"),                     // e.g. "Unsplash", "Pexels", "CC0", "Storyblocks Standard"
    attributionJson: jsonb("attribution_json"),           // structured attribution for export metadata
    tags:            jsonb("tags"),                       // string[] — search keywords from provider
    pickCount:       integer("pick_count").notNull().default(0), // total picks across all users
    firstFetchedAt:  timestamp("first_fetched_at", { withTimezone: true }).notNull().defaultNow(),
    lastPickedAt:    timestamp("last_picked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_stock_media_provider").on(t.provider, t.providerAssetId),
    index("idx_stock_media_type").on(t.mediaType),
  ],
);

export const userStockMediaUsage = pgTable(
  "user_stock_media_usage",
  {
    id:         uuid("id").primaryKey().defaultRandom(),
    userId:     text("user_id").notNull(),
    assetHash:  text("asset_hash").notNull(),             // FK -> stock_media_assets.hash
    projectId:  text("project_id"),                        // optional studio project the asset was added to
    sceneId:    text("scene_id"),
    addedAt:    timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_user_stock_usage_user").on(t.userId),
    index("idx_user_stock_usage_asset").on(t.assetHash),
    index("idx_user_stock_usage_project").on(t.projectId),
  ],
);

// ---------------------------------------------------------------------------
// Project Version History (gap #131) — debounced autosave + restorable
// snapshots of the storyboard JSONB. 30-day retention, 50 versions per
// project enforced at write time.
// ---------------------------------------------------------------------------
export const studioProjectVersions = pgTable(
  "studio_project_versions",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    projectId:    text("project_id").notNull(),
    userId:       text("user_id").notNull(),
    versionNumber: integer("version_number").notNull(), // monotonically increasing per project
    label:        text("label"),                          // optional user label or "autosave"
    storyboard:   jsonb("storyboard").notNull(),          // full snapshot
    isAutosave:   boolean("is_autosave").notNull().default(true),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_versions_project").on(t.projectId),
    index("idx_studio_versions_created").on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Video Chapters (gap #141) — YouTube-style markers + interactive TOC.
// Auto-generated from scene boundaries on import; manually editable.
// ---------------------------------------------------------------------------
export const studioChapters = pgTable(
  "studio_chapters",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    projectId:    text("project_id").notNull(),
    userId:       text("user_id").notNull(),
    title:        text("title").notNull(),
    startSeconds: real("start_seconds").notNull(),       // chapter starts here
    thumbnailUrl: text("thumbnail_url"),                  // optional preview frame
    orderIndex:   integer("order_index").notNull().default(0),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_chapters_project").on(t.projectId),
  ],
);

// ---------------------------------------------------------------------------
// In-Video Lead Forms (gap #140) — Wistia Turnstile equivalent.
// A form is an interruptive overlay rendered at `positionSeconds` during
// playback. Submissions land in `studio_video_form_submissions` and are
// also mirrored into the global `marketingLeads` table for the unified
// lead inbox.
// ---------------------------------------------------------------------------
export const studioVideoForms = pgTable(
  "studio_video_forms",
  {
    id:              uuid("id").primaryKey().defaultRandom(),
    userId:          text("user_id").notNull(),
    projectId:       text("project_id").notNull(),
    title:           text("title").notNull(),             // shown in form modal
    description:     text("description"),
    positionSeconds: real("position_seconds").notNull(),  // when to interrupt
    fields:          jsonb("fields").notNull(),           // Array<{key, label, type, required}>
    requireToContinue: boolean("require_to_continue").notNull().default(true), // gate vs skippable
    redirectUrl:     text("redirect_url"),                // optional CTA after submit
    submitButtonText: text("submit_button_text").notNull().default("Continue"),
    isActive:        boolean("is_active").notNull().default(true),
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_video_forms_project").on(t.projectId),
    index("idx_studio_video_forms_user").on(t.userId),
  ],
);

export const studioVideoFormSubmissions = pgTable(
  "studio_video_form_submissions",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    formId:      text("form_id").notNull(),
    projectId:   text("project_id").notNull(),
    videoId:     text("video_id"),                        // when submitted from a published video
    viewerEmail: text("viewer_email"),
    viewerName:  text("viewer_name"),
    answers:     jsonb("answers").notNull(),              // { fieldKey: value }
    timestampSec: real("timestamp_sec"),                  // playback position at submission
    referrer:    text("referrer"),
    ipCountry:   text("ip_country"),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_video_form_subs_form").on(t.formId),
    index("idx_video_form_subs_project").on(t.projectId),
  ],
);

// ---------------------------------------------------------------------------
// Review Comments (gap #145) — Frame.io-style time-coded comments for
// async team review of draft videos. Public review links via shareToken.
// ---------------------------------------------------------------------------
export const studioReviewComments = pgTable(
  "studio_review_comments",
  {
    id:           uuid("id").primaryKey().defaultRandom(),
    projectId:    text("project_id").notNull(),
    parentId:     text("parent_id"),                      // null = root, else thread reply
    authorUserId: text("author_user_id"),                  // null for anonymous via shareToken
    authorName:   text("author_name").notNull(),
    authorEmail:  text("author_email"),
    body:         text("body").notNull(),
    timestampSec: real("timestamp_sec"),                  // playback position pinned to (null = general)
    resolved:     boolean("resolved").notNull().default(false),
    createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_review_comments_project").on(t.projectId),
    index("idx_review_comments_parent").on(t.parentId),
  ],
);

export const studioReviewLinks = pgTable(
  "studio_review_links",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    projectId:   text("project_id").notNull(),
    userId:      text("user_id").notNull(),               // owner of the project
    shareToken:  text("share_token").notNull(),           // unique URL token
    name:        text("name"),                             // friendly label e.g. "client review"
    expiresAt:   timestamp("expires_at", { withTimezone: true }),
    isActive:    boolean("is_active").notNull().default(true),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_review_links_project").on(t.projectId),
    index("idx_review_links_token").on(t.shareToken),
  ],
);

// ---------------------------------------------------------------------------
// Video Thumbnails (gap #142) — AI-generated candidates + chosen poster.
// ---------------------------------------------------------------------------
export const studioThumbnails = pgTable(
  "studio_thumbnails",
  {
    id:          uuid("id").primaryKey().defaultRandom(),
    projectId:   text("project_id").notNull(),
    userId:      text("user_id").notNull(),
    imageUrl:    text("image_url").notNull(),
    storageKey:  text("storage_key"),
    sourceTimeSec: real("source_time_sec"),                // frame extracted at this time
    headlineText: text("headline_text"),                    // optional overlay text
    score:       real("score"),                              // 0..1 LLM/heuristic score
    isSelected:  boolean("is_selected").notNull().default(false),
    createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_studio_thumbnails_project").on(t.projectId),
  ],
);
