/**
 * Comic genre catalog — single source of truth for every comic-template
 * surface across hired.video.
 *
 * Adding a new genre means ONE entry in this file. Every consumer reads
 * from `COMIC_GENRES` and self-derives — no parallel lookup tables.
 * Per the standing DRY rule, never duplicate genre metadata in the
 * frontend catalog, the AI scaffolder prompt, the SVG asset directory,
 * or the comic reader's theme picker — read from this module instead.
 *
 * Consumers:
 *   - Frontend `frontend/components/studio/templates/catalog.tsx` —
 *     emits one TEMPLATE_CATALOG entry per genre, all sharing a single
 *     `ComicIntake` form.
 *   - Frontend `frontend/lib/studio/editor-v2/template-seeds.ts` —
 *     seeds an empty 6-page CanvasState per genre using `pageBeats` +
 *     `palette` + a representative SVG background.
 *   - Frontend `frontend/components/studio/templates/intake/ComicIntake.tsx` —
 *     renders the genre picker and the protagonist / source / prompt
 *     fields.
 *   - API `api/src/services/comics/scaffolder.ts` — feeds `tone`,
 *     `artDirection`, `narrativeShape`, `pageBeats`, and `sfxPalette`
 *     into the LLM system prompt so generated comics stay on-genre.
 *   - SVG asset library at `frontend/public/comics/{genreId}/` — each
 *     genre ships ~8 SVG primitives (background, character poses, props,
 *     SFX bursts). The catalog's `stockAssets` field is the SSoT for
 *     which assets exist + where to find them.
 *
 * Adding a new genre also requires (1) the SVG directory above; (2) at
 * least one stock-asset entry per category (`backgrounds`, `characters`,
 * `props`, `sfx`) so the scaffolder has something to pick from. Missing
 * categories degrade gracefully — the scaffolder falls back to plain
 * colour panels.
 */

export const COMIC_GENRE_IDS = [
  "hero",
  "noir",
  "scifi",
  "fantasy",
  "romance",
  "slice",
  "manga",
  "horror",
  "comedy",
  "retro80s",
  "webtoon",
  "adventure",
] as const;

export type ComicGenreId = (typeof COMIC_GENRE_IDS)[number];

/** Per-genre palette. Five colour roles every panel needs:
 *  - `paper`: page background (the "paper")
 *  - `ink`: panel borders + text strokes (the "ink")
 *  - `primary`: hero / dominant brand colour
 *  - `secondary`: supporting / antagonist colour
 *  - `accent`: SFX bursts + emphasis (pops against primary) */
export interface ComicPalette {
  paper: string;
  ink: string;
  primary: string;
  secondary: string;
  accent: string;
}

/** Stock asset reference. `path` is relative to /public so consumers
 *  can ship straight at an `<img>` src. */
export interface ComicStockAsset {
  /** Stable id — referenced by scaffolder picks + template seeds. */
  id: string;
  /** Lucide-ish single-line label shown in the asset picker. */
  label: string;
  /** Path under /public — e.g. `/comics/hero/bg-skyline.svg`. */
  path: string;
}

/** Stock assets grouped by purpose. The scaffolder picks one from each
 *  category per page; manual edits in the editor surface the same lists. */
export interface ComicStockAssets {
  backgrounds: ComicStockAsset[];
  /** Hero / antagonist silhouettes + poses. Composed over backgrounds. */
  characters: ComicStockAsset[];
  /** Decorative props the panel layer can add (objects, motion lines,
   *  speed streaks, hearts, stars, magnifying glass, etc). */
  props: ComicStockAsset[];
  /** SFX burst shapes (the bubble behind a "POW!" / "ZZZ" / "BAM!"). */
  sfx: ComicStockAsset[];
}

/** One page's narrative beat — fed to the LLM as a structured prompt so
 *  generated comics follow a coherent 6-page arc. `panelHint` is a
 *  suggested panel count (the LLM may pick 1-4 per page). */
export interface ComicPageBeat {
  pageNumber: number;
  beatId:
    | "hook"
    | "setup"
    | "rising-action"
    | "midpoint"
    | "climax"
    | "resolution";
  /** Headline shown to the user in the editor's page rail. */
  label: string;
  /** Plain-language brief sent to the LLM. */
  brief: string;
  /** Suggested panel count for this page (1-4). */
  panelHint: number;
}

/** The default 6-page narrative shape every genre starts from. Genres
 *  may override individual briefs via `narrativeShape` to colour each
 *  beat with their tone (a noir "Hook" is different from a romance
 *  "Hook"), but the beat ids + panel counts stay stable so the
 *  scaffolder can rely on the structure. */
export const DEFAULT_NARRATIVE_SHAPE: ComicPageBeat[] = [
  { pageNumber: 1, beatId: "hook",          label: "Hook",           brief: "Open on the protagonist's defining problem or desire — what they want and why it's worth chasing.",                                 panelHint: 2 },
  { pageNumber: 2, beatId: "setup",         label: "Setup",          brief: "Establish the world, the stakes, and what's standing in their way. Introduce the supporting cast or the key obstacle.",            panelHint: 3 },
  { pageNumber: 3, beatId: "rising-action", label: "Rising action",  brief: "First attempt — protagonist tries something that almost works. Reveal a skill or strength from their background.",                 panelHint: 3 },
  { pageNumber: 4, beatId: "midpoint",      label: "Midpoint",       brief: "Reversal. Something they thought they knew is wrong, or a new constraint appears. They have to adapt.",                             panelHint: 2 },
  { pageNumber: 5, beatId: "climax",        label: "Climax",         brief: "Final attempt — protagonist puts everything together. A signature achievement or pivotal moment from their resume powers the win.", panelHint: 3 },
  { pageNumber: 6, beatId: "resolution",    label: "Resolution",     brief: "Land the pitch. State who the protagonist is, what they bring, and the call-to-action — how to hire / meet / connect.",             panelHint: 2 },
];

export interface ComicGenre {
  id: ComicGenreId;
  /** Title shown to the user in the picker. */
  label: string;
  /** Sub-line in the picker — 1 sentence. */
  description: string;
  /** Short evocative emoji-like glyph for sparse rows. Plain ASCII so
   *  this file stays grep-friendly. */
  shortLabel: string;
  palette: ComicPalette;
  /** Tone descriptors for the LLM (e.g. "gritty", "earnest"). */
  tone: readonly string[];
  /** Art-direction descriptors used both in LLM prompts AND in
   *  runtime AI-image-gen prompts when the hybrid path is enabled.
   *  Verbatim words that read well as a stable-diffusion prompt suffix. */
  artDirection: string;
  /** Default protagonist framing shown in the intake form's helper
   *  copy. The user can override it; the scaffolder uses this when the
   *  field is left blank. */
  protagonistArchetype: string;
  /** Per-genre overrides for the default narrative shape. Omit a page
   *  to inherit the default brief; include a `brief` to colour the beat
   *  with the genre's tone. */
  narrativeShape?: Partial<Record<ComicPageBeat["beatId"], string>>;
  /** SFX vocabulary the scaffolder will draw from. Genres that don't
   *  use SFX (slice-of-life, webtoon) can ship an empty array — the
   *  scaffolder simply won't emit SFX widgets. */
  sfxPalette: readonly string[];
  /** Typography hints. Font families are CSS stacks resolved by the
   *  reader; falling back to system fonts is fine if the family isn't
   *  loaded. */
  typography: {
    /** Heading / SFX text family. */
    display: string;
    /** Speech bubble + caption family. */
    body: string;
  };
  /** Stock SVG assets shipped under `/public/comics/{id}/`. */
  stockAssets: ComicStockAssets;
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog — order is the order the picker surfaces the cards in.
// ─────────────────────────────────────────────────────────────────────────────

export const COMIC_GENRES: readonly ComicGenre[] = [
  {
    id: "hero",
    label: "Hero / Action",
    description: "Classic superhero arc — big poses, bold colours, exclamation-mark SFX.",
    shortLabel: "Hero",
    palette: { paper: "#fff7ed", ink: "#1c1917", primary: "#2563eb", secondary: "#dc2626", accent: "#facc15" },
    tone: ["bold", "earnest", "high-stakes", "triumphant"],
    artDirection: "comic book inked panel, halftone shading, dramatic low-angle, bold primary colours",
    protagonistArchetype: "A hero with a signature skill stepping up when no one else will.",
    narrativeShape: {
      hook: "Open on the city / the team / the project in crisis — and our hero arriving.",
      climax: "Show the hero using their resume's biggest achievement to save the day.",
    },
    sfxPalette: ["POW!", "BAM!", "BOOM!", "CRACK!", "WHAM!", "ZAP!"],
    typography: { display: "Bangers, Impact, sans-serif", body: "Comic Neue, Comic Sans MS, sans-serif" },
    stockAssets: {
      backgrounds: [
        { id: "skyline-dawn", label: "City skyline at dawn", path: "/comics/hero/bg-skyline.svg" },
        { id: "burst-radial", label: "Radial action burst",  path: "/comics/hero/bg-burst.svg" },
        { id: "halftone",     label: "Halftone dot field",   path: "/comics/hero/bg-halftone.svg" },
      ],
      characters: [
        { id: "hero-cape-pose",  label: "Cape pose",       path: "/comics/hero/char-cape.svg" },
        { id: "hero-punch",      label: "Mid-punch",       path: "/comics/hero/char-punch.svg" },
        { id: "hero-stance",     label: "Hero stance",     path: "/comics/hero/char-stance.svg" },
      ],
      props: [
        { id: "motion-lines",  label: "Motion lines",   path: "/comics/hero/prop-motion-lines.svg" },
        { id: "explosion",     label: "Explosion star", path: "/comics/hero/prop-explosion.svg" },
      ],
      sfx: [
        { id: "sfx-star",      label: "Star burst",     path: "/comics/hero/sfx-star.svg" },
        { id: "sfx-jagged",    label: "Jagged burst",   path: "/comics/hero/sfx-jagged.svg" },
      ],
    },
  },
  {
    id: "noir",
    label: "Noir / Detective",
    description: "Smoky, monochrome, hard-boiled voiceover. The case is your career.",
    shortLabel: "Noir",
    palette: { paper: "#0a0a0a", ink: "#fafafa", primary: "#737373", secondary: "#fca5a5", accent: "#fbbf24" },
    tone: ["moody", "introspective", "wry", "hard-boiled"],
    artDirection: "noir comic panel, deep black ink, rain-soaked street, single-source rim light, monochrome with one spot colour",
    protagonistArchetype: "A detective methodically piecing together the case of who they really are.",
    narrativeShape: {
      hook: "Cold open: rain, neon, a voiceover. The case lands on the desk.",
      resolution: "Closing monologue — the case is solved, the truth is named, the door closes behind them.",
    },
    sfxPalette: ["TAP", "CLICK", "RUMBLE", "RING"],
    typography: { display: "Special Elite, Courier New, monospace", body: "Special Elite, Courier New, monospace" },
    stockAssets: {
      backgrounds: [
        { id: "rain-street",    label: "Rainy street",     path: "/comics/noir/bg-rain-street.svg" },
        { id: "venetian-light", label: "Venetian blind light", path: "/comics/noir/bg-venetian.svg" },
        { id: "smoke",          label: "Smoke",            path: "/comics/noir/bg-smoke.svg" },
      ],
      characters: [
        { id: "detective-coat",  label: "Detective in coat", path: "/comics/noir/char-detective.svg" },
        { id: "silhouette-hat",  label: "Hat silhouette",    path: "/comics/noir/char-silhouette.svg" },
      ],
      props: [
        { id: "cigarette",   label: "Cigarette smoke",  path: "/comics/noir/prop-cigarette.svg" },
        { id: "evidence",    label: "Evidence file",    path: "/comics/noir/prop-evidence.svg" },
      ],
      sfx: [
        { id: "sfx-typewriter", label: "Typewriter caption", path: "/comics/noir/sfx-typewriter.svg" },
      ],
    },
  },
  {
    id: "scifi",
    label: "Sci-Fi / Cyberpunk",
    description: "Neon, chrome, neural nets. Your skills are the augmentations.",
    shortLabel: "SciFi",
    palette: { paper: "#0f172a", ink: "#e0f2fe", primary: "#22d3ee", secondary: "#a855f7", accent: "#fde047" },
    tone: ["sleek", "speculative", "kinetic", "future-shock"],
    artDirection: "cyberpunk comic panel, neon-on-black, chromatic aberration, holographic UI overlays, futuristic skyline",
    protagonistArchetype: "An operator wired into the network using their edge to break the system.",
    narrativeShape: {
      midpoint: "The system fights back — a glitch, a counter-hack, a new constraint forces a pivot.",
    },
    sfxPalette: ["BZZT", "WHIRRR", "BOOT", "PING", "STATIC"],
    typography: { display: "Orbitron, monospace", body: "IBM Plex Mono, monospace" },
    stockAssets: {
      backgrounds: [
        { id: "neon-city",      label: "Neon megacity",    path: "/comics/scifi/bg-neon-city.svg" },
        { id: "circuit",        label: "Circuit board",    path: "/comics/scifi/bg-circuit.svg" },
        { id: "hologram-grid",  label: "Holographic grid", path: "/comics/scifi/bg-hologram.svg" },
      ],
      characters: [
        { id: "operator-rig",   label: "Operator with rig", path: "/comics/scifi/char-operator.svg" },
        { id: "drone",          label: "Drone companion",   path: "/comics/scifi/char-drone.svg" },
      ],
      props: [
        { id: "hud",         label: "HUD overlay",     path: "/comics/scifi/prop-hud.svg" },
        { id: "data-stream", label: "Data stream",     path: "/comics/scifi/prop-data.svg" },
      ],
      sfx: [
        { id: "sfx-pulse",   label: "Pulse ring",      path: "/comics/scifi/sfx-pulse.svg" },
      ],
    },
  },
  {
    id: "fantasy",
    label: "Fantasy / Quest",
    description: "Maps, scrolls, mythic quests. Your CV is the chronicle.",
    shortLabel: "Fantasy",
    palette: { paper: "#fef3c7", ink: "#451a03", primary: "#7c2d12", secondary: "#065f46", accent: "#b45309" },
    tone: ["mythic", "earnest", "lyrical", "heroic"],
    artDirection: "fantasy comic panel, illuminated-manuscript border, watercolour shading, sweeping landscape, parchment paper",
    protagonistArchetype: "A traveller answering the call to a kingdom-shaping quest.",
    sfxPalette: ["CLANG", "WHOOSH", "ROAR", "CRACKLE"],
    typography: { display: "Cinzel, serif", body: "EB Garamond, serif" },
    stockAssets: {
      backgrounds: [
        { id: "mountain-pass", label: "Mountain pass",  path: "/comics/fantasy/bg-mountain.svg" },
        { id: "parchment",     label: "Parchment map",  path: "/comics/fantasy/bg-parchment.svg" },
        { id: "castle",        label: "Castle on hill", path: "/comics/fantasy/bg-castle.svg" },
      ],
      characters: [
        { id: "hero-sword",   label: "Hero with sword",  path: "/comics/fantasy/char-sword.svg" },
        { id: "mage-staff",   label: "Mage with staff",  path: "/comics/fantasy/char-mage.svg" },
      ],
      props: [
        { id: "scroll",  label: "Scroll",       path: "/comics/fantasy/prop-scroll.svg" },
        { id: "lantern", label: "Lantern",      path: "/comics/fantasy/prop-lantern.svg" },
      ],
      sfx: [
        { id: "sfx-rune",   label: "Glowing rune", path: "/comics/fantasy/sfx-rune.svg" },
      ],
    },
  },
  {
    id: "romance",
    label: "Romance",
    description: "Hearts, sparkles, sincere voiceover. Make them fall for your story.",
    shortLabel: "Romance",
    palette: { paper: "#fff1f2", ink: "#831843", primary: "#ec4899", secondary: "#f43f5e", accent: "#fbcfe8" },
    tone: ["warm", "sincere", "intimate", "hopeful"],
    artDirection: "romance comic panel, soft pastel wash, floating petals, blushing close-up, gentle bokeh background",
    protagonistArchetype: "Someone earning the courage to ask for what they want.",
    narrativeShape: {
      midpoint: "A misunderstanding — they almost lose what they wanted.",
      resolution: "An honest ask, accepted. The relationship begins.",
    },
    sfxPalette: ["BA-DUM", "SIGH", "FLUTTER", "BLUSH"],
    typography: { display: "Playfair Display, serif", body: "Lora, serif" },
    stockAssets: {
      backgrounds: [
        { id: "petals",       label: "Petal shower",   path: "/comics/romance/bg-petals.svg" },
        { id: "cafe",         label: "Cafe interior",  path: "/comics/romance/bg-cafe.svg" },
        { id: "sunset",       label: "Sunset rooftop", path: "/comics/romance/bg-sunset.svg" },
      ],
      characters: [
        { id: "duo-coffee",   label: "Two at coffee",  path: "/comics/romance/char-duo.svg" },
        { id: "solo-blush",   label: "Blushing close-up", path: "/comics/romance/char-blush.svg" },
      ],
      props: [
        { id: "hearts",   label: "Floating hearts", path: "/comics/romance/prop-hearts.svg" },
        { id: "sparkles", label: "Sparkles",        path: "/comics/romance/prop-sparkles.svg" },
      ],
      sfx: [
        { id: "sfx-heart-burst", label: "Heart burst", path: "/comics/romance/sfx-heart-burst.svg" },
      ],
    },
  },
  {
    id: "slice",
    label: "Slice-of-Life",
    description: "Quiet, warm, observational. Real life with a soft glow.",
    shortLabel: "Slice",
    palette: { paper: "#fefce8", ink: "#1f2937", primary: "#84cc16", secondary: "#06b6d4", accent: "#f59e0b" },
    tone: ["observational", "warm", "humble", "everyday"],
    artDirection: "slice-of-life comic panel, soft watercolour, natural daylight, casual posture, sketchy linework",
    protagonistArchetype: "An everyday person doing meaningful work in unflashy ways.",
    sfxPalette: [],
    typography: { display: "Caveat, cursive", body: "Quicksand, sans-serif" },
    stockAssets: {
      backgrounds: [
        { id: "kitchen-window", label: "Kitchen window", path: "/comics/slice/bg-kitchen.svg" },
        { id: "park-bench",     label: "Park bench",     path: "/comics/slice/bg-park.svg" },
        { id: "morning-desk",   label: "Morning desk",   path: "/comics/slice/bg-desk.svg" },
      ],
      characters: [
        { id: "person-cup",   label: "Person with cup", path: "/comics/slice/char-cup.svg" },
        { id: "person-laptop", label: "Person at laptop", path: "/comics/slice/char-laptop.svg" },
      ],
      props: [
        { id: "houseplant", label: "Houseplant",   path: "/comics/slice/prop-plant.svg" },
        { id: "notebook",   label: "Notebook",     path: "/comics/slice/prop-notebook.svg" },
      ],
      sfx: [],
    },
  },
  {
    id: "manga",
    label: "Manga / Shonen",
    description: "Speed lines, dramatic eyes, declared-aloud goals. Your career arc — but shonen.",
    shortLabel: "Manga",
    palette: { paper: "#ffffff", ink: "#0a0a0a", primary: "#dc2626", secondary: "#1d4ed8", accent: "#fde047" },
    tone: ["energetic", "earnest", "ambitious", "declarative"],
    artDirection: "shonen manga panel, screentone shading, speed lines, expressive eyes, dramatic foreshortening, black-and-white with one spot colour",
    protagonistArchetype: "A determined newcomer declaring their dream and training to reach it.",
    sfxPalette: ["DOKI", "BAM!", "GASP!", "WHOOSH", "DON!"],
    typography: { display: "Anton, sans-serif", body: "Noto Sans JP, sans-serif" },
    stockAssets: {
      backgrounds: [
        { id: "speed-lines",  label: "Speed lines",    path: "/comics/manga/bg-speed.svg" },
        { id: "screentone",   label: "Screentone",     path: "/comics/manga/bg-screentone.svg" },
        { id: "training-dojo", label: "Training dojo", path: "/comics/manga/bg-dojo.svg" },
      ],
      characters: [
        { id: "shonen-pose",  label: "Shonen pose",    path: "/comics/manga/char-shonen.svg" },
        { id: "side-eye",     label: "Determined eyes", path: "/comics/manga/char-eyes.svg" },
      ],
      props: [
        { id: "energy-aura", label: "Energy aura",     path: "/comics/manga/prop-aura.svg" },
        { id: "sweat-drop",  label: "Sweat drop",      path: "/comics/manga/prop-sweat.svg" },
      ],
      sfx: [
        { id: "sfx-impact-star", label: "Impact star", path: "/comics/manga/sfx-impact.svg" },
      ],
    },
  },
  {
    id: "horror",
    label: "Horror / Gothic",
    description: "Inky shadows, creeping dread, a slow reveal. Make the reader want to look away — then read on.",
    shortLabel: "Horror",
    palette: { paper: "#18181b", ink: "#e7e5e4", primary: "#7f1d1d", secondary: "#1e293b", accent: "#a3e635" },
    tone: ["uneasy", "atmospheric", "deliberate", "tense"],
    artDirection: "gothic horror comic panel, heavy ink shadows, candlelit reveal, slow zoom, oppressive negative space",
    protagonistArchetype: "Someone facing the unknown — and walking toward it anyway.",
    narrativeShape: {
      climax: "The threshold is crossed. The protagonist looks the thing in the eye.",
    },
    sfxPalette: ["DRIP", "CREAK", "HISS", "RATTLE", "THUMP"],
    typography: { display: "UnifrakturCook, serif", body: "Crimson Text, serif" },
    stockAssets: {
      backgrounds: [
        { id: "old-house",   label: "Old house",     path: "/comics/horror/bg-house.svg" },
        { id: "fog",         label: "Fog",           path: "/comics/horror/bg-fog.svg" },
        { id: "candlelight", label: "Candlelight",   path: "/comics/horror/bg-candle.svg" },
      ],
      characters: [
        { id: "robed-figure", label: "Robed figure",  path: "/comics/horror/char-robed.svg" },
        { id: "lantern-walker", label: "Lantern walker", path: "/comics/horror/char-lantern.svg" },
      ],
      props: [
        { id: "raven",   label: "Raven",      path: "/comics/horror/prop-raven.svg" },
        { id: "tendril", label: "Tendril",    path: "/comics/horror/prop-tendril.svg" },
      ],
      sfx: [
        { id: "sfx-drip",   label: "Drip drop",      path: "/comics/horror/sfx-drip.svg" },
      ],
    },
  },
  {
    id: "comedy",
    label: "Comedy / Cartoon",
    description: "Goofy, bouncy, big takes. Sell yourself with a punchline.",
    shortLabel: "Comedy",
    palette: { paper: "#ecfeff", ink: "#0c4a6e", primary: "#f97316", secondary: "#a855f7", accent: "#facc15" },
    tone: ["playful", "self-aware", "earnest", "punchy"],
    artDirection: "saturday morning cartoon panel, bouncy linework, exaggerated takes, flat colour fills, simple shapes",
    protagonistArchetype: "A lovable mess who somehow keeps shipping great work anyway.",
    sfxPalette: ["BONK!", "BOING!", "HONK!", "OOPS!", "TADA!"],
    typography: { display: "Fredoka, sans-serif", body: "Fredoka, sans-serif" },
    stockAssets: {
      backgrounds: [
        { id: "polka-dots",  label: "Polka dots",   path: "/comics/comedy/bg-polka.svg" },
        { id: "stripes",     label: "Cartoon stripes", path: "/comics/comedy/bg-stripes.svg" },
        { id: "office",      label: "Cartoon office", path: "/comics/comedy/bg-office.svg" },
      ],
      characters: [
        { id: "goof-pose",   label: "Goofy pose",    path: "/comics/comedy/char-goof.svg" },
        { id: "thumbs-up",   label: "Thumbs up",     path: "/comics/comedy/char-thumbs.svg" },
      ],
      props: [
        { id: "banana-peel", label: "Banana peel",   path: "/comics/comedy/prop-banana.svg" },
        { id: "confetti",    label: "Confetti",      path: "/comics/comedy/prop-confetti.svg" },
      ],
      sfx: [
        { id: "sfx-bounce",  label: "Bouncy burst",  path: "/comics/comedy/sfx-bounce.svg" },
      ],
    },
  },
  {
    id: "retro80s",
    label: "Retro 80s / Synthwave",
    description: "Chrome, grid, sunset. Career narrative as VHS cover art.",
    shortLabel: "Retro",
    palette: { paper: "#1e1b4b", ink: "#f0abfc", primary: "#f472b6", secondary: "#22d3ee", accent: "#fbbf24" },
    tone: ["nostalgic", "stylish", "bold", "synthwave"],
    artDirection: "synthwave retro 80s panel, grid horizon, chrome lettering, sunset gradient, VHS scanline overlay",
    protagonistArchetype: "A character driving toward the future on a perfectly soundtracked highway.",
    sfxPalette: ["NEON", "VHS", "STATIC", "CHROME"],
    typography: { display: "Audiowide, sans-serif", body: "Major Mono Display, monospace" },
    stockAssets: {
      backgrounds: [
        { id: "grid-sunset", label: "Grid sunset",   path: "/comics/retro80s/bg-grid-sunset.svg" },
        { id: "palms",       label: "Palm silhouettes", path: "/comics/retro80s/bg-palms.svg" },
        { id: "scanlines",   label: "VHS scanlines", path: "/comics/retro80s/bg-scanlines.svg" },
      ],
      characters: [
        { id: "driver",      label: "Driver in car", path: "/comics/retro80s/char-driver.svg" },
        { id: "neon-figure", label: "Neon outline figure", path: "/comics/retro80s/char-neon.svg" },
      ],
      props: [
        { id: "boombox",  label: "Boombox",       path: "/comics/retro80s/prop-boombox.svg" },
        { id: "cassette", label: "Cassette tape", path: "/comics/retro80s/prop-cassette.svg" },
      ],
      sfx: [
        { id: "sfx-laser", label: "Laser burst",  path: "/comics/retro80s/sfx-laser.svg" },
      ],
    },
  },
  {
    id: "webtoon",
    label: "Webtoon / Modern",
    description: "Vertical-scroll, soft colour, expressive close-ups. The native social comic.",
    shortLabel: "Webtoon",
    palette: { paper: "#ffffff", ink: "#27272a", primary: "#6366f1", secondary: "#14b8a6", accent: "#fb7185" },
    tone: ["modern", "expressive", "conversational", "snackable"],
    artDirection: "webtoon vertical comic panel, soft flat-colour shading, expressive eyes, social-media-ready vertical composition, white gutters",
    protagonistArchetype: "A relatable narrator walking the reader through their journey.",
    sfxPalette: ["..", "...", "!!", "?!"],
    typography: { display: "Poppins, sans-serif", body: "Poppins, sans-serif" },
    stockAssets: {
      backgrounds: [
        { id: "gradient-soft", label: "Soft gradient", path: "/comics/webtoon/bg-gradient.svg" },
        { id: "indoor-soft",   label: "Indoor soft",   path: "/comics/webtoon/bg-indoor.svg" },
        { id: "outdoor-pastel", label: "Outdoor pastel", path: "/comics/webtoon/bg-outdoor.svg" },
      ],
      characters: [
        { id: "talking-head",  label: "Talking head",  path: "/comics/webtoon/char-head.svg" },
        { id: "two-shot",      label: "Two-shot",      path: "/comics/webtoon/char-two.svg" },
      ],
      props: [
        { id: "phone",    label: "Phone in hand", path: "/comics/webtoon/prop-phone.svg" },
        { id: "thought-cloud", label: "Thought cloud", path: "/comics/webtoon/prop-thought.svg" },
      ],
      sfx: [],
    },
  },
  {
    id: "adventure",
    label: "Adventure / Pulp",
    description: "Maps, planes, derring-do. Indiana-Jones-ing your way through your career.",
    shortLabel: "Pulp",
    palette: { paper: "#fef3c7", ink: "#1c1917", primary: "#b45309", secondary: "#166534", accent: "#dc2626" },
    tone: ["intrepid", "warm", "kinetic", "wonder-struck"],
    artDirection: "pulp adventure comic panel, sepia paper, hand-drawn map overlay, dynamic action lines, warm vintage colour",
    protagonistArchetype: "An adventurer chasing one big find — and discovering themself en route.",
    sfxPalette: ["SWISH", "CRASH!", "WHIRR", "AHA!"],
    typography: { display: "Alfa Slab One, serif", body: "Merriweather, serif" },
    stockAssets: {
      backgrounds: [
        { id: "map-overlay", label: "Map overlay",   path: "/comics/adventure/bg-map.svg" },
        { id: "jungle",      label: "Jungle",        path: "/comics/adventure/bg-jungle.svg" },
        { id: "biplane-sky", label: "Biplane sky",   path: "/comics/adventure/bg-biplane.svg" },
      ],
      characters: [
        { id: "explorer-hat", label: "Explorer in hat", path: "/comics/adventure/char-explorer.svg" },
        { id: "running",      label: "Running pose",    path: "/comics/adventure/char-running.svg" },
      ],
      props: [
        { id: "compass", label: "Compass",       path: "/comics/adventure/prop-compass.svg" },
        { id: "satchel", label: "Satchel + map", path: "/comics/adventure/prop-satchel.svg" },
      ],
      sfx: [
        { id: "sfx-dust",   label: "Dust burst",  path: "/comics/adventure/sfx-dust.svg" },
      ],
    },
  },
];

// ─── Lookups ─────────────────────────────────────────────────────────────────

/** Find a genre by id. Falls back to "hero" for unknown / undefined input
 *  so render paths never crash on a malformed `genreId`. */
export function getComicGenre(id: ComicGenreId | string | undefined): ComicGenre {
  return COMIC_GENRES.find((g) => g.id === id) ?? COMIC_GENRES[0];
}

/** Resolve the per-page beats for a genre, merging the genre's
 *  `narrativeShape` overrides onto the default 6-page arc. Always
 *  returns 6 pages — the scaffolder and the editor's page rail rely on
 *  the count being stable. */
export function getNarrativeShape(genre: ComicGenre): ComicPageBeat[] {
  return DEFAULT_NARRATIVE_SHAPE.map((beat) => {
    const override = genre.narrativeShape?.[beat.beatId];
    return override ? { ...beat, brief: override } : beat;
  });
}

/** Pick a stock asset from a category by deterministic-ish index so the
 *  scaffolder picks varied assets across pages without an RNG dependency.
 *  Wraps modulo so out-of-range indices stay valid. Returns `null` when
 *  the category is empty (some genres ship no SFX — that's intentional). */
export function pickStockAsset(
  assets: ComicStockAsset[],
  index: number,
): ComicStockAsset | null {
  if (assets.length === 0) return null;
  return assets[((index % assets.length) + assets.length) % assets.length];
}
