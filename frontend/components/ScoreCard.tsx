// ScoreCard.tsx — Canvas-rendered 1200×630 shareable PNG for LinkedIn.
// Call scoreCardToBlob(result) to get a downloadable image.

export interface ScoreCardData {
  score: number;
  roast: string;
  strengths: string[];
  fixes: string[];
}

export async function scoreCardToBlob(data: ScoreCardData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not available");

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, 1200, 630);
  bg.addColorStop(0, "#0f172a");
  bg.addColorStop(1, "#1e293b");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1200, 630);

  // Accent bar
  const accent = ctx.createLinearGradient(0, 0, 400, 0);
  accent.addColorStop(0, "#2563eb");
  accent.addColorStop(1, "#14b8a6");
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 8, 630);

  // Score circle
  const cx = 200, cy = 315, r = 130;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = "#1e293b";
  ctx.fill();
  ctx.strokeStyle = scoreHex(data.score);
  ctx.lineWidth = 8;
  ctx.stroke();

  // Score number
  ctx.fillStyle = scoreHex(data.score);
  ctx.font = "bold 80px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(data.score.toFixed(1), cx, cy - 12);
  ctx.font = "24px system-ui, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText("/ 10", cx, cy + 52);

  // Label
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.fillStyle = scoreHex(data.score);
  ctx.fillText(scoreLabel(data.score), cx, cy + 90);

  // Roast quote — capped at 4 lines so it can't run into the columns below
  // (1200×630 is fixed; the previous layout would overlap the column
  // headers when the roast wrapped to 5+ lines).
  const roastX = 380, roastY = 80, roastMaxW = 760, roastLineH = 36;
  const roastMaxLines = 4;
  ctx.font = "italic 24px Georgia, serif";
  ctx.fillStyle = "#e2e8f0";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const roastEndY = wrapText(
    ctx,
    `"${data.roast}"`,
    roastX,
    roastY,
    roastMaxW,
    roastLineH,
    roastMaxLines,
  );

  // Strengths / Fixes columns flow below the roast, with a minimum gap so
  // they never collide regardless of how short or long the roast is.
  const colY = Math.max(260, roastEndY + 28);
  const col1X = 380, col2X = 790;
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillStyle = "#4ade80";
  ctx.fillText("✓ Strengths", col1X, colY);
  ctx.fillStyle = "#f97316";
  ctx.fillText("→ Quick Fixes", col2X, colY);

  // Body lines for each column. Cap each row to 2 wrapped lines and the
  // total to whatever fits between the column header and the footer.
  const colBodyY = colY + 34;
  const footerY = 595;
  const rowGap = 46;
  const rowMaxLines = 2;
  const rowLineH = 22;
  const maxRows = Math.max(
    1,
    Math.min(3, Math.floor((footerY - 30 - colBodyY) / rowGap)),
  );

  ctx.font = "16px system-ui, sans-serif";
  ctx.fillStyle = "#cbd5e1";
  data.strengths.slice(0, maxRows).forEach((s, i) => {
    wrapText(ctx, `• ${s}`, col1X, colBodyY + i * rowGap, 370, rowLineH, rowMaxLines);
  });
  data.fixes.slice(0, maxRows).forEach((fix, i) => {
    wrapText(ctx, `• ${fix}`, col2X, colBodyY + i * rowGap, 370, rowLineH, rowMaxLines);
  });

  // Branding footer
  ctx.fillStyle = "#475569";
  ctx.font = "18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("hired.video — AI Resume Roast", 600, footerY);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate image"));
    }, "image/png");
  });
}

function scoreHex(score: number): string {
  if (score >= 8) return "#4ade80";
  if (score >= 6) return "#fbbf24";
  if (score >= 4) return "#f97316";
  return "#ef4444";
}

function scoreLabel(score: number): string {
  if (score >= 8) return "STRONG";
  if (score >= 6) return "GOOD";
  if (score >= 4) return "NEEDS WORK";
  return "CRITICAL";
}

/** Word-wrap `text` into `maxWidth`-wide lines starting at (x, y). When
 *  `maxLines` is set, an ellipsis is appended to the final line if more
 *  text remains. Returns the y just below the last rendered line so the
 *  caller can flow subsequent content underneath. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines?: number,
): number {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  let lineCount = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      const isLast = maxLines !== undefined && lineCount + 1 === maxLines;
      const remaining = words.slice(i).join(" ");
      const out = isLast ? truncateToWidth(ctx, `${line} ${remaining}`, maxWidth) : line;
      ctx.fillText(out, x, lineY);
      lineCount += 1;
      lineY += lineHeight;
      if (isLast) {
        return lineY;
      }
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    ctx.fillText(line, x, lineY);
    lineY += lineHeight;
  }
  return lineY;
}

/** Fit `text` into `maxWidth`, appending an ellipsis if the full string
 *  doesn't fit. */
function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const candidate = text.slice(0, mid).trimEnd() + ellipsis;
    if (ctx.measureText(candidate).width <= maxWidth) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return text.slice(0, lo).trimEnd() + ellipsis;
}
