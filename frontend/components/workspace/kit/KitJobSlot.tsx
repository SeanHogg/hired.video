/**
 * The drop zone's "Job you want" slot: the job post's text, or a link to it.
 * A pasted / dropped link is read through the job importer (the zone owns
 * useJobLinkImport); "Paste" reads the clipboard the same way. While a link
 * is read, and when it can't be, `JobLinkStatus` says so under the slots.
 */
import { forwardRef, useId } from "react";
import { useTranslation } from "react-i18next";
import { Briefcase, ClipboardPaste, Link2, Loader2 } from "lucide-react";
import { isBareLink } from "@/lib/build/kit-intake";
import type { JobLinkError } from "@/lib/build/kit-drop";
import type { JobLinkState } from "@/lib/build/use-job-link-import";
import { cn } from "@/lib/utils";

interface KitJobSlotProps {
  value: string;
  onChange: (text: string) => void;
  /** A link was pasted, or "Read this job" pressed on a typed one. */
  onLink: (url: string) => void;
  /** The clipboard's text, through the drop rules. */
  onPasteClipboard: () => void;
  reading: boolean;
  lead: boolean;
  leadRing: string;
}

const KitJobSlot = forwardRef<HTMLTextAreaElement, KitJobSlotProps>(function KitJobSlot(
  { value, onChange, onLink, onPasteClipboard, reading, lead, leadRing },
  ref,
) {
  const { t } = useTranslation();
  const id = useId();
  const job = value.trim();
  const link = job && isBareLink(job) ? job : null;
  const filled = !!job && !link;
  return (
    <div
      className={cn(
        "flex min-h-[92px] flex-col gap-1 rounded-2xl border p-3",
        filled ? "border-brand-green/50 bg-brand-green/10" : "border-border bg-muted/40",
        lead && !job && leadRing,
      )}
    >
      <div className="flex items-center justify-between gap-1">
        <Briefcase className={cn("h-5 w-5", filled ? "text-brand-green-text" : "text-muted-foreground")} aria-hidden="true" />
        <button
          type="button"
          onClick={onPasteClipboard}
          disabled={reading}
          aria-label={t("workspace.drop.pasteJob")}
          className="-m-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
        >
          <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <label htmlFor={id} className="text-sm font-semibold text-foreground">
        {t("workspace.drop.job")}
      </label>
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={1}
        disabled={reading}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData("text/plain").trim();
          if (!isBareLink(pasted)) return;
          e.preventDefault();
          onChange(pasted);
          onLink(pasted);
        }}
        placeholder={t("workspace.drop.jobSlotHint")}
        className="min-h-11 w-full resize-none bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
      />
      {link && !reading && (
        <button
          type="button"
          onClick={() => onLink(link)}
          className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start rounded-full border border-primary px-3 text-xs font-semibold text-primary hover:bg-primary/10 sm:min-h-8"
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t("workspace.drop.readJob")}
        </button>
      )}
    </div>
  );
});

export default KitJobSlot;

const ERROR_KEYS: Record<JobLinkError, string> = {
  unsupported: "workspace.drop.linkUnsupported",
  signIn: "workspace.drop.linkSignIn",
  unreadable: "workspace.drop.linkUnreadable",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Reading a job link, or why it couldn't be read. */
export function JobLinkStatus({ state }: { state: JobLinkState }) {
  const { t } = useTranslation();
  if (state.status === "reading") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {t("workspace.drop.linkReading", { site: hostOf(state.url) })}
      </p>
    );
  }
  if (state.status === "failed") {
    return (
      <p role="alert" className="text-sm font-medium text-destructive">
        {t(ERROR_KEYS[state.error], { site: hostOf(state.url) })}
      </p>
    );
  }
  return null;
}
