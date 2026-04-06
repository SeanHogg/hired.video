/**
 * Caption Renderer — draws subtitle/caption text on a canvas during video export.
 *
 * Supports styles: standard, bold-pop, word-by-word, lower-thirds.
 * Fed by word timestamps from TTS or Whisper transcription.
 */

import type { CaptionCue, CaptionStyle, WordTimestamp } from "../../types/video-script";

export interface CaptionRenderConfig {
  cues: CaptionCue[];
  style: CaptionStyle;
  enabled: boolean;
}

/**
 * Render captions for the current time onto the canvas.
 */
export function renderCaptions(
  ctx: CanvasRenderingContext2D,
  config: CaptionRenderConfig,
  time: number,
  width: number,
  height: number,
): void {
  if (!config.enabled || config.cues.length === 0) return;

  // Find the active cue at this time
  const activeCue = config.cues.find((cue) => time >= cue.start && time <= cue.end);
  if (!activeCue) return;

  switch (config.style) {
    case "bold-pop":
      renderBoldPop(ctx, activeCue, time, width, height);
      break;
    case "word-by-word":
      renderWordByWord(ctx, activeCue, time, width, height);
      break;
    case "lower-thirds":
      renderLowerThirds(ctx, activeCue, time, width, height);
      break;
    default:
      renderStandard(ctx, activeCue, time, width, height);
  }
}

// ─── Standard Style ─────────────────────────────────────────────────────────

function renderStandard(
  ctx: CanvasRenderingContext2D,
  cue: CaptionCue,
  _time: number,
  width: number,
  height: number,
): void {
  const fontSize = Math.round(height * 0.035);
  const padding = Math.round(width * 0.03);
  const y = height - Math.round(height * 0.12);

  ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // Measure text for background box
  const metrics = ctx.measureText(cue.text);
  const boxWidth = metrics.width + padding * 2;
  const boxHeight = fontSize * 1.6;
  const boxX = (width - boxWidth) / 2;
  const boxY = y - boxHeight / 2;

  // Semi-transparent background
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 6);
  ctx.fill();

  // White text
  ctx.fillStyle = "#ffffff";
  ctx.fillText(cue.text, width / 2, y);
}

// ─── Bold Pop Style (TikTok/Reels style) ────────────────────────────────────

function renderBoldPop(
  ctx: CanvasRenderingContext2D,
  cue: CaptionCue,
  time: number,
  width: number,
  height: number,
): void {
  const fontSize = Math.round(height * 0.06);
  const y = height * 0.5;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // If we have word timestamps, highlight the current word
  if (cue.words && cue.words.length > 0) {
    const words = cue.words;
    const lineHeight = fontSize * 1.3;

    // Split into lines of max 4 words
    const lines: WordTimestamp[][] = [];
    for (let i = 0; i < words.length; i += 4) {
      lines.push(words.slice(i, i + 4));
    }

    const totalHeight = lines.length * lineHeight;
    let currentY = y - totalHeight / 2 + lineHeight / 2;

    for (const line of lines) {
      const lineText = line.map((w) => w.word).join(" ");
      const lineWidth = measureBoldText(ctx, lineText, fontSize);

      // Draw each word, highlighting the current one
      let x = (width - lineWidth) / 2;
      for (const word of line) {
        const isCurrent = time >= word.start && time <= word.end;
        ctx.font = `900 ${fontSize}px Inter, system-ui, sans-serif`;
        const wordMetrics = ctx.measureText(word.word);

        if (isCurrent) {
          // Highlighted word: yellow with black stroke
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = fontSize * 0.12;
          ctx.strokeText(word.word, x + wordMetrics.width / 2, currentY);
          ctx.fillStyle = "#facc15";
          ctx.fillText(word.word, x + wordMetrics.width / 2, currentY);
        } else {
          // Normal word: white with black stroke
          ctx.strokeStyle = "#000000";
          ctx.lineWidth = fontSize * 0.1;
          ctx.strokeText(word.word, x + wordMetrics.width / 2, currentY);
          ctx.fillStyle = "#ffffff";
          ctx.fillText(word.word, x + wordMetrics.width / 2, currentY);
        }

        x += wordMetrics.width + fontSize * 0.3;
      }
      currentY += lineHeight;
    }
  } else {
    // No word timestamps: show all text bold centered
    ctx.font = `900 ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = fontSize * 0.1;
    ctx.strokeText(cue.text, width / 2, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(cue.text, width / 2, y);
  }
}

function measureBoldText(ctx: CanvasRenderingContext2D, text: string, fontSize: number): number {
  ctx.font = `900 ${fontSize}px Inter, system-ui, sans-serif`;
  return ctx.measureText(text).width;
}

// ─── Word-by-Word Style (one word at a time, centered) ──────────────────────

function renderWordByWord(
  ctx: CanvasRenderingContext2D,
  cue: CaptionCue,
  time: number,
  width: number,
  height: number,
): void {
  const fontSize = Math.round(height * 0.08);
  const y = height * 0.5;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${fontSize}px Inter, system-ui, sans-serif`;

  if (cue.words && cue.words.length > 0) {
    // Find current word
    const currentWord = cue.words.find((w) => time >= w.start && time <= w.end);
    const displayWord = currentWord?.word ?? cue.words[cue.words.length - 1].word;

    // Scale animation
    const progress = currentWord
      ? Math.min(1, (time - currentWord.start) / Math.max(0.05, currentWord.end - currentWord.start))
      : 1;
    const scale = 0.8 + 0.2 * Math.min(1, progress * 3);

    ctx.save();
    ctx.translate(width / 2, y);
    ctx.scale(scale, scale);

    // Shadow
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = fontSize * 0.12;
    ctx.strokeText(displayWord, 0, 0);

    ctx.fillStyle = "#ffffff";
    ctx.fillText(displayWord, 0, 0);
    ctx.restore();
  } else {
    // Fallback: show full text
    ctx.strokeStyle = "#000000";
    ctx.lineWidth = fontSize * 0.1;
    ctx.strokeText(cue.text, width / 2, y);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(cue.text, width / 2, y);
  }
}

// ─── Lower Thirds Style ─────────────────────────────────────────────────────

function renderLowerThirds(
  ctx: CanvasRenderingContext2D,
  cue: CaptionCue,
  _time: number,
  width: number,
  height: number,
): void {
  const fontSize = Math.round(height * 0.03);
  const padding = Math.round(width * 0.03);
  const barHeight = fontSize * 2.2;
  const barY = height - barHeight - Math.round(height * 0.05);

  // Accent bar
  ctx.fillStyle = "rgba(37, 99, 235, 0.9)"; // brand blue
  ctx.fillRect(0, barY, width * 0.6, barHeight);

  // Text
  ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(cue.text, padding, barY + barHeight / 2, width * 0.55);
}
