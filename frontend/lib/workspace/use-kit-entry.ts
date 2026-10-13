/**
 * useKitEntry — how a visitor arrived at a career kit, read exactly once,
 * plus `start` for a kit begun in the workspace itself (its drop zone).
 *
 *   resumeId (route)              open that résumé (no parse); then
 *     ?section=<key> | ?panel=design   …that section's editor / Design
 *     ?merge=<id> | ?job=<id>[&intent=create] (+ state.mergeFile / jobText)
 *                                     …that review on the page
 *   state.file / state.prompt / ?prompt=   parse into a new draft
 *   state.photo                   → the résumé photo, once the draft is ready
 *   state.letterText              → the draft's cover letter, once ready
 *   state.jobText (no résumé id)  → a tailor review once the draft is ready
 *   ?page=resume|letter|video &tool=<rail tool>  → where the kit opens, once
 *                                   the draft is ready
 *   ?start=resume|letter|video|job   a new kit's drop zone leads with that
 *                                   slot ("Or start with one"; a career
 *                                   ?template= leads the same way)
 *   ?design=<ref>                 → the résumé wears that résumé template
 *                                   (built-in preset id, or a résumé studio
 *                                   template's slug / id), once the draft
 *                                   is ready (useKitTemplate)
 *
 * Which draft this browser kept is picked up at all is kit-draft.ts's call
 * (a new kit asked for from a link starts blank).
 *
 * The one-shot params are then cleared from the address (the kit's own
 * router state is kept) so a refresh doesn't re-run them; the draft itself
 * is kept by useResumeIntake.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BasicsSchema, type ResumeContent } from "@shared/resume";
import { coverLetterFromText, withCoverLetter } from "@shared/cover-letter";
import type { BuildEntryState } from "@/lib/build-entry";
import {
  CREATE_INTENT,
  DESIGN_PANEL,
  DESIGN_PARAM,
  INTENT_PARAM,
  JOB_PARAM,
  MERGE_PARAM,
  PANEL_PARAM,
  SECTION_PARAM,
} from "@/lib/studio/resume-editor-link";
import type { ReviewHandoff } from "@/lib/build/review/use-review-handoff";
import { resumeService } from "@/lib/services/resume-service";
import { readAfterGuestAdoption } from "@/lib/guest-adoption";
import { uploadImage } from "@/lib/services/upload-service";
import { useGuestRun } from "@/hooks/use-guest-run";
import { kitStartForTemplate } from "@/lib/studio/career-starts";
import { parseKitPage, parseKitStart, type KitPage } from "./kit-stages";
import { parseRailTool, type RailToolId } from "./workspace-panels";

const PAGE_PARAM = "page";
const TOOL_PARAM = "tool";
const START_PARAM = "start";
// A kit opened by a career template (`?template=resume`) leads like `?start=`.
const TEMPLATE_PARAMS = ["contentTemplate", "template"] as const;
const ENTRY_PARAMS = [SECTION_PARAM, PANEL_PARAM, MERGE_PARAM, JOB_PARAM, INTENT_PARAM, DESIGN_PARAM, "prompt", PAGE_PARAM, TOOL_PARAM, START_PARAM, ...TEMPLATE_PARAMS] as const;

interface Args {
  /** The résumé the route names (/studio/resume/:id, or the kit project's). */
  resumeId: string | null;
  parseFile: (file: File) => Promise<void>;
  parseText: (text: string) => Promise<void>;
  adoptContent: (content: ResumeContent, title: string, resumeId: string) => void;
  onSection: (sectionKey: string) => void;
  onDesign: () => void;
  /** `?page=` / `?tool=`: where the kit opens once the draft is ready. */
  onPage: (page: KitPage) => void;
  onTool: (tool: RailToolId) => void;
  /** `?design=`: the résumé template to wear once the draft is ready. */
  onTemplate: (ref: string) => void;
  /** A review to open on the résumé once it is loaded (queued until ready). */
  onReview: (handoff: ReviewHandoff) => void;
  /** The ready draft (null until it is) and its commit — for the extras. */
  content: ResumeContent | null;
  commit: (next: ResumeContent, group?: string) => void;
}

/** The review a hand-off asked for, if any. */
function reviewFrom(params: URLSearchParams, state: Partial<BuildEntryState> | null, untitled: string): ReviewHandoff | null {
  const merge = params.get(MERGE_PARAM)?.trim();
  const jobId = params.get(JOB_PARAM)?.trim();
  const create = params.get(INTENT_PARAM) === CREATE_INTENT || state?.createForJob === true;
  if (state?.mergeFile instanceof File) return { kind: "merge", source: { kind: "file", file: state.mergeFile } };
  if (merge) return { kind: "merge", source: { kind: "resume", resumeId: merge, title: state?.mergeLabel || untitled } };
  if (state?.jobText?.trim()) return { kind: "job", create, job: { jobHtml: state.jobText, label: state.jobLabel || untitled } };
  if (jobId) return { kind: "job", create, job: { jobId, label: state?.jobLabel || untitled } };
  return null;
}

export type KitEntryStatus = "idle" | "loading" | "failed";

interface Extras {
  photo: File | null;
  letterText: string;
}

export function useKitEntry({
  resumeId,
  parseFile,
  parseText,
  adoptContent,
  onSection,
  onDesign,
  onPage,
  onTool,
  onTemplate,
  onReview,
  content,
  commit,
}: Args) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<KitEntryStatus>(resumeId ? "loading" : "idle");
  const [extras, setExtras] = useState<Extras | null>(null);
  const startedRef = useRef(false);
  const runAsGuest = useGuestRun();
  const untitled = t("build.untitledResume");
  // Read once, before the address is cleaned up.
  const [landing, setLanding] = useState(() => ({
    page: parseKitPage(searchParams.get(PAGE_PARAM)),
    tool: parseRailTool(searchParams.get(TOOL_PARAM)),
  }));
  // The résumé template a link asked for (`?design=`), until applied.
  const [design, setDesign] = useState(() => searchParams.get(DESIGN_PARAM)?.trim() || null);
  // The tool a link opened (`?tool=`), once applied — the workspace shows
  // it (raises Advanced for an Advanced tool; opens the sheet on phones).
  const [landedTool, setLandedTool] = useState<RailToolId | null>(null);
  const [focus] = useState(
    () =>
      parseKitStart(searchParams.get(START_PARAM)) ??
      kitStartForTemplate(searchParams.get(TEMPLATE_PARAMS[0]) ?? searchParams.get(TEMPLATE_PARAMS[1])),
  );

  /** Begin a new draft from what was handed over (or dropped in the kit). */
  const start = useCallback(
    (entry: Partial<BuildEntryState>) => {
      const prompt = entry.prompt?.trim();
      if (entry.file instanceof File) void parseFile(entry.file);
      else if (prompt) void parseText(prompt);
      else return;
      if (entry.photo instanceof File || entry.letterText?.trim()) {
        setExtras({ photo: entry.photo instanceof File ? entry.photo : null, letterText: entry.letterText?.trim() ?? "" });
      }
      const review = reviewFrom(new URLSearchParams(), entry, t("workspace.untitledJob"));
      if (review) onReview(review);
    },
    [parseFile, parseText, onReview, t],
  );

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const state = location.state as Partial<BuildEntryState> | null;
    if (resumeId) {
      // Just signed in from a guest session: retried once its work is claimed.
      readAfterGuestAdoption(() => resumeService.getResumeById(resumeId))
        .then((resume) => {
          adoptContent(resume.content, resume.title?.trim() || untitled, resumeId);
          const review = reviewFrom(searchParams, state, untitled);
          const section = searchParams.get(SECTION_PARAM)?.trim();
          if (review) onReview(review);
          else if (section) onSection(section);
          else if (searchParams.get(PANEL_PARAM) === DESIGN_PANEL) onDesign();
          setStatus("idle");
        })
        .catch(() => setStatus("failed"));
    } else {
      start({ ...state, prompt: state?.prompt ?? searchParams.get("prompt") ?? undefined });
    }
    // Clear the one-shot payload; keep the kit's own state (its project).
    const rest = new URLSearchParams(searchParams);
    ENTRY_PARAMS.forEach((p) => rest.delete(p));
    const query = rest.toString();
    const kit = (state as { kit?: unknown } | null)?.kit;
    navigate(`${location.pathname}${query ? `?${query}` : ""}`, { replace: true, state: kit ? { kit } : null });
    // Mount-only by design: the entry payload is read exactly once.
  }, []);

  // The photo upload resolves later: it applies to the draft as it is THEN.
  const contentRef = useRef(content);
  contentRef.current = content;
  const commitRef = useRef(commit);
  commitRef.current = commit;

  // The photo and the letter land once the draft is on the page.
  useEffect(() => {
    if (!extras || !content) return;
    setExtras(null);
    if (extras.letterText) {
      const letter = coverLetterFromText(extras.letterText, {
        salutation: t("workspace.letter.defaultSalutation"),
        signOff: t("workspace.letter.defaultSignOff"),
        date: new Date().toISOString().slice(0, 10),
      });
      if (letter) commit(withCoverLetter(content, letter), "entry:letter");
    }
    const photo = extras.photo;
    if (!photo) return;
    const upload = () =>
      void uploadImage(photo, photo.name)
        .then((url) => {
          const latest = contentRef.current;
          if (!latest) return;
          commitRef.current(
            { ...latest, basics: BasicsSchema.parse({ ...(latest.basics ?? {}), image: url }) },
            "entry:photo",
          );
        })
        .catch(() => undefined);
    // Uploading needs a session: a signed-out visitor gets a silent guest one.
    if (runAsGuest(upload)) upload();
  }, [extras, content, commit, runAsGuest, t]);

  // ?page= / ?tool= apply once the draft is on the page.
  useEffect(() => {
    if (!content || (!landing.page && !landing.tool)) return;
    setLanding({ page: null, tool: null });
    if (landing.page) onPage(landing.page);
    if (landing.tool) {
      onTool(landing.tool);
      setLandedTool(landing.tool);
    }
  }, [content, landing, onPage, onTool]);

  // ?design= applies once the draft is on the page.
  useEffect(() => {
    if (!content || !design) return;
    setDesign(null);
    onTemplate(design);
  }, [content, design, onTemplate]);

  /** The slot a new kit's drop zone leads with (`?start=`), or null. */
  return { status, start, focus, landedTool };
}
