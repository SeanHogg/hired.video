/** Output profiles for the self-hosted runtimes (game / comic / image / cad / document). */

import type { OutputProfile } from "./output-profile-types.js";

export const RUNTIME_KIND_OUTPUT_PROFILES: OutputProfile[] = [
  // ─── Game ──────────────────────────────────────────────────────────────────
  // Container/codec fields don't map onto game outputs — they're runtime
  // bundles, not media files. We still expose them via the same
  // `OutputProfile` shape so the save-menu and publish surfaces don't
  // need a per-kind branch; videoCodec/audioCodec stay null and the
  // container carries the bundle format. The render facade reads the
  // `id` to dispatch to the game-export pipeline once it ships.
  {
    id: "game-html5-bundle",
    label: "HTML5 bundle (ZIP)",
    hint: "Self-contained · drop on any web host",
    mediaKind: "game",
    container: "html5-bundle",
    mime: "application/zip",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".zip",
  },
  {
    id: "game-itch-zip",
    label: "itch.io ZIP",
    hint: "Pre-formatted for itch.io HTML5 upload",
    mediaKind: "game",
    container: "html5-bundle",
    mime: "application/zip",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".zip",
  },
  {
    id: "game-web-embed",
    label: "Web embed (iframe URL)",
    hint: "Hosted on hired.video · embeddable anywhere",
    mediaKind: "game",
    container: "web-embed",
    mime: "text/html",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: "",
  },

  // ─── Comic ─────────────────────────────────────────────────────────────────
  // Comics render as a sequence of pages of panels. The static exports
  // are the canonical artefacts (PNG strip / PDF / CBZ); motion-comic
  // exports reuse the animation containers (MP4 / GIF / WebP) since the
  // page-reveal pipeline is structurally an animation.
  {
    id: "comic-png-strip",
    label: "PNG strip",
    hint: "Tall vertical · social-ready · scrollable",
    mediaKind: "comic",
    container: "png-strip",
    mime: "image/png",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".png",
  },
  {
    id: "comic-pdf",
    label: "PDF (paginated)",
    hint: "One page per comic page · printable",
    mediaKind: "comic",
    container: "pdf",
    mime: "application/pdf",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".pdf",
  },
  {
    id: "comic-cbz",
    label: "CBZ archive",
    hint: "Comic-reader format · Pro",
    mediaKind: "comic",
    container: "cbz",
    mime: "application/vnd.comicbook+zip",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".cbz",
  },
  {
    id: "comic-motion-mp4",
    label: "Motion comic (MP4)",
    hint: "Panel reveals + narration · share on socials",
    mediaKind: "comic",
    container: "mp4",
    mime: "video/mp4",
    videoCodec: "h264",
    audioCodec: "aac",
    proOnly: false,
    fileExt: ".mp4",
  },
  {
    id: "comic-motion-gif",
    label: "Motion comic (GIF)",
    hint: "Looping reveal · no audio · universal",
    mediaKind: "comic",
    container: "gif",
    mime: "image/gif",
    videoCodec: "gif",
    audioCodec: null,
    proOnly: false,
    fileExt: ".gif",
  },

  // ─── Image (Photoshop-shaped raster authoring — #932) ──────────────────────
  // Single static frame; no time axis, no audio. The DrawingStage
  // composites the layered `ImageState` to a flat raster at export time
  // via the standard browser canvas-2D → Blob path (no ffmpeg).
  {
    id: "image-png",
    label: "PNG",
    hint: "Lossless · transparent",
    mediaKind: "image",
    container: "png",
    mime: "image/png",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".png",
  },
  {
    id: "image-jpg",
    label: "JPEG",
    hint: "Smaller · no transparency",
    mediaKind: "image",
    container: "jpg",
    mime: "image/jpeg",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".jpg",
  },
  {
    id: "image-webp",
    label: "WebP",
    hint: "Smaller than PNG · supports alpha",
    mediaKind: "image",
    container: "webp",
    mime: "image/webp",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".webp",
  },
  {
    id: "image-psd",
    label: "PSD",
    hint: "Photoshop · layers preserved",
    mediaKind: "image",
    container: "psd",
    mime: "image/vnd.adobe.photoshop",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".psd",
  },

  // ─── CAD (2D drafting MVP — #930) ──────────────────────────────────────────
  // Vector drafting; no time axis, no audio. The CadStage emits SVG +
  // PDF directly from the shape list. DXF + DWG + STL + STEP are
  // industry-standard CAD exchange formats — initial scaffold registers
  // the slots; the encoder bodies ship behind these ids when the
  // CAD-export pipeline matures past the Phase 1 scaffold.
  {
    id: "cad-svg",
    label: "SVG",
    hint: "Vector · widest support",
    mediaKind: "cad",
    container: "svg",
    mime: "image/svg+xml",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".svg",
  },
  {
    id: "cad-pdf",
    label: "PDF",
    hint: "Print-ready · paginated",
    mediaKind: "cad",
    container: "pdf",
    mime: "application/pdf",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".pdf",
  },
  {
    id: "cad-dxf",
    label: "DXF",
    hint: "AutoCAD exchange · Pro",
    mediaKind: "cad",
    container: "dxf",
    mime: "application/dxf",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".dxf",
  },
  {
    id: "cad-png",
    label: "PNG",
    hint: "Raster preview · social-share",
    mediaKind: "cad",
    container: "png",
    mime: "image/png",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".png",
  },
  {
    id: "cad-stl",
    label: "STL",
    hint: "3D-printable · ASCII",
    mediaKind: "cad",
    container: "stl",
    mime: "model/stl",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".stl",
  },
  {
    id: "cad-step",
    label: "STEP",
    hint: "ISO 10303 · interoperable",
    mediaKind: "cad",
    container: "step",
    mime: "model/step",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".step",
  },
  // Interactive Comic (#929) — same exporters as linear comic (CBZ /
  // PDF / PNG-strip) plus a JSON bundle that captures the page graph
  // for the reader runtime. The reader resolves branches at runtime;
  // print-style exports walk a deterministic "first valid branch"
  // path so the static artefact still renders the comic as a strip.
  {
    id: "interactive-comic-cbz",
    label: "CBZ",
    hint: "Comic archive · linear flatten",
    mediaKind: "interactive_comic",
    container: "cbz",
    mime: "application/vnd.comicbook+zip",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".cbz",
  },
  {
    id: "interactive-comic-pdf",
    label: "PDF",
    hint: "Print-ready · linear flatten",
    mediaKind: "interactive_comic",
    container: "pdf",
    mime: "application/pdf",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".pdf",
  },
  // CAD 3D (#930 follow-on) — STL / STEP / glTF. The 3D runtime
  // emits STL today via its triangulated mesh, STEP for downstream
  // BREP-aware tools, and PNG renders for thumbnails.
  {
    id: "cad-3d-stl",
    label: "STL",
    hint: "3D-printable · binary",
    mediaKind: "cad_3d",
    container: "stl",
    mime: "model/stl",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".stl",
  },
  {
    id: "cad-3d-step",
    label: "STEP",
    hint: "ISO 10303 · interoperable",
    mediaKind: "cad_3d",
    container: "step",
    mime: "model/step",
    videoCodec: null,
    audioCodec: null,
    proOnly: true,
    fileExt: ".step",
  },
  {
    id: "cad-3d-png",
    label: "PNG",
    hint: "Render · social-share",
    mediaKind: "cad_3d",
    container: "png",
    mime: "image/png",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".png",
  },

  // ─── Document (paged WYSIWYG — #1912) ──────────────────────────────────────
  // Resume / job / article / blog on a fixed print sheet. PDF is the canonical
  // artefact (browser print of the live renderer — preview === render). PNG is
  // a single-page raster for social-share / thumbnails.
  {
    id: "document-pdf",
    label: "PDF",
    hint: "Print-ready · Letter / Legal / A4",
    mediaKind: "document",
    container: "pdf",
    mime: "application/pdf",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".pdf",
  },
  {
    id: "document-png",
    label: "PNG",
    hint: "Single-page raster · social-share",
    mediaKind: "document",
    container: "png",
    mime: "image/png",
    videoCodec: null,
    audioCodec: null,
    proOnly: false,
    fileExt: ".png",
  },
];
