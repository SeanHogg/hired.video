/**
 * #285 — NLE M5 capability registry. Lightworks-Pro parity is shipped
 * as a long series of small capabilities, each gated by a flag here.
 * The registry is the SSoT both the editor UI and the export pipeline
 * read from when deciding "do we show / use this feature yet?".
 *
 * A capability is "shipped" only when the corresponding implementation
 * file lands. Until then the editor surfaces the capability in a
 * "coming soon" state (greyed out + linked to the gap-register entry)
 * so users see the roadmap without us pretending parity exists.
 *
 * Each entry's `gapId` points back to the consolidated gap register so
 * a closing PR knows where to flip the status. The `tier` axis carries
 * the entitlement signal — most capabilities are Pro-gated; "preview"
 * capabilities are surfaced to Free as a marketing teaser.
 */

export type NleCapabilityTier = "free" | "pro" | "preview";

export type NleCapabilityStatus = "shipped" | "in_progress" | "planned";

export interface NleCapability {
  id: string;
  label: string;
  description: string;
  status: NleCapabilityStatus;
  tier: NleCapabilityTier;
  /** Gap-register entry id (the "#XXX" without the hash). */
  gapId: number;
}

export const NLE_M5_CAPABILITIES: ReadonlyArray<NleCapability> = [
  {
    id: "total_fx_pack",
    label: "Total FX (50+ effects)",
    description: "In-house effects suite — blur, glow, vignette, film grain, chromatic aberration, etc.",
    status: "planned",
    tier: "pro",
    gapId: 285,
  },
  {
    id: "motion_graphics",
    label: "Motion Graphics",
    description: "Lottie import + animatable text / shape primitives.",
    status: "planned",
    tier: "pro",
    gapId: 285,
  },
  {
    id: "advanced_titles",
    label: "Advanced Titles",
    description: "~50 animated lower-thirds catalog with custom-text fields.",
    status: "planned",
    tier: "pro",
    gapId: 285,
  },
  {
    id: "advanced_transitions",
    label: "Advanced Transitions",
    description: "Glitch / whip / lumetri-key / push / dip-to-color and more.",
    status: "planned",
    tier: "pro",
    gapId: 285,
  },
  {
    id: "r3d_raw_decode",
    label: "RED RAW (R3D) decode",
    description: "ffmpeg.wasm-based R3D decode; best-effort in-browser, server fallback for full pipeline.",
    status: "planned",
    tier: "pro",
    gapId: 285,
  },
  {
    id: "custom_export_profiles",
    label: "Custom export profiles",
    description: "Save codec / container / bitrate / resolution presets per account.",
    status: "planned",
    tier: "pro",
    gapId: 285,
  },
  {
    id: "export_8k",
    label: "8K export",
    description: "Server-fallback render for projects larger than the browser comfortably handles.",
    status: "planned",
    tier: "pro",
    gapId: 285,
  },
  {
    id: "advanced_proxies",
    label: "Advanced proxies",
    description: "1080p ProRes Proxy + ProRes LT 4K proxies for offline-style editing of 4K+ sources.",
    status: "planned",
    tier: "pro",
    gapId: 285,
  },
  {
    id: "daw_export",
    label: "Send to DAW",
    description: "Multi-channel WAV with timecode + Reaper / Audition project file.",
    status: "planned",
    tier: "pro",
    gapId: 285,
  },
  {
    id: "advanced_audio_fx",
    label: "Advanced Audio FX",
    description: "Native de-esser, multiband compressor, gate. Stays client-side via WebAudio.",
    status: "planned",
    tier: "pro",
    gapId: 285,
  },
  // #292 — A/V mixing is the M2 milestone for the audio mixer. Surfaces
  // here so the M5 capability page lists it alongside the post-M4 work
  // even though it's earlier in the milestone graph.
  {
    id: "av_audio_mixing",
    label: "A/V audio mixing",
    description: "Mix audio from video clips alongside dedicated audio tracks during the offline mix pass.",
    status: "in_progress",
    tier: "pro",
    gapId: 292,
  },
] as const;

export function getNleCapability(id: string): NleCapability | undefined {
  return NLE_M5_CAPABILITIES.find((c) => c.id === id);
}

export function listShippedCapabilities(): NleCapability[] {
  return NLE_M5_CAPABILITIES.filter((c) => c.status === "shipped");
}
