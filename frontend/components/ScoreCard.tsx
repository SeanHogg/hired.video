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

  // Roast quote
  const roastX = 380, roastY = 80, roastMaxW = 760;
  ctx.font = "italic 24px Georgia, serif";
  ctx.fillStyle = "#e2e8f0";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  wrapText(ctx, `"${data.roast}"`, roastX, roastY, roastMaxW, 36);

  // Strengths / Fixes columns
  const col1X = 380, col2X = 790, colY = 260;
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillStyle = "#4ade80";
  ctx.fillText("✓ Strengths", col1X, colY);
  ctx.fillStyle = "#f97316";
  ctx.fillText("→ Quick Fixes", col2X, colY);

  ctx.font = "16px system-ui, sans-serif";
  ctx.fillStyle = "#cbd5e1";
  data.strengths.slice(0, 3).forEach((s, i) => {
    wrapText(ctx, `• ${s}`, col1X, colY + 34 + i * 46, 370, 22);
  });
  data.fixes.slice(0, 3).forEach((fix, i) => {
    wrapText(ctx, `• ${fix}`, col2X, colY + 34 + i * 46, 370, 22);
  });

  // Branding footer
  ctx.fillStyle = "#475569";
  ctx.font = "18px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("hired.video — AI Resume Roast", 600, 595);

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

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  const words = text.split(" ");
  let line = "";
  let lineY = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, lineY);
      line = word;
      lineY += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, lineY);
}
