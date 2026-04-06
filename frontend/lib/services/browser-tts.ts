/**
 * Browser-based TTS using the Web Speech API.
 *
 * Eliminates the need for ElevenLabs or any external TTS service.
 * All speech synthesis runs entirely in the browser — zero API keys, zero cost.
 */

import type { TTSVoice, WordTimestamp } from "./studio-features-service";

// ---------------------------------------------------------------------------
// Voice management
// ---------------------------------------------------------------------------

let cachedVoices: SpeechSynthesisVoice[] = [];

/** Load browser voices. Chrome loads them async, so we handle both cases. */
function loadNativeVoices(): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      cachedVoices = voices;
      resolve(voices);
      return;
    }
    // Chrome fires this event once voices are ready
    speechSynthesis.onvoiceschanged = () => {
      cachedVoices = speechSynthesis.getVoices();
      resolve(cachedVoices);
    };
    // Fallback timeout — some browsers never fire the event
    setTimeout(() => resolve(speechSynthesis.getVoices()), 500);
  });
}

/** Map native voices to the TTSVoice shape the rest of the app expects. */
export async function getBrowserVoices(): Promise<TTSVoice[]> {
  const native = await loadNativeVoices();

  // Prefer English voices, sort local-first (lower latency)
  const english = native.filter((v) => v.lang.startsWith("en"));
  const sorted = [
    ...english.filter((v) => v.localService),
    ...english.filter((v) => !v.localService),
  ];
  // Fall back to all voices if no English ones found
  const list = sorted.length > 0 ? sorted : native;

  return list.map((v) => ({
    voice_id: v.voiceURI,
    name: v.name.replace(/\s*\(.*?\)\s*/g, ""), // strip "(Enhanced)" etc.
    category: v.localService ? "local" : "network",
    labels: { lang: v.lang },
    preview_url: undefined,
  }));
}

/** Resolve a voice_id back to the native SpeechSynthesisVoice. */
function resolveVoice(voiceId: string): SpeechSynthesisVoice | null {
  if (cachedVoices.length === 0) cachedVoices = speechSynthesis.getVoices();
  return cachedVoices.find((v) => v.voiceURI === voiceId) ?? null;
}

// ---------------------------------------------------------------------------
// Word-timestamp estimation
// ---------------------------------------------------------------------------

const AVG_WPM = 160; // average conversational speaking rate

/**
 * Estimate word timestamps from text and playback speed.
 * Good enough for caption display and word highlighting.
 */
export function estimateWordTimestamps(
  text: string,
  speed: number = 1,
): { timestamps: WordTimestamp[]; durationMs: number } {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return { timestamps: [], durationMs: 0 };

  const msPerChar = (60_000 / (AVG_WPM * speed)) / 5; // ~5 chars per avg word
  const gapMs = 40 / speed;
  let cursor = 0;

  const timestamps: WordTimestamp[] = words.map((word) => {
    const duration = word.length * msPerChar;
    const start = cursor;
    const end = start + duration;
    cursor = end + gapMs;
    return { word, start, end };
  });

  return { timestamps, durationMs: cursor };
}

// ---------------------------------------------------------------------------
// Speech playback
// ---------------------------------------------------------------------------

let currentUtterance: SpeechSynthesisUtterance | null = null;

export interface SpeakOptions {
  text: string;
  voiceId?: string;
  rate?: number;
  onBoundary?: (wordIndex: number) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

/**
 * Speak text using the browser's speech synthesis.
 * Returns a cancel function.
 */
export function speak(opts: SpeakOptions): () => void {
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(opts.text);
  currentUtterance = utterance;

  if (opts.voiceId) {
    const voice = resolveVoice(opts.voiceId);
    if (voice) utterance.voice = voice;
  }

  utterance.rate = opts.rate ?? 1;

  // Track word boundaries for highlighting
  if (opts.onBoundary) {
    const words = opts.text.split(/\s+/).filter(Boolean);
    // Build char-index → word-index map
    const wordBounds: Array<{ charStart: number; wordIdx: number }> = [];
    let ci = 0;
    words.forEach((w, idx) => {
      const pos = opts.text.indexOf(w, ci);
      wordBounds.push({ charStart: pos, wordIdx: idx });
      ci = pos + w.length;
    });

    utterance.onboundary = (e) => {
      if (e.name === "word") {
        // Find the closest word index for this character offset
        let bestIdx = 0;
        for (const wb of wordBounds) {
          if (wb.charStart <= e.charIndex) bestIdx = wb.wordIdx;
          else break;
        }
        opts.onBoundary!(bestIdx);
      }
    };
  }

  utterance.onend = () => {
    currentUtterance = null;
    opts.onEnd?.();
  };
  utterance.onerror = (e) => {
    currentUtterance = null;
    opts.onError?.(e.error);
  };

  speechSynthesis.speak(utterance);

  return () => {
    speechSynthesis.cancel();
    currentUtterance = null;
  };
}

/** Stop any in-progress speech. */
export function stopSpeaking(): void {
  speechSynthesis.cancel();
  currentUtterance = null;
}

/** Is speech synthesis currently active? */
export function isSpeaking(): boolean {
  return speechSynthesis.speaking;
}

/** Preview a voice with a short sample sentence. */
export function previewVoice(voiceId: string): () => void {
  return speak({
    text: "Hi there! This is a preview of how I sound.",
    voiceId,
    rate: 1,
  });
}
