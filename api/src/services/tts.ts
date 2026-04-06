/**
 * TTS Service — ElevenLabs text-to-speech with word-level timestamps.
 *
 * Provides:
 *   - generateSpeech()       — text → audio + word timestamps
 *   - getVoices()            — list available voices
 *   - cloneVoice()           — create a cloned voice from samples
 *   - generateWithTimestamps() — full pipeline returning audio buffer + captions
 */

export interface WordTimestamp {
  word: string;
  start: number;   // seconds
  end: number;     // seconds
}

export interface TTSResult {
  audioBuffer: ArrayBuffer;
  contentType: string;
  durationMs: number;
  wordTimestamps: WordTimestamp[];
}

export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, string>;
  preview_url: string;
}

const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

/**
 * Generate speech with word-level timestamps using ElevenLabs API.
 */
export async function generateSpeech(
  apiKey: string,
  text: string,
  voiceId: string = "21m00Tcm4TlvDq8ikWAM", // Rachel — default
  options?: {
    modelId?: string;
    stability?: number;
    similarityBoost?: number;
    speed?: number;
  },
): Promise<TTSResult> {
  // Use the streaming endpoint with timestamps
  const res = await fetch(
    `${ELEVENLABS_BASE}/text-to-speech/${voiceId}/with-timestamps`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: options?.modelId ?? "eleven_multilingual_v2",
        voice_settings: {
          stability: options?.stability ?? 0.5,
          similarity_boost: options?.similarityBoost ?? 0.75,
          speed: options?.speed ?? 1.0,
        },
      }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs TTS ${res.status}: ${errText}`);
  }

  const json = await res.json() as {
    audio_base64: string;
    alignment: {
      characters: string[];
      character_start_times_seconds: number[];
      character_end_times_seconds: number[];
    };
  };

  // Decode audio
  const binaryString = atob(json.audio_base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const audioBuffer = bytes.buffer;

  // Convert character timestamps to word timestamps
  const wordTimestamps = charTimestampsToWords(
    json.alignment.characters,
    json.alignment.character_start_times_seconds,
    json.alignment.character_end_times_seconds,
  );

  // Estimate duration from last timestamp
  const lastEnd = json.alignment.character_end_times_seconds;
  const durationMs = Math.round((lastEnd[lastEnd.length - 1] ?? 0) * 1000);

  return {
    audioBuffer,
    contentType: "audio/mpeg",
    durationMs,
    wordTimestamps,
  };
}

/**
 * Convert character-level timestamps to word-level timestamps.
 */
function charTimestampsToWords(
  chars: string[],
  starts: number[],
  ends: number[],
): WordTimestamp[] {
  const words: WordTimestamp[] = [];
  let currentWord = "";
  let wordStart = 0;
  let wordEnd = 0;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === " " || ch === "\n" || ch === "\t") {
      if (currentWord.length > 0) {
        words.push({ word: currentWord, start: wordStart, end: wordEnd });
        currentWord = "";
      }
    } else {
      if (currentWord.length === 0) {
        wordStart = starts[i];
      }
      currentWord += ch;
      wordEnd = ends[i];
    }
  }
  if (currentWord.length > 0) {
    words.push({ word: currentWord, start: wordStart, end: wordEnd });
  }

  return words;
}

/**
 * List available ElevenLabs voices.
 */
export async function getVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
  const res = await fetch(`${ELEVENLABS_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
  });
  if (!res.ok) throw new Error(`ElevenLabs voices ${res.status}`);
  const json = await res.json() as { voices: ElevenLabsVoice[] };
  return json.voices;
}

/**
 * Clone a voice from audio samples.
 */
export async function cloneVoice(
  apiKey: string,
  name: string,
  audioFiles: { buffer: ArrayBuffer; filename: string; type: string }[],
  description?: string,
): Promise<{ voice_id: string; name: string }> {
  const formData = new FormData();
  formData.append("name", name);
  if (description) formData.append("description", description);

  for (const file of audioFiles) {
    formData.append("files", new Blob([file.buffer], { type: file.type }), file.filename);
  }

  const res = await fetch(`${ELEVENLABS_BASE}/voices/add`, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs clone ${res.status}: ${errText}`);
  }

  return await res.json() as { voice_id: string; name: string };
}

/**
 * Generate SRT subtitle content from word timestamps.
 */
export function wordTimestampsToSrt(timestamps: WordTimestamp[], wordsPerCue = 8): string {
  const cues: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < timestamps.length; i += wordsPerCue) {
    const chunk = timestamps.slice(i, i + wordsPerCue);
    cues.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map((w) => w.word).join(" "),
    });
  }

  return cues
    .map((cue, idx) => {
      const startTs = formatSrtTime(cue.start);
      const endTs = formatSrtTime(cue.end);
      return `${idx + 1}\n${startTs} --> ${endTs}\n${cue.text}\n`;
    })
    .join("\n");
}

/**
 * Generate WebVTT subtitle content from word timestamps.
 */
export function wordTimestampsToVtt(timestamps: WordTimestamp[], wordsPerCue = 8): string {
  const cues: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < timestamps.length; i += wordsPerCue) {
    const chunk = timestamps.slice(i, i + wordsPerCue);
    cues.push({
      start: chunk[0].start,
      end: chunk[chunk.length - 1].end,
      text: chunk.map((w) => w.word).join(" "),
    });
  }

  const lines = ["WEBVTT", ""];
  for (const cue of cues) {
    lines.push(`${formatVttTime(cue.start)} --> ${formatVttTime(cue.end)}`);
    lines.push(cue.text);
    lines.push("");
  }
  return lines.join("\n");
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)},${pad(ms, 3)}`;
}

function formatVttTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(s, 2)}.${pad(ms, 3)}`;
}

function pad(n: number, width: number): string {
  return n.toString().padStart(width, "0");
}
