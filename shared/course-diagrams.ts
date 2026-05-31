/**
 * Inline lesson-diagram SVGs for the seeded Learning Content Library
 * (migration 0131). Served by the worker `GET /api/og/lesson-diagram?d=<key>`
 * endpoint and embedded into each lesson's `body_md` as a standard markdown
 * image by migration 0190 — so they render through the existing
 * `<ReactMarkdown remarkPlugins={[remarkGfm]}>` path in
 * [frontend/pages/CourseLearner.tsx] with no new renderer wiring and no XSS
 * surface (SVG inside an `<img>` cannot execute script).
 *
 * Why diagrams at all (visual-aid gap): every seeded lesson shipped as a wall
 * of `text_md` with zero visual aids. These schematic SVGs give each lesson a
 * concept diagram — the "slide" a learner expects — at $0 infra, edge-cached,
 * and crisp at every breakpoint.
 *
 * Keys mirror the seed lesson slugs (`ai-fund-l1` ↔ `seed-lesson:ai-fund:l1`)
 * so the migration's image refs and this registry can't silently drift.
 *
 * Pure: no DOM / fetch / Node globals — safe in both the Vite bundle and the
 * Cloudflare Worker.
 */

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

/** Wrap a diagram body in the shared 820×470 frame: gradient backdrop,
 *  eyebrow + title, and the hired.video footer mark. */
function frame(opts: { eyebrow: string; title: string; body: string }): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 470" width="820" height="470" role="img" aria-label="${opts.title}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#1e1b4b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7c3aed"/>
      <stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
  </defs>
  <rect width="820" height="470" rx="18" fill="url(#bg)"/>
  <text x="40" y="52" fill="#a5b4fc" font-family="${FONT}" font-size="15" font-weight="600" letter-spacing="3">${opts.eyebrow.toUpperCase()}</text>
  <text x="40" y="86" fill="#ffffff" font-family="${FONT}" font-size="26" font-weight="800">${opts.title}</text>
  ${opts.body}
  <text x="40" y="448" fill="rgba(255,255,255,0.45)" font-family="${FONT}" font-size="14" font-weight="600">hired.video</text>
</svg>`;
}

/** A rounded label box with centered text. */
function box(
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  opts: { fill?: string; stroke?: string; text?: string; size?: number; weight?: number } = {},
): string {
  const fill = opts.fill ?? "rgba(255,255,255,0.06)";
  const stroke = opts.stroke ?? "rgba(255,255,255,0.18)";
  const text = opts.text ?? "#e2e8f0";
  const size = opts.size ?? 16;
  const weight = opts.weight ?? 600;
  return `<g>
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}"/>
    <text x="${x + w / 2}" y="${y + h / 2}" fill="${text}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="middle" dominant-baseline="central">${label}</text>
  </g>`;
}

/** Right-pointing arrow from (x1) to (x2) at vertical center y. */
function arrow(x1: number, x2: number, y: number): string {
  return `<g stroke="#7c3aed" stroke-width="3" fill="#7c3aed">
    <line x1="${x1}" y1="${y}" x2="${x2 - 8}" y2="${y}"/>
    <polygon points="${x2 - 10},${y - 6} ${x2},${y} ${x2 - 10},${y + 6}" stroke="none"/>
  </g>`;
}

export interface CourseDiagram {
  alt: string;
  svg: string;
}

export const COURSE_DIAGRAMS: Record<string, CourseDiagram> = {
  // ── AI Fundamentals ────────────────────────────────────────────────
  "ai-fund-l1": {
    alt: "Nested hierarchy: AI contains Machine Learning, which contains Deep Learning, which contains Large Language Models; Generative AI spans the inner layers.",
    svg: frame({
      eyebrow: "Lesson 1",
      title: "The AI term hierarchy",
      body: `
      ${box(60, 120, 480, 300, "", { fill: "rgba(37,99,235,0.10)", stroke: "rgba(96,165,250,0.5)" })}
      <text x="80" y="146" fill="#93c5fd" font-family="${FONT}" font-size="15" font-weight="700">ARTIFICIAL INTELLIGENCE</text>
      ${box(90, 162, 420, 240, "", { fill: "rgba(124,58,237,0.12)", stroke: "rgba(167,139,250,0.5)" })}
      <text x="110" y="186" fill="#c4b5fd" font-family="${FONT}" font-size="14" font-weight="700">MACHINE LEARNING</text>
      ${box(120, 200, 360, 184, "", { fill: "rgba(219,39,119,0.12)", stroke: "rgba(249,168,212,0.5)" })}
      <text x="140" y="224" fill="#f9a8d4" font-family="${FONT}" font-size="14" font-weight="700">DEEP LEARNING</text>
      ${box(150, 240, 300, 124, "Large Language Models", { fill: "rgba(16,185,129,0.16)", stroke: "rgba(110,231,183,0.6)", text: "#a7f3d0", size: 18, weight: 800 })}
      ${box(560, 200, 210, 120, "Generative AI", { fill: "rgba(245,158,11,0.16)", stroke: "rgba(252,211,77,0.6)", text: "#fcd34d", size: 18, weight: 800 })}
      <text x="560" y="345" fill="rgba(255,255,255,0.6)" font-family="${FONT}" font-size="13">text · image · audio · video</text>`,
    }),
  },
  "ai-fund-l2": {
    alt: "A stream of tokens flows into a fixed-size context window; tokens beyond the window are truncated and forgotten.",
    svg: frame({
      eyebrow: "Lesson 2",
      title: "Tokens & the context window",
      body: `
      <text x="40" y="135" fill="rgba(255,255,255,0.6)" font-family="${FONT}" font-size="14">Conversation, oldest → newest</text>
      ${[0, 1, 2, 3].map((i) => box(40 + i * 70, 150, 60, 44, "tok", { fill: "rgba(239,68,68,0.12)", stroke: "rgba(248,113,113,0.4)", text: "rgba(248,113,113,0.8)", size: 13 })).join("")}
      <text x="180" y="220" fill="rgba(248,113,113,0.9)" font-family="${FONT}" font-size="13" text-anchor="middle">truncated · forgotten</text>
      <rect x="330" y="140" width="450" height="120" rx="12" fill="rgba(37,99,235,0.10)" stroke="url(#accent)" stroke-width="2"/>
      <text x="350" y="166" fill="#93c5fd" font-family="${FONT}" font-size="14" font-weight="700">CONTEXT WINDOW (working memory)</text>
      ${[0, 1, 2, 3, 4].map((i) => box(348 + i * 84, 184, 74, 56, "tok", { fill: "rgba(96,165,250,0.18)", stroke: "rgba(96,165,250,0.5)", text: "#bfdbfe", size: 13 })).join("")}
      ${box(220, 320, 360, 70, "Bigger window = more remembered, higher cost per call", { fill: "rgba(16,185,129,0.12)", stroke: "rgba(110,231,183,0.4)", text: "#a7f3d0", size: 15, weight: 700 })}`,
    }),
  },
  "ai-fund-l3": {
    alt: "Resume flows through ATS parsing, keyword matching, an AI summary and ranking layer, then to a human reviewer.",
    svg: frame({
      eyebrow: "Lesson 3",
      title: "How an ATS + AI screener reads you",
      body: `
      ${box(40, 200, 130, 70, "Your résumé", { fill: "rgba(96,165,250,0.16)", stroke: "rgba(96,165,250,0.5)", text: "#bfdbfe" })}
      ${arrow(170, 210, 235)}
      ${box(210, 200, 150, 70, "ATS parse → fields", { size: 14 })}
      ${arrow(360, 400, 235)}
      ${box(400, 175, 150, 50, "Keyword match", { size: 14 })}
      ${box(400, 235, 150, 50, "AI summary + rank", { fill: "rgba(124,58,237,0.16)", stroke: "rgba(167,139,250,0.5)", text: "#c4b5fd", size: 13 })}
      ${arrow(550, 590, 235)}
      ${box(590, 200, 150, 70, "Human reviewer", { fill: "rgba(16,185,129,0.16)", stroke: "rgba(110,231,183,0.5)", text: "#a7f3d0" })}
      ${box(40, 330, 700, 64, "Clean single-column text · mirror the exact keywords · quantify outcomes", { fill: "rgba(245,158,11,0.10)", stroke: "rgba(252,211,77,0.4)", text: "#fcd34d", size: 15, weight: 700 })}`,
    }),
  },
  "ai-fund-l4": {
    alt: "Five pillars: judgment under ambiguity, building trust, taking responsibility, cross-domain synthesis, and knowing what to ask.",
    svg: frame({
      eyebrow: "Lesson 4",
      title: "Five skills AI stays worst at",
      body: `
      ${["Judgment under ambiguity", "Building trust face-to-face", "Taking responsibility", "Cross-domain synthesis", "Knowing what to ask"]
        .map((t, i) => `${box(40 + i * 150, 170, 134, 210, "", { fill: "rgba(124,58,237,0.12)", stroke: "rgba(167,139,250,0.4)" })}
        <text x="${40 + i * 150 + 67}" y="285" fill="#e9d5ff" font-family="${FONT}" font-size="14" font-weight="700" text-anchor="middle">
          <tspan x="${40 + i * 150 + 67}" dy="0">${t.split(" ").slice(0, 2).join(" ")}</tspan>
          <tspan x="${40 + i * 150 + 67}" dy="22">${t.split(" ").slice(2).join(" ")}</tspan>
        </text>
        <text x="${40 + i * 150 + 67}" y="205" fill="#a78bfa" font-family="${FONT}" font-size="22" font-weight="800" text-anchor="middle">${i + 1}</text>`)
        .join("")}`,
    }),
  },

  // ── RAG ────────────────────────────────────────────────────────────
  "rag-l1": {
    alt: "Side-by-side comparison of fine-tuning (corpus baked into weights) versus RAG (corpus stays in a database, fetched at query time).",
    svg: frame({
      eyebrow: "Lesson 1",
      title: "Grounding (RAG) vs teaching (fine-tune)",
      body: `
      ${box(40, 130, 350, 260, "", { fill: "rgba(239,68,68,0.08)", stroke: "rgba(248,113,113,0.35)" })}
      <text x="215" y="160" fill="#fca5a5" font-family="${FONT}" font-size="16" font-weight="800" text-anchor="middle">FINE-TUNING</text>
      ${box(80, 185, 270, 60, "Corpus baked into weights", { size: 14 })}
      <text x="215" y="290" fill="rgba(255,255,255,0.6)" font-family="${FONT}" font-size="13" text-anchor="middle">re-train to update · no citations</text>
      <text x="215" y="315" fill="rgba(255,255,255,0.6)" font-family="${FONT}" font-size="13" text-anchor="middle">wins for new style / format</text>
      ${box(430, 130, 350, 260, "", { fill: "rgba(16,185,129,0.10)", stroke: "rgba(110,231,183,0.45)" })}
      <text x="605" y="160" fill="#6ee7b7" font-family="${FONT}" font-size="16" font-weight="800" text-anchor="middle">RAG</text>
      ${box(460, 185, 130, 50, "DB / corpus", { fill: "rgba(96,165,250,0.16)", stroke: "rgba(96,165,250,0.5)", text: "#bfdbfe", size: 13 })}
      ${arrow(590, 630, 210)}
      ${box(630, 185, 120, 50, "prompt", { size: 13 })}
      <text x="605" y="290" fill="rgba(255,255,255,0.7)" font-family="${FONT}" font-size="13" text-anchor="middle">fresh · cites sources · per-user ACL</text>
      <text x="605" y="315" fill="rgba(255,255,255,0.7)" font-family="${FONT}" font-size="13" text-anchor="middle">wins for ~90% of use cases</text>`,
    }),
  },
  "rag-l2": {
    alt: "A 2D vector space where semantically similar sentences cluster together and an unrelated sentence sits far away.",
    svg: frame({
      eyebrow: "Lesson 2",
      title: "Embeddings: meaning becomes math",
      body: `
      <rect x="40" y="120" width="420" height="300" rx="12" fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.15)"/>
      <line x1="60" y1="400" x2="440" y2="400" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
      <line x1="60" y1="400" x2="60" y2="140" stroke="rgba(255,255,255,0.3)" stroke-width="1.5"/>
      <circle cx="150" cy="200" r="9" fill="#6ee7b7"/>
      <text x="166" y="204" fill="#a7f3d0" font-family="${FONT}" font-size="13">"I am tired"</text>
      <circle cx="178" cy="228" r="9" fill="#6ee7b7"/>
      <text x="194" y="232" fill="#a7f3d0" font-family="${FONT}" font-size="13">"I need a nap"</text>
      <circle cx="380" cy="350" r="9" fill="#fca5a5"/>
      <text x="250" y="354" fill="#fca5a5" font-family="${FONT}" font-size="13">"Quarterly revenue"</text>
      ${box(500, 170, 280, 70, "Close vectors = similar meaning", { fill: "rgba(16,185,129,0.12)", stroke: "rgba(110,231,183,0.4)", text: "#a7f3d0", size: 15, weight: 700 })}
      ${box(500, 260, 280, 90, "Cosine similarity ranks neighbours — even with zero shared words", { fill: "rgba(124,58,237,0.12)", stroke: "rgba(167,139,250,0.4)", text: "#c4b5fd", size: 14, weight: 600 })}`,
    }),
  },
  "rag-l3": {
    alt: "Production RAG pipeline: query, embed, vector search top-50, re-rank to top-5, LLM, grounded answer.",
    svg: frame({
      eyebrow: "Lesson 3",
      title: "Production RAG pipeline",
      body: `
      ${box(40, 175, 110, 64, "Query", { fill: "rgba(96,165,250,0.16)", stroke: "rgba(96,165,250,0.5)", text: "#bfdbfe", size: 14 })}
      ${arrow(150, 185, 207)}
      ${box(185, 175, 120, 64, "Vector search (top-50)", { size: 12 })}
      ${arrow(305, 340, 207)}
      ${box(340, 175, 120, 64, "Re-rank → top-5", { fill: "rgba(245,158,11,0.16)", stroke: "rgba(252,211,77,0.5)", text: "#fcd34d", size: 12 })}
      ${arrow(460, 495, 207)}
      ${box(495, 175, 110, 64, "LLM", { fill: "rgba(124,58,237,0.18)", stroke: "rgba(167,139,250,0.5)", text: "#c4b5fd", size: 14 })}
      ${arrow(605, 650, 207)}
      ${box(650, 175, 130, 64, "Grounded answer", { fill: "rgba(16,185,129,0.16)", stroke: "rgba(110,231,183,0.5)", text: "#a7f3d0", size: 12 })}
      ${box(40, 320, 740, 70, "Failure modes: retrieval drift · chunk-boundary loss · ACL leakage · eval drift · cost creep", { fill: "rgba(239,68,68,0.08)", stroke: "rgba(248,113,113,0.35)", text: "#fca5a5", size: 14, weight: 600 })}`,
    }),
  },

  // ── Prompt Engineering ─────────────────────────────────────────────
  "prompt-l1": {
    alt: "Four dials labelled Role, Examples, Constraints, and Decomposition feeding into better model output.",
    svg: frame({
      eyebrow: "Lesson 1",
      title: "The four knobs that always matter",
      body: `
      ${["Role", "Examples", "Constraints", "Decomposition"].map((t, i) => {
        const cx = 130 + i * 180;
        return `<circle cx="${cx}" cy="210" r="52" fill="rgba(124,58,237,0.12)" stroke="url(#accent)" stroke-width="3"/>
        <circle cx="${cx}" cy="210" r="6" fill="#a78bfa"/>
        <line x1="${cx}" y1="210" x2="${cx + 30}" y2="180" stroke="#a78bfa" stroke-width="3"/>
        <text x="${cx}" y="295" fill="#e9d5ff" font-family="${FONT}" font-size="15" font-weight="700" text-anchor="middle">${t}</text>`;
      }).join("")}
      ${box(210, 340, 400, 56, "Combine all four → dramatically better output", { fill: "rgba(16,185,129,0.12)", stroke: "rgba(110,231,183,0.4)", text: "#a7f3d0", size: 15, weight: 700 })}`,
    }),
  },
  "prompt-l2": {
    alt: "Three escalating techniques for structured output: ask for JSON (~85%), provider JSON mode (~99%), validate-and-repair loop (~99.9%).",
    svg: frame({
      eyebrow: "Lesson 2",
      title: "Getting structured output you can parse",
      body: `
      ${box(40, 150, 220, 90, "1 · Ask for JSON in prompt", { size: 14 })}
      <text x="150" y="262" fill="rgba(255,255,255,0.55)" font-family="${FONT}" font-size="13" text-anchor="middle">~85% reliable</text>
      ${arrow(260, 300, 195)}
      ${box(300, 150, 220, 90, "2 · Provider JSON mode", { fill: "rgba(96,165,250,0.14)", stroke: "rgba(96,165,250,0.5)", text: "#bfdbfe", size: 14 })}
      <text x="410" y="262" fill="rgba(255,255,255,0.55)" font-family="${FONT}" font-size="13" text-anchor="middle">~99% reliable</text>
      ${arrow(520, 560, 195)}
      ${box(560, 150, 220, 90, "3 · Validate + repair loop", { fill: "rgba(16,185,129,0.16)", stroke: "rgba(110,231,183,0.5)", text: "#a7f3d0", size: 14 })}
      <text x="670" y="262" fill="rgba(255,255,255,0.55)" font-family="${FONT}" font-size="13" text-anchor="middle">~99.9% reliable</text>
      <g stroke="#6ee7b7" stroke-width="2.5" fill="none">
        <path d="M 670 300 q 90 60 0 70 q -90 -10 0 -70" />
      </g>
      <text x="700" y="345" fill="#6ee7b7" font-family="${FONT}" font-size="12">feed error back</text>`,
    }),
  },
  "prompt-l3": {
    alt: "Chain-of-thought reasoning steps leading to an answer, then a self-critique loop that rewrites before returning.",
    svg: frame({
      eyebrow: "Lesson 3",
      title: "Chain-of-thought + self-critique",
      body: `
      ${box(40, 160, 150, 60, "Step 1: reason", { size: 14 })}
      ${arrow(190, 230, 190)}
      ${box(230, 160, 150, 60, "Step 2: reason", { size: 14 })}
      ${arrow(380, 420, 190)}
      ${box(420, 160, 150, 60, "Draft answer", { fill: "rgba(96,165,250,0.14)", stroke: "rgba(96,165,250,0.5)", text: "#bfdbfe", size: 14 })}
      ${arrow(570, 610, 190)}
      ${box(610, 160, 170, 60, "Self-critique", { fill: "rgba(245,158,11,0.16)", stroke: "rgba(252,211,77,0.5)", text: "#fcd34d", size: 14 })}
      <g stroke="#fcd34d" stroke-width="2.5" fill="none">
        <path d="M 695 220 q 70 70 -130 70 q -180 0 -180 -55"/>
        <polygon points="385,205 405,200 398,222" fill="#fcd34d" stroke="none"/>
      </g>
      <text x="500" y="312" fill="#fcd34d" font-family="${FONT}" font-size="13" text-anchor="middle">rewrite if issues found</text>
      ${box(150, 360, 520, 50, "Skip for latency-sensitive chat · use for batch, code, high-stakes one-shots", { fill: "rgba(255,255,255,0.05)", text: "rgba(255,255,255,0.7)", size: 13, weight: 600 })}`,
    }),
  },

  // ── AI-Era Must-Have Skills ────────────────────────────────────────
  "must-l1": {
    alt: "A trust gauge mapping tasks to low, medium, or high trust in AI output based on cost of error and verifiability.",
    svg: frame({
      eyebrow: "Lesson 1",
      title: "Calibrated skepticism",
      body: `
      <rect x="40" y="150" width="740" height="56" rx="10" fill="none" stroke="rgba(255,255,255,0.15)"/>
      <defs><linearGradient id="trust" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#10b981"/><stop offset="0.5" stop-color="#f59e0b"/><stop offset="1" stop-color="#ef4444"/>
      </linearGradient></defs>
      <rect x="44" y="154" width="732" height="48" rx="8" fill="url(#trust)" opacity="0.8"/>
      <text x="120" y="184" fill="#06281c" font-family="${FONT}" font-size="15" font-weight="800" text-anchor="middle">HIGH TRUST</text>
      <text x="410" y="184" fill="#3b2503" font-family="${FONT}" font-size="15" font-weight="800" text-anchor="middle">MEDIUM</text>
      <text x="690" y="184" fill="#3b0a0a" font-family="${FONT}" font-size="15" font-weight="800" text-anchor="middle">LOW TRUST</text>
      ${box(40, 240, 230, 150, "Draft emails · summaries · boilerplate code", { fill: "rgba(16,185,129,0.12)", stroke: "rgba(110,231,183,0.4)", text: "#a7f3d0", size: 14 })}
      ${box(295, 240, 230, 150, "Research · public copy · candidate suggestions", { fill: "rgba(245,158,11,0.12)", stroke: "rgba(252,211,77,0.4)", text: "#fcd34d", size: 14 })}
      ${box(550, 240, 230, 150, "Legal · medical · claims about people · citations", { fill: "rgba(239,68,68,0.12)", stroke: "rgba(248,113,113,0.4)", text: "#fca5a5", size: 14 })}`,
    }),
  },
  "must-l2": {
    alt: "Upstream steps feed a task that AI compresses; downstream steps follow. Seeing the whole system is the leverage.",
    svg: frame({
      eyebrow: "Lesson 2",
      title: "Map the system around the task",
      body: `
      ${box(40, 200, 150, 70, "Upstream (sourcing)", { fill: "rgba(96,165,250,0.14)", stroke: "rgba(96,165,250,0.5)", text: "#bfdbfe", size: 13 })}
      ${arrow(190, 320, 235)}
      <rect x="320" y="190" width="180" height="90" rx="12" fill="rgba(124,58,237,0.18)" stroke="url(#accent)" stroke-width="3"/>
      <text x="410" y="225" fill="#e9d5ff" font-family="${FONT}" font-size="15" font-weight="800" text-anchor="middle">The task</text>
      <text x="410" y="250" fill="#c4b5fd" font-family="${FONT}" font-size="12" text-anchor="middle">AI compresses this</text>
      ${arrow(500, 630, 235)}
      ${box(630, 200, 150, 70, "Downstream (offer, onboard)", { fill: "rgba(16,185,129,0.14)", stroke: "rgba(110,231,183,0.5)", text: "#a7f3d0", size: 12 })}
      ${box(140, 330, 540, 56, "See only the task → at risk.  See upstream + downstream → leverage.", { fill: "rgba(245,158,11,0.10)", stroke: "rgba(252,211,77,0.4)", text: "#fcd34d", size: 14, weight: 700 })}`,
    }),
  },
  "must-l3": {
    alt: "A briefing template with five labelled fields: Role, Context, Input, Output, Constraints.",
    svg: frame({
      eyebrow: "Lesson 3",
      title: "Brief AI like a domain expert",
      body: `
      ${[
        ["ROLE", "who the AI should be"],
        ["CONTEXT", "what's happening, what you want, constraints"],
        ["INPUT", "the raw material"],
        ["OUTPUT", "exact format, length, tone"],
        ["CONSTRAINTS", "what to avoid · what must appear"],
      ].map(([k, v], i) => `${box(40, 130 + i * 60, 160, 48, k, { fill: "rgba(124,58,237,0.16)", stroke: "rgba(167,139,250,0.5)", text: "#c4b5fd", size: 15, weight: 800 })}
        <text x="220" y="${130 + i * 60 + 28}" fill="rgba(255,255,255,0.75)" font-family="${FONT}" font-size="14" dominant-baseline="central">${v}</text>`).join("")}`,
    }),
  },

  // ── Building with the Claude API ───────────────────────────────────
  "claude-l1": {
    alt: "A minimal request flow: your code calls client.messages.create, the Claude API responds, you read response.content.",
    svg: frame({
      eyebrow: "Lesson 1",
      title: "First message via the SDK",
      body: `
      ${box(40, 190, 180, 80, "Your code", { fill: "rgba(96,165,250,0.16)", stroke: "rgba(96,165,250,0.5)", text: "#bfdbfe" })}
      ${arrow(220, 320, 230)}
      <text x="270" y="222" fill="rgba(255,255,255,0.6)" font-family="${FONT}" font-size="12" text-anchor="middle">messages.create</text>
      ${box(320, 190, 180, 80, "Claude API", { fill: "rgba(124,58,237,0.18)", stroke: "rgba(167,139,250,0.5)", text: "#c4b5fd" })}
      ${arrow(500, 600, 230)}
      <text x="550" y="222" fill="rgba(255,255,255,0.6)" font-family="${FONT}" font-size="12" text-anchor="middle">response</text>
      ${box(600, 190, 180, 80, "content[0].text", { fill: "rgba(16,185,129,0.16)", stroke: "rgba(110,231,183,0.5)", text: "#a7f3d0", size: 14 })}
      ${box(40, 320, 230, 70, "Opus — hardest reasoning", { fill: "rgba(255,255,255,0.05)", text: "rgba(255,255,255,0.7)", size: 13 })}
      ${box(295, 320, 230, 70, "Sonnet — default workhorse", { fill: "rgba(255,255,255,0.05)", text: "rgba(255,255,255,0.7)", size: 13 })}
      ${box(550, 320, 230, 70, "Haiku — fast & cheap", { fill: "rgba(255,255,255,0.05)", text: "rgba(255,255,255,0.7)", size: 13 })}`,
    }),
  },
  "claude-l2": {
    alt: "The tool-use agent loop: model returns tool_use, you execute the function, return tool_result, the model continues until it stops.",
    svg: frame({
      eyebrow: "Lesson 2",
      title: "Tool use — the agent loop",
      body: `
      ${box(300, 130, 220, 70, "Model", { fill: "rgba(124,58,237,0.18)", stroke: "rgba(167,139,250,0.5)", text: "#c4b5fd", size: 16 })}
      ${box(560, 240, 220, 70, "tool_use block", { fill: "rgba(245,158,11,0.16)", stroke: "rgba(252,211,77,0.5)", text: "#fcd34d", size: 14 })}
      ${box(300, 350, 220, 70, "You run the function", { fill: "rgba(96,165,250,0.16)", stroke: "rgba(96,165,250,0.5)", text: "#bfdbfe", size: 14 })}
      ${box(40, 240, 220, 70, "tool_result back", { fill: "rgba(16,185,129,0.16)", stroke: "rgba(110,231,183,0.5)", text: "#a7f3d0", size: 14 })}
      <g stroke="#7c3aed" stroke-width="3" fill="#7c3aed">
        <path d="M 520 175 q 80 20 110 60" fill="none"/><polygon points="628,232 638,246 614,248" stroke="none"/>
        <path d="M 600 310 q -40 50 -120 55" fill="none"/><polygon points="490,358 476,368 478,344" stroke="none"/>
        <path d="M 300 385 q -120 -10 -150 -60" fill="none"/><polygon points="148,316 140,302 162,302" stroke="none"/>
        <path d="M 150 240 q 30 -90 150 -100" fill="none"/><polygon points="296,128 312,138 292,150" stroke="none"/>
      </g>
      <text x="410" y="300" fill="rgba(255,255,255,0.55)" font-family="${FONT}" font-size="13" text-anchor="middle">loop until stop_reason ≠ tool_use</text>`,
    }),
  },
  "claude-l3": {
    alt: "Prompt caching: the first call pays a write premium, then reads within the 5-minute TTL cost ~10% — cache the system prompt, not the user message.",
    svg: frame({
      eyebrow: "Lesson 3",
      title: "Prompt caching — the cost lever",
      body: `
      ${box(40, 160, 170, 80, "Call 1: cache write", { fill: "rgba(245,158,11,0.16)", stroke: "rgba(252,211,77,0.5)", text: "#fcd34d", size: 14 })}
      <text x="125" y="262" fill="rgba(255,255,255,0.55)" font-family="${FONT}" font-size="12" text-anchor="middle">+25% once</text>
      ${[0, 1, 2].map((i) => `${box(260 + i * 150, 160, 130, 80, "read", { fill: "rgba(16,185,129,0.16)", stroke: "rgba(110,231,183,0.5)", text: "#a7f3d0", size: 14 })}
        <text x="${260 + i * 150 + 65}" y="262" fill="rgba(255,255,255,0.55)" font-family="${FONT}" font-size="12" text-anchor="middle">~10% cost</text>`).join("")}
      <line x1="40" y1="295" x2="780" y2="295" stroke="rgba(255,255,255,0.25)" stroke-dasharray="5 5"/>
      <text x="780" y="288" fill="rgba(255,255,255,0.5)" font-family="${FONT}" font-size="12" text-anchor="end">5-minute TTL window</text>
      ${box(40, 330, 360, 60, "Cache: system prompt · long refs · few-shot", { fill: "rgba(16,185,129,0.10)", stroke: "rgba(110,231,183,0.4)", text: "#a7f3d0", size: 13, weight: 700 })}
      ${box(420, 330, 360, 60, "Don't cache: the user message (changes every call)", { fill: "rgba(239,68,68,0.08)", stroke: "rgba(248,113,113,0.35)", text: "#fca5a5", size: 13, weight: 700 })}`,
    }),
  },
};

export function getCourseDiagram(key: string): CourseDiagram | undefined {
  return COURSE_DIAGRAMS[key];
}
