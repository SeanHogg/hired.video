// Video Script DSL — the AI-generated program that drives the video compiler.
// Matches the JSON schema the LLM returns from POST /api/studio/storyboard.

export type VideoResolution = "720p" | "1080p";
export type VideoAspect = "16:9" | "9:16" | "1:1";
export type MotionStyle = "minimal" | "moderate" | "cinematic";
export type TransitionStyle = "cut" | "fade" | "slide" | "cinematic-fade";
export type BackgroundStyle = "gradient" | "dark-tech-grid" | "particles" | "solid";
export type SceneType = "intro" | "achievement" | "skills" | "closing";
export type ImagePosition =
  | "full"
  | "half-left" | "half-right"
  | "small-left" | "small-right"
  | "corner-tl"  | "corner-tr"
  | "corner-bl"  | "corner-br";
export type TextAlign = "left" | "center" | "right";
export type ContentPosition = "top" | "center" | "bottom";
export type ImageAnimation = "none" | "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
export type AnimationType = "fadeIn" | "slideUp" | "slideIn" | "scaleIn" | "typewriter" | "none";
export type EasingType = "linear" | "easeIn" | "easeOut" | "easeInOut" | "spring";
export type EffectType = "particles" | "blur" | "glow" | "vignette";

export interface VideoTheme {
  colorPalette: string[];       // 3–5 hex colours
  fontFamily: string;
  motion: MotionStyle;
  transition: TransitionStyle;
  background: BackgroundStyle;
  /** Blob URL or data URL for a user-uploaded background image */
  customBackground?: string;
}

export interface AnimationSpec {
  type: AnimationType;
  start: number;                // seconds within scene
  duration: number;
  easing?: EasingType;
}

export interface SceneEffect {
  type: EffectType;
  intensity: number;            // 0–1
}

export interface SceneScript {
  id: string;
  start: number;                // absolute seconds from video start
  duration: number;
  type: SceneType;
  title?: string;
  subtitle?: string;
  text?: string | string[];
  items?: string[];             // bullet list (achievements)
  skills?: string[];
  highlight?: boolean;          // AI edit flag
  animation?: {
    titleEnter?: AnimationSpec;
    subtitleEnter?: AnimationSpec;
    textEnter?: AnimationSpec;
  };
  effects?: SceneEffect[];
  accentColor?: string;
  backgroundImage?: string;
  backgroundImagePosition?: ImagePosition;
  sceneAudio?: string;
  sceneAudioLabel?: string;
  textAlign?: TextAlign;
  contentPosition?: ContentPosition;
  imageAnimation?: ImageAnimation;
}

export interface VideoAudio {
  /** Preset key or "custom" */
  track: string;
  /** Human-readable label */
  label: string;
  /** 0–1 */
  volume: number;
}

// ── TTS Voiceover ───────────────────────────────────────────────────────────

export interface VoiceoverConfig {
  enabled: boolean;
  voiceId: string;
  voiceName: string;
  speed: number;           // 0.5 – 2.0
  /** Per-scene audio URLs and word timestamps */
  scenes: Record<string, SceneVoiceover>;
}

export interface SceneVoiceover {
  audioUrl: string | null;
  durationMs: number;
  wordTimestamps: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

// ── Captions ────────────────────────────────────────────────────────────────

export type CaptionStyle = "standard" | "bold-pop" | "word-by-word" | "lower-thirds";

export interface CaptionConfig {
  enabled: boolean;
  style: CaptionStyle;
  cues: CaptionCue[];
}

export interface CaptionCue {
  start: number;
  end: number;
  text: string;
  words?: WordTimestamp[];
}

export interface VideoScript {
  video: {
    duration: number;           // total seconds
    fps: number;                // default 30
    resolution: VideoResolution;
    aspect: VideoAspect;
    theme: VideoTheme;
    audio?: VideoAudio;
  };
  scenes: SceneScript[];
  /** Internal metadata not rendered by the compiler — persisted with the draft */
  _meta?: {
    model?: string;
  };
}
