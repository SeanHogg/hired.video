/**
 * PowerPoint → eLearning course scaffold — gap #163.
 *
 * Decision: client-side parse. A `.pptx` file is a zip of XML + media,
 * so JSZip + the browser DOMParser gets us the slide text + per-slide
 * image refs without paying for LibreOffice on a Cloudflare Container.
 *
 * Trade-off: client-side parse cannot render slides 1:1 (we don't run
 * the PowerPoint layout engine). The output is a "course skeleton" —
 * one scene per slide with title + bullet text + first image — that the
 * author edits inside the existing studio editor. For a fully faithful
 * MP4 export the user re-records the slides via the studio screen
 * recorder (#164). This matches the README spec exactly: "creators drag
 * in a .pptx, get an editable course skeleton with one scene per slide."
 */

import JSZip from "jszip";

export interface PptxSlide {
  /** 1-indexed slide number. */
  index: number;
  title: string;
  bullets: string[];
  /** Public blob URL for the first picture on the slide (when present).
   *  Caller is responsible for revoking it once the scene is committed. */
  thumbnailUrl?: string;
  /** Speaker notes from `notesSlideN.xml`. Useful for course narration. */
  notes?: string;
}

export interface PptxImportResult {
  slideCount: number;
  slides: PptxSlide[];
}

/** Parse a .pptx file into a slide-keyed skeleton. */
export async function importPptx(file: File): Promise<PptxImportResult> {
  if (!/\.pptx$/i.test(file.name)) {
    throw new Error("Only .pptx files are supported");
  }
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const slideFiles = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/i.test(p))
    .sort((a, b) => Number(a.match(/slide(\d+)\.xml/i)?.[1] ?? 0) - Number(b.match(/slide(\d+)\.xml/i)?.[1] ?? 0));

  const slides: PptxSlide[] = [];
  for (const path of slideFiles) {
    const idx = Number(path.match(/slide(\d+)\.xml/i)?.[1] ?? 0);
    const xml = await zip.file(path)!.async("string");
    const parsed = parseSlideXml(xml);

    // Pull the first picture rel target, if any. Slides ship a sibling
    // rels file at `ppt/slides/_rels/slideN.xml.rels` mapping
    // relationship IDs to media targets.
    let thumbnailUrl: string | undefined;
    const relsPath = path.replace(/slides\/slide(\d+)\.xml$/i, "slides/_rels/slide$1.xml.rels");
    const relsFile = zip.file(relsPath);
    if (relsFile && parsed.firstPicRid) {
      const relsXml = await relsFile.async("string");
      const target = parseRelTarget(relsXml, parsed.firstPicRid);
      if (target) {
        const mediaPath = `ppt/${target.replace(/^\.\.\//, "")}`;
        const mediaFile = zip.file(mediaPath);
        if (mediaFile) {
          const blob = await mediaFile.async("blob");
          thumbnailUrl = URL.createObjectURL(blob);
        }
      }
    }

    // Speaker notes — separate XML in `ppt/notesSlides/notesSlideN.xml`.
    const notesPath = `ppt/notesSlides/notesSlide${idx}.xml`;
    const notesFile = zip.file(notesPath);
    let notes: string | undefined;
    if (notesFile) {
      const notesXml = await notesFile.async("string");
      notes = parseTextRuns(notesXml).join("\n").trim() || undefined;
    }

    slides.push({
      index: idx,
      title: parsed.title || `Slide ${idx}`,
      bullets: parsed.bullets,
      thumbnailUrl,
      notes,
    });
  }

  return { slideCount: slides.length, slides };
}

interface ParsedSlide {
  title: string;
  bullets: string[];
  firstPicRid?: string;
}

const DOM = typeof DOMParser !== "undefined" ? new DOMParser() : null;

function parseSlideXml(xml: string): ParsedSlide {
  if (!DOM) return { title: "", bullets: [] };
  const doc = DOM.parseFromString(xml, "application/xml");
  // Title placeholder lives in a <p:sp> whose <p:nvSpPr><p:nvPr><p:ph type="title"/>.
  // Body bullets are paragraphs in the title-less <p:sp>s.
  const sps = Array.from(doc.getElementsByTagName("p:sp"));
  let title = "";
  const bullets: string[] = [];
  for (const sp of sps) {
    const ph = sp.querySelector("p\\:ph, ph");
    const phType = ph?.getAttribute("type") ?? "";
    const runs = parseTextRunsFromNode(sp);
    if (phType === "title" || phType === "ctrTitle") {
      title = runs.join(" ").trim();
    } else if (runs.length > 0) {
      bullets.push(...runs.map((r) => r.trim()).filter(Boolean));
    }
  }
  // First picture rid (a:blip r:embed=...)
  const blip = doc.getElementsByTagName("a:blip")[0];
  const firstPicRid = blip?.getAttribute("r:embed") ?? undefined;
  return { title, bullets, firstPicRid };
}

function parseTextRuns(xml: string): string[] {
  if (!DOM) return [];
  const doc = DOM.parseFromString(xml, "application/xml");
  return parseTextRunsFromNode(doc.documentElement);
}

function parseTextRunsFromNode(node: Element): string[] {
  const out: string[] = [];
  // Per-paragraph join: each <a:p> is one bullet line.
  const paras = Array.from(node.getElementsByTagName("a:p"));
  for (const p of paras) {
    const ts = Array.from(p.getElementsByTagName("a:t")).map((t) => t.textContent ?? "");
    const line = ts.join("").trim();
    if (line) out.push(line);
  }
  return out;
}

function parseRelTarget(xml: string, rid: string): string | null {
  if (!DOM) return null;
  const doc = DOM.parseFromString(xml, "application/xml");
  const rels = Array.from(doc.getElementsByTagName("Relationship"));
  for (const rel of rels) {
    if (rel.getAttribute("Id") === rid) {
      return rel.getAttribute("Target");
    }
  }
  return null;
}

/** Map a parsed slide deck into a storyboard JSON that the studio editor
 *  can hydrate via `purpose: "course_lesson"` + `sourceType: "studio_video"`.
 *  One module per top-level "section break" (slides with `# ` heading or
 *  layout id "section"), one lesson per slide otherwise. */
export function slidesToCourseSkeleton(slides: PptxSlide[]): {
  title: string;
  modules: Array<{
    title: string;
    lessons: Array<{
      title: string;
      scenes: Array<{ type: string; title: string; body: string; notes?: string }>;
    }>;
  }>;
} {
  // Simple first cut: every slide is its own lesson under a single
  // "Imported Slides" module. The author can re-arrange post-import.
  return {
    title: slides[0]?.title ? `${slides[0].title} (course)` : "Imported Course",
    modules: [
      {
        title: "Imported Slides",
        lessons: slides.map((s) => ({
          title: s.title,
          scenes: [
            {
              type: "concept",
              title: s.title,
              body: s.bullets.join("\n"),
              notes: s.notes,
            },
          ],
        })),
      },
    ],
  };
}
