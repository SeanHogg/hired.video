/**
 * KitDropZone — "drop whatever you have": a photo, a résumé, a cover letter
 * and the job you want, in four slots (any subset; the rules are
 * kit-intake.ts), plus "or describe yourself". Files dropped anywhere on
 * the zone go to the slot they fit; a dropped or pasted job LINK is read
 * through the job importer into the job slot (kit-drop.ts sorts a drop).
 * One button makes all of it at once.
 *
 * The ONE entry for a career kit: the empty canvas of a new kit, the studio
 * home's start band and the home page hero all render it; each passes what
 * "start" means there (`onStart` gets the BuildEntryState — in the kit it
 * starts the draft in place, elsewhere it opens /studio/new with it).
 * `lead` (a "start with one" link) rings the slot to begin with — the
 * video starts from the résumé, a job from its text box, "Start with AI"
 * from "describe yourself".
 */
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, FileText, Image as ImageIcon, Loader2, Mail, X } from "lucide-react";
import { RESUME_FILE_ACCEPT, type BuildEntryState } from "@/lib/build-entry";
import { getResumeTextFromFile } from "@/lib/services/resume-text";
import {
  EMPTY_KIT,
  canStartKit,
  fitsSlot,
  isBareLink,
  jobLabel,
  kitEntryState,
  type KitDraft,
  type KitFileSlot,
} from "@/lib/build/kit-intake";
import { applyDrop, classifyDrop, type DropPayload } from "@/lib/build/kit-drop";
import { useJobLinkImport } from "@/lib/build/use-job-link-import";
import KitJobSlot, { JobLinkStatus } from "./KitJobSlot";
import type { KitStart } from "@/lib/workspace/kit-stages";
import { cn } from "@/lib/utils";

interface KitDropZoneProps {
  onStart: (entry: BuildEntryState) => void;
  /** The slot to lead with, or null. */
  lead?: KitStart | null;
  /** Heading above the zone (already translated); omitted → none. */
  heading?: ReactNode;
  /** Viewport width from which the four slots sit in one row (2×2 below).
   *  "xl" when the zone shares its row with other columns. */
  slotsRowFrom?: "lg" | "xl";
  className?: string;
}

const SLOTS_GRID: Record<NonNullable<KitDropZoneProps["slotsRowFrom"]>, string> = {
  lg: "grid grid-cols-2 gap-2.5 lg:grid-cols-4",
  xl: "grid grid-cols-2 gap-2.5 xl:grid-cols-4",
};

const SLOT_META: Record<KitFileSlot, { labelKey: string; emptyKey: string; icon: typeof FileText; accept: string }> = {
  photo: { labelKey: "workspace.drop.photo", emptyKey: "workspace.drop.photoHint", icon: ImageIcon, accept: "image/*" },
  resume: { labelKey: "workspace.drop.resume", emptyKey: "workspace.drop.resumeHint", icon: FileText, accept: RESUME_FILE_ACCEPT },
  letter: { labelKey: "workspace.drop.letter", emptyKey: "workspace.drop.letterHint", icon: Mail, accept: ".pdf,.doc,.docx,.txt,.md" },
};

/** Which slot a start leads with (the video is made from the résumé). */
const LEAD_SLOT: Record<KitStart, KitFileSlot | "job" | "prompt"> = {
  resume: "resume",
  letter: "letter",
  video: "resume",
  job: "job",
  ai: "prompt",
};
const LEAD_RING = "ring-2 ring-primary ring-offset-2 ring-offset-card";

export default function KitDropZone({ onStart, lead = null, heading, slotsRowFrom = "lg", className }: KitDropZoneProps) {
  const leadSlot = lead ? LEAD_SLOT[lead] : null;
  const jobRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const slotsRef = useRef<HTMLDivElement>(null);
  // The visitor asked for this start ("Video for a job", "Start with AI"):
  // put the cursor where they type it, once.
  useEffect(() => {
    if (leadSlot === "job") jobRef.current?.focus();
    else if (leadSlot === "prompt") promptRef.current?.focus();
  }, [leadSlot]);
  const { t } = useTranslation();
  const [draft, setDraft] = useState<KitDraft>(EMPTY_KIT);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState(0);
  const [busy, setBusy] = useState(false);
  const pickFor = useRef<KitFileSlot | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const promptId = useId();
  const link = useJobLinkImport();
  const reading = link.state.status === "reading";

  /** Read a job link into the job slot (it keeps the link if that fails). */
  const readLink = async (url: string) => {
    setDraft((d) => ({ ...d, job: url }));
    const text = await link.read(url);
    if (text) setDraft((d) => ({ ...d, job: text }));
  };
  /** A drop or a paste, sorted into the slots (kit-drop.ts). */
  const take = (payload: DropPayload, looseText = false) => {
    const { draft: next, rejected: missed, jobUrl } = applyDrop(draft, classifyDrop(payload, draft, { looseText }));
    setDraft(next);
    setRejected(missed);
    if (jobUrl) void readLink(jobUrl);
  };
  const pasteClipboard = async () => {
    const text = await navigator.clipboard?.readText().catch(() => "");
    if (text) take({ files: [], text }, true);
  };
  const pick = (slot: KitFileSlot) => {
    pickFor.current = slot;
    if (inputRef.current) {
      inputRef.current.accept = SLOT_META[slot].accept;
      inputRef.current.click();
    }
  };
  const onPicked = (file: File | undefined) => {
    const slot = pickFor.current;
    if (!file || !slot) return;
    if (!fitsSlot(slot, file)) {
      setRejected(1);
      return;
    }
    setRejected(0);
    setDraft((d) => ({ ...d, [slot]: file }));
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    take({
      files: Array.from(e.dataTransfer.files ?? []),
      uriList: e.dataTransfer.getData("text/uri-list"),
      text: e.dataTransfer.getData("text/plain"),
    });
  };

  const start = async () => {
    if (!canStartKit(draft) || busy || reading) return;
    setBusy(true);
    try {
      const letterText = draft.letter ? await getResumeTextFromFile(draft.letter).catch(() => "") : "";
      onStart(kitEntryState(draft, letterText, t("workspace.untitledJob")));
    } finally {
      setBusy(false);
    }
  };

  /** "Change": back to what makes the kit — the job if there is one, else the slots. */
  const change = () => {
    if (draft.job.trim()) jobRef.current?.focus();
    else slotsRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  };

  const job = draft.job.trim();
  const summary = canStartKit(draft)
    ? t(job && !isBareLink(job) ? "workspace.drop.summaryJob" : "workspace.drop.summary", {
        job: jobLabel(job, t("workspace.untitledJob")),
      })
    : t("workspace.drop.oneIsEnough");

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      aria-label={t("workspace.drop.label")}
      className={cn(
        "flex w-full flex-col gap-4 rounded-[22px] border-[1.5px] border-dashed bg-card p-4 transition-colors sm:p-5",
        dragging ? "border-primary bg-accent" : canStartKit(draft) ? "border-brand-green/60" : "border-primary/40",
        className,
      )}
    >
      {heading}
      <div ref={slotsRef} className={SLOTS_GRID[slotsRowFrom]}>
        {(Object.keys(SLOT_META) as KitFileSlot[]).map((slot) => {
          const { labelKey, emptyKey, icon: Icon } = SLOT_META[slot];
          const file = draft[slot];
          return (
            <div
              key={slot}
              className={cn(
                "relative flex min-h-[92px] flex-col gap-1 rounded-2xl border p-3 text-left",
                file ? "border-brand-green/50 bg-brand-green/10" : "border-border bg-muted/40",
                leadSlot === slot && !file && LEAD_RING,
              )}
            >
              <button type="button" onClick={() => pick(slot)} className="absolute inset-0 rounded-2xl" aria-label={t(labelKey)} />
              <Icon className={cn("h-5 w-5", file ? "text-brand-green-text" : "text-muted-foreground")} aria-hidden="true" />
              <span className="text-sm font-semibold text-foreground">{t(labelKey)}</span>
              <span className={cn("truncate text-xs", file ? "text-brand-green-text" : "text-muted-foreground")}>
                {file ? file.name : t(emptyKey)}
              </span>
              {file && (
                <button
                  type="button"
                  onClick={() => setDraft((d) => ({ ...d, [slot]: null }))}
                  aria-label={t("workspace.drop.remove", { item: t(labelKey) })}
                  className="absolute right-0 top-0 z-10 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </div>
          );
        })}
        <KitJobSlot
          ref={jobRef}
          value={draft.job}
          onChange={(text) => {
            link.reset();
            setDraft((d) => ({ ...d, job: text }));
          }}
          onLink={(url) => void readLink(url)}
          onPasteClipboard={() => void pasteClipboard()}
          reading={reading}
          lead={leadSlot === "job"}
          leadRing={LEAD_RING}
        />
      </div>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          onPicked(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <JobLinkStatus state={link.state} />
      {rejected > 0 && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {t("workspace.drop.rejected", { count: rejected })}
        </p>
      )}
      {!draft.resume && (
        <>
          <label htmlFor={promptId} className="sr-only">
            {t("workspace.drop.describe")}
          </label>
          <textarea
            id={promptId}
            value={draft.prompt}
            onChange={(e) => setDraft((d) => ({ ...d, prompt: e.target.value }))}
            rows={2}
            ref={promptRef}
            placeholder={t("workspace.drop.describe")}
            className="w-full resize-none rounded-[14px] border border-border bg-card px-4 py-3 text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          />
        </>
      )}
      <p className="text-sm text-muted-foreground">
        <span aria-live="polite">{summary}</span>
        {canStartKit(draft) && (
          <>
            {" "}
            <button
              type="button"
              onClick={change}
              className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-2 hover:underline"
            >
              {t("labels.change")}
            </button>
          </>
        )}
      </p>
      <button
        type="button"
        onClick={() => void start()}
        disabled={!canStartKit(draft) || busy || reading}
        className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {t(canStartKit(draft) ? "workspace.drop.ctaReady" : "workspace.drop.cta")}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </section>
  );
}
