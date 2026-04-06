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
    provider:    text("provider").notNull().default("elevenlabs"), // elevenlabs | openai | browser
    voiceId:     text("voice_id").notNull(),     // ElevenLabs voice ID
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
// Voice Clones — user's cloned voice profiles
// ---------------------------------------------------------------------------
export const studioVoiceClones = pgTable(
  "studio_voice_clones",
  {
    id:              uuid("id").primaryKey().defaultRandom(),
    userId:          text("user_id").notNull(),
    name:            text("name").notNull().default("My Voice"),
    provider:        text("provider").notNull().default("elevenlabs"),
    externalVoiceId: text("external_voice_id"),   // ElevenLabs cloned voice ID
    sampleAudioUrl:  text("sample_audio_url"),     // reference recording URL
    sampleAudioKey:  text("sample_audio_key"),
    status:          text("status").notNull().default("pending"), // pending | processing | ready | failed
    createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt:       timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_studio_voice_clones_user").on(t.userId)],
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
