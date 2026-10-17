/**
 * SCORM 1.2 zip export pipeline (#1400).
 *
 * Closes the loop on the seeded learning library: the platform's first-party
 * AI / RAG / prompt-engineering / must-have-skills / Claude-API lessons all
 * ship as `course_lessons.source_type = 'text_md'`. Employers who want to
 * re-host those courses inside their own LMS need a portable SCORM 1.2 zip
 * (imsmanifest.xml + asset bundle + scorm-again runtime).
 *
 * Pipeline (mirrors the upload-path in [scorm-upload.ts](./scorm-upload.ts)):
 *   1. Convert lesson `bodyMd` → HTML via a deliberately-small markdown
 *      walker (no `marked` dependency — keeps this lib usable from worker
 *      contexts that don't have DOM). Headings / paragraphs / lists /
 *      inline code / fenced code / bold / italic / links / images are
 *      enough for the seeded body shape; richer Tiptap output round-trips
 *      via `bodyMd` because the WYSIWYG editor keeps both in lockstep
 *      (gap #1569).
 *   2. Render a SCORM 1.2-compatible launcher HTML that:
 *      - includes the lesson body
 *      - posts CMI events to `window.parent.API` (or the manifest's own
 *        loader hand-shake when the package is re-hosted on a third-party
 *        LMS)
 *      - if a `knowledgeCheckForm` is supplied, embeds the question set
 *        below the body, computes pct on submit, and writes
 *        `cmi.score.raw` + `cmi.completion_status` accordingly
 *      - listens for the parent `hv:theme` postMessage (#1572) and folds
 *        the whitelisted tokens into CSS custom properties on `:root`.
 *   3. Build `imsmanifest.xml` per the SCORM 1.2 schema with one
 *      organization + one resource pointing at the launcher.
 *   4. JSZip the package and hand back the Blob + a recommended filename.
 *
 * The same pipeline can be invoked for an entire course (Course → Modules →
 * Lessons): we emit one zip per lesson. A future enhancement could roll
 * everything into one zip with sequencing — SCORM 2004 sequencing is the
 * place that matters; tracked under [#1461](README "SCORM 2004 4th").
 *
 * Returns a Blob so the caller decides whether to `URL.createObjectURL`
 * for a download anchor or upload it to R2 via the existing single-upload
 * route. We don't auto-download here to keep the helper headless.
 */

import type { CourseLesson } from "@/lib/services/course-service";
import { escapeXmlText as escapeXml } from "@shared/course-cover";
import { escapeHtml } from "@shared/html-escape";
import { slugify } from "@shared/slugify";

/** Optional knowledge-check form payload — when present, the launcher
 *  embeds the questions + grader + remediation hook. Mirrors
 *  `studio_video_forms.formType = 'knowledge_check'` columns from gap #201
 *  so an author who already authored a check via VideoFormsDialog can
 *  export the same questions into the SCORM zip. */
export interface KnowledgeCheckQuestion {
  prompt: string;
  /** Choice strings in order; `correctIndex` indexes this array. */
  options: string[];
  correctIndex: number;
}

export interface KnowledgeCheckForm {
  questions: KnowledgeCheckQuestion[];
  /** 0-100. Defaults to 70 when omitted. */
  passingScorePct?: number;
  /** Max retake count surfaced to the learner. 0 = unlimited. */
  maxAttempts?: number;
}

export interface ScormExportInput {
  /** The lesson to export. Only `text_md` lessons are wrapped today —
   *  studio_video lessons should be exported via the studio video pipeline
   *  (deferred); SCORM-package lessons are already SCORM zips. */
  lesson: Pick<CourseLesson, "id" | "title" | "summary" | "bodyMd" | "sourceType">;
  /** Course title — used as the package title in `imsmanifest.xml`. */
  courseTitle: string;
  /** Optional knowledge check (gap #201 wiring). */
  knowledgeCheck?: KnowledgeCheckForm;
}

export interface ScormExportResult {
  blob: Blob;
  /** Recommended download filename — slug-safe, ends in `.zip`. */
  filename: string;
  /** Number of files in the zip. Surfaced for diagnostic logging. */
  fileCount: number;
}

const PASSING_DEFAULT_PCT = 70;


/** Minimal markdown → HTML walker. Handles the subset the seeded library
 *  uses (headings 1-3, paragraphs, fenced code, inline code, lists, bold,
 *  italic, links, images). Deliberately conservative — anything fancier
 *  passes through as a paragraph so the SCO never breaks on an unknown
 *  construct. Not a Common-Mark spec impl; the LMS only needs the visual
 *  to be reasonable. */
export function markdownToHtml(md: string): string {
  if (!md) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inList: "ul" | "ol" | null = null;
  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i]!;

    // Fenced code block
    const fence = line.match(/^```(\w+)?\s*$/);
    if (fence) {
      closeList();
      const lang = fence[1] ? ` data-lang="${escapeHtml(fence[1])}"` : "";
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) {
        buf.push(lines[i]!);
        i++;
      }
      out.push(`<pre${lang}><code>${escapeHtml(buf.join("\n"))}</code></pre>`);
      i++; // skip closing fence
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(6, heading[1]!.length);
      out.push(`<h${level}>${inlineMarkdown(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }

    // Unordered list item
    const ul = line.match(/^[*\-+]\s+(.+)$/);
    if (ul) {
      if (inList !== "ul") {
        closeList();
        out.push("<ul>");
        inList = "ul";
      }
      out.push(`<li>${inlineMarkdown(ul[1]!)}</li>`);
      i++;
      continue;
    }

    // Ordered list item
    const ol = line.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      if (inList !== "ol") {
        closeList();
        out.push("<ol>");
        inList = "ol";
      }
      out.push(`<li>${inlineMarkdown(ol[1]!)}</li>`);
      i++;
      continue;
    }

    // Blank line
    if (!line.trim()) {
      closeList();
      i++;
      continue;
    }

    // Block-quote
    const bq = line.match(/^>\s?(.*)$/);
    if (bq) {
      closeList();
      out.push(`<blockquote>${inlineMarkdown(bq[1]!)}</blockquote>`);
      i++;
      continue;
    }

    // Paragraph (gather continuation lines)
    closeList();
    const buf = [line];
    i++;
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,6}\s|```|[*\-+]\s|\d+\.\s|>\s?)/.test(lines[i]!)) {
      buf.push(lines[i]!);
      i++;
    }
    out.push(`<p>${inlineMarkdown(buf.join(" "))}</p>`);
  }
  closeList();
  return out.join("\n");
}

/** Inline-level: bold/italic/code/link/image — applied to already-line-split
 *  segments. Order matters: escape first, then re-introduce only the
 *  inline-syntax tags. */
function inlineMarkdown(text: string): string {
  let s = escapeHtml(text);
  // images first so they don't get clobbered by the link regex
  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) =>
    `<img alt="${alt}" src="${url}" loading="lazy" />`);
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
  s = s.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, (_, b) => `<strong>${b}</strong>`);
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, (_, pre, i) => `${pre}<em>${i}</em>`);
  return s;
}

/** Render the SCORM 1.2 launcher HTML — the file that the LMS opens and
 *  inside which scorm-again's API hand-shake fires. */
function renderLauncherHtml(args: ScormExportInput): string {
  const { lesson, courseTitle, knowledgeCheck } = args;
  const bodyHtml = markdownToHtml(lesson.bodyMd ?? "");
  const passingPct = knowledgeCheck?.passingScorePct ?? PASSING_DEFAULT_PCT;
  const kcJson = knowledgeCheck
    ? JSON.stringify({ questions: knowledgeCheck.questions, passingPct })
    : "null";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(lesson.title)} — ${escapeHtml(courseTitle)}</title>
  <style>
    :root {
      --scorm-chrome-bg: #ffffff;
      --scorm-chrome-text: #111827;
      --scorm-chrome-accent: #2563eb;
      --scorm-chrome-border: #e5e7eb;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --scorm-chrome-bg: #0b1220;
        --scorm-chrome-text: #f1f5f9;
        --scorm-chrome-border: #1e293b;
      }
    }
    html, body {
      margin: 0;
      background: var(--scorm-chrome-bg);
      color: var(--scorm-chrome-text);
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      line-height: 1.6;
    }
    main {
      max-width: 760px;
      margin: 0 auto;
      padding: 2rem 1.25rem;
    }
    h1, h2, h3 { color: var(--scorm-chrome-text); margin-top: 1.6em; }
    h1 { font-size: 1.875rem; }
    h2 { font-size: 1.375rem; }
    h3 { font-size: 1.125rem; }
    a { color: var(--scorm-chrome-accent); }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: rgba(0,0,0,0.05);
      padding: 0.125rem 0.3rem;
      border-radius: 4px;
    }
    pre {
      background: rgba(0,0,0,0.07);
      padding: 1rem;
      border-radius: 6px;
      overflow-x: auto;
    }
    blockquote {
      border-left: 4px solid var(--scorm-chrome-accent);
      margin: 1rem 0;
      padding-left: 1rem;
      color: color-mix(in srgb, var(--scorm-chrome-text) 75%, transparent);
    }
    #hv-kc {
      margin-top: 2.5rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--scorm-chrome-border);
    }
    #hv-kc fieldset {
      border: 1px solid var(--scorm-chrome-border);
      border-radius: 6px;
      margin: 1rem 0;
      padding: 1rem 1.25rem;
    }
    #hv-kc legend { font-weight: 600; padding: 0 0.5rem; }
    #hv-kc label { display: block; padding: 0.3rem 0; }
    #hv-kc button {
      background: var(--scorm-chrome-accent);
      color: #fff;
      border: 0;
      padding: 0.6rem 1.1rem;
      border-radius: 6px;
      font-size: 1rem;
      cursor: pointer;
    }
    #hv-kc button:focus-visible {
      outline: 3px solid var(--scorm-chrome-accent);
      outline-offset: 2px;
    }
    #hv-kc .result {
      margin-top: 1rem;
      padding: 1rem;
      border-radius: 6px;
      background: color-mix(in srgb, var(--scorm-chrome-accent) 10%, transparent);
    }
    .sr-only {
      position: absolute; width: 1px; height: 1px; padding: 0;
      margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap;
      border: 0;
    }
  </style>
</head>
<body>
  <main role="main">
    <article>
      <header>
        <p style="margin:0; font-size:0.85rem; opacity:0.7;">${escapeHtml(courseTitle)}</p>
        <h1>${escapeHtml(lesson.title)}</h1>
        ${lesson.summary ? `<p>${escapeHtml(lesson.summary)}</p>` : ""}
      </header>
      ${bodyHtml}
    </article>
    <section id="hv-kc" aria-live="polite"></section>
  </main>
  <div role="status" aria-live="polite" class="sr-only" id="hv-sr-status"></div>
  <script>
  (function () {
    // ── SCORM 1.2 API discovery ─────────────────────────────────────────
    // SCO spec: walk up window.parent / window.opener to find an object
    // named "API" (1.2) or "API_1484_11" (2004). scorm-again's player
    // (#1467) installs API at window.parent; LMSs follow the same pattern.
    function findAPI(win) {
      var depth = 0;
      while (win && depth < 50) {
        if (win.API) return win.API;
        if (win === win.parent) break;
        win = win.parent;
        depth++;
      }
      if (window.opener) {
        if (window.opener.API) return window.opener.API;
      }
      return null;
    }
    var api = findAPI(window);
    function safe(call) {
      try { return call(); } catch (e) { return null; }
    }
    if (api) safe(function(){ api.LMSInitialize(""); });

    function set(k, v) { if (api) safe(function(){ api.LMSSetValue(k, String(v)); }); }
    function commit() { if (api) safe(function(){ api.LMSCommit(""); }); }
    function finish() { if (api) safe(function(){ api.LMSFinish(""); }); }

    // The container theme handshake (#1572). Parent posts a whitelisted
    // map of tokens; we fold them into :root CSS variables. Only the four
    // CHROME_TOKEN_MAP keys are honored — mirror of the host-side
    // whitelist so a hostile parent can't poke arbitrary styles.
    var THEME_KEYS = ["backgroundColor","textColor","accentColor","borderColor"];
    var CSS_VAR = {
      backgroundColor: "--scorm-chrome-bg",
      textColor: "--scorm-chrome-text",
      accentColor: "--scorm-chrome-accent",
      borderColor: "--scorm-chrome-border"
    };
    window.addEventListener("message", function (ev) {
      var d = ev && ev.data;
      if (!d || d.type !== "hv:theme" || !d.tokens) return;
      var root = document.documentElement.style;
      THEME_KEYS.forEach(function (k) {
        var v = d.tokens[k];
        if (typeof v === "string" && v.length < 64) {
          root.setProperty(CSS_VAR[k], v);
        }
      });
    });

    // Mark lesson as in-progress on load, completed on unload. If the
    // package carries a knowledge check, the grader below overrides the
    // completion path so the score drives pass/fail.
    set("cmi.core.lesson_status", "incomplete");
    commit();

    var KC = ${kcJson};
    if (KC && KC.questions && KC.questions.length) {
      renderKnowledgeCheck(KC);
    } else {
      // Body-only lesson — completing the read counts as completion. We
      // don't block on a "next" button because the host chrome owns lesson
      // navigation. Setting completed on the pagehide event lets the runtime fire
      // the final commit.
      window.addEventListener("pagehide", function () {
        set("cmi.core.lesson_status", "completed");
        commit();
        finish();
      });
    }

    function renderKnowledgeCheck(kc) {
      var host = document.getElementById("hv-kc");
      if (!host) return;
      var heading = document.createElement("h2");
      heading.textContent = "Knowledge check";
      host.appendChild(heading);

      var form = document.createElement("form");
      form.setAttribute("novalidate", "novalidate");
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        grade(form, kc);
      });

      kc.questions.forEach(function (q, idx) {
        var fs = document.createElement("fieldset");
        var lg = document.createElement("legend");
        lg.textContent = "Question " + (idx + 1) + ": " + q.prompt;
        fs.appendChild(lg);
        (q.options || []).forEach(function (opt, optIdx) {
          var id = "kc-" + idx + "-" + optIdx;
          var label = document.createElement("label");
          label.htmlFor = id;
          var radio = document.createElement("input");
          radio.type = "radio";
          radio.name = "q-" + idx;
          radio.id = id;
          radio.value = String(optIdx);
          radio.required = true;
          label.appendChild(radio);
          label.appendChild(document.createTextNode(" " + opt));
          fs.appendChild(label);
        });
        form.appendChild(fs);
      });

      var submit = document.createElement("button");
      submit.type = "submit";
      submit.textContent = "Submit knowledge check";
      form.appendChild(submit);
      host.appendChild(form);
    }

    function grade(form, kc) {
      var total = kc.questions.length;
      var correct = 0;
      kc.questions.forEach(function (q, idx) {
        var selected = form.elements["q-" + idx];
        if (!selected) return;
        var value = selected.value;
        if (Number(value) === Number(q.correctIndex)) correct++;
      });
      var pct = total === 0 ? 0 : Math.round((correct / total) * 100);
      var passed = pct >= (kc.passingPct || ${PASSING_DEFAULT_PCT});
      set("cmi.core.score.raw", pct);
      set("cmi.core.score.max", 100);
      set("cmi.core.score.min", 0);
      set("cmi.core.lesson_status", passed ? "passed" : "failed");
      commit();

      var srNode = document.getElementById("hv-sr-status");
      if (srNode) {
        srNode.textContent = passed
          ? "Knowledge check passed with " + pct + " percent."
          : "Knowledge check scored " + pct + " percent. Try again.";
      }

      var result = document.createElement("div");
      result.className = "result";
      result.setAttribute("role", "status");
      result.textContent = passed
        ? "Passed — " + correct + " of " + total + " correct (" + pct + "%)."
        : "Scored " + correct + " of " + total + " correct (" + pct + "%). " +
          "Passing requires " + (kc.passingPct || ${PASSING_DEFAULT_PCT}) + "%. Review the lesson and retry.";
      form.replaceWith(result);
    }
  })();
  </script>
</body>
</html>
`;
}

/** Render the SCORM 1.2 imsmanifest.xml. One organization + one resource
 *  referencing the launcher. The `identifier` strings are required by
 *  ADL conformance but don't need to be meaningful — we slugify the
 *  lesson title so a package opened in an LMS-side editor reads cleanly. */
function renderManifestXml(args: { courseTitle: string; lessonTitle: string; launcherFilename: string; scoIdentifier: string; }): string {
  const { courseTitle, lessonTitle, launcherFilename, scoIdentifier } = args;
  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${escapeXml(scoIdentifier)}-manifest"
          version="1.0"
          xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
          xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                              http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd
                              http://www.imsglobal.org/xsd/imsmd_rootv1p2p1 imsmd_rootv1p2p1.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>
  <organizations default="${escapeXml(scoIdentifier)}-org">
    <organization identifier="${escapeXml(scoIdentifier)}-org">
      <title>${escapeXml(courseTitle)}</title>
      <item identifier="${escapeXml(scoIdentifier)}-item" identifierref="${escapeXml(scoIdentifier)}-res">
        <title>${escapeXml(lessonTitle)}</title>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="${escapeXml(scoIdentifier)}-res"
              type="webcontent"
              adlcp:scormtype="sco"
              href="${escapeXml(launcherFilename)}">
      <file href="${escapeXml(launcherFilename)}" />
    </resource>
  </resources>
</manifest>
`;
}

/** Public entry — build the SCORM 1.2 zip for a single lesson. */
export async function buildScormZipForLesson(args: ScormExportInput): Promise<ScormExportResult> {
  if (args.lesson.sourceType !== "text_md") {
    throw new Error("SCORM export currently supports `text_md` lessons only. SCORM-package lessons are already SCORM zips; studio_video export is tracked as a follow-up.");
  }
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const slug = slugify(args.lesson.title, { fallback: "lesson" });
  const scoIdentifier = `hv-${slug}-${args.lesson.id.slice(0, 8)}`;
  const launcherFilename = "index.html";

  zip.file(launcherFilename, renderLauncherHtml(args));
  zip.file(
    "imsmanifest.xml",
    renderManifestXml({
      courseTitle: args.courseTitle,
      lessonTitle: args.lesson.title,
      launcherFilename,
      scoIdentifier,
    }),
  );

  // ADL declares these XSD schemas in the manifest; LMS validators don't
  // re-download them at runtime but some strict importers (TalentLMS,
  // Cornerstone) refuse the package without the file present. Empty
  // stubs are widely accepted because the import path only checks for
  // file presence. If a future LMS rejects the empty stubs, swap in the
  // canonical ADL XSDs (Apache 2.0).
  zip.file("imscp_rootv1p1p2.xsd", "<!-- placeholder; see ADL spec -->\n");
  zip.file("adlcp_rootv1p2.xsd", "<!-- placeholder; see ADL spec -->\n");
  zip.file("imsmd_rootv1p2p1.xsd", "<!-- placeholder; see ADL spec -->\n");

  const blob = await zip.generateAsync({ type: "blob" });
  return {
    blob,
    filename: `${slug}-scorm12.zip`,
    fileCount: 4,
  };
}

/** Convenience — trigger a browser download for the built zip. Headless
 *  helper around the `<a download>` pattern so callers don't need to
 *  re-implement the URL.createObjectURL / revoke dance. */
export function downloadScormZip(result: ScormExportResult): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Give Chrome a moment to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
