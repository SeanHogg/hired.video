/**
 * ManualUploadCard — the manual-upload fallback (#2048, shared/
 * manual-upload.ts) for a place hired.video can't post to for you (a
 * network whose posting isn't live yet; Webtoon and Tapas, which forbid
 * it): download the file, upload it there yourself, paste the post's link
 * and "Mark as posted". The link is recorded as a publication, so it shows
 * in "Published to" — and where the network's stats can be read by the id
 * in the link, the post gets off-platform metrics too.
 */
import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Check, Download, ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { distributionService } from "@/lib/services/distribution-service";
import {
  manualPostTracksMetrics,
  manualUploadUrl,
  parseManualPostUrl,
  type ManualUploadDestination,
} from "@shared/manual-upload";
import { useDestinationLabel } from "./useDestinationLabel";

export interface ManualUploadCardProps {
  projectId: string;
  destination: ManualUploadDestination;
  /** The hosted file to download; absent → "export it from the editor". */
  downloadUrl?: string | null;
  /** The editor link for kinds whose file is exported there. */
  editorHref?: string;
  /** Text to paste with the upload (the shared caption). */
  caption?: string;
  onPosted?: () => void;
}

const BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-foreground hover:bg-accent disabled:opacity-60";

export default function ManualUploadCard({ projectId, destination, downloadUrl, editorHref, caption, onPosted }: ManualUploadCardProps) {
  const { t } = useTranslation();
  const name = useDestinationLabel()(destination);
  const inputId = useId();
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const valid = parseManualPostUrl(destination, url) !== null;
  const mark = useMutation({
    mutationFn: () => distributionService.markPosted(projectId, destination, url.trim()),
    onSuccess: () => onPosted?.(),
  });

  const copyCaption = async () => {
    if (!caption) return;
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (mark.isSuccess) {
    return (
      <div role="status" className="flex items-start gap-2 rounded-xl border border-brand-green/30 bg-brand-green/10 p-3 text-sm text-foreground">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-green-text" aria-hidden="true" />
        <span>{mark.data.tracksMetrics ? t("distribution.manual.recordedTracked", { name }) : t("distribution.manual.recorded", { name })}</span>
      </div>
    );
  }

  return (
    <section aria-label={t("distribution.manual.title", { name })} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <h3 className="text-sm font-semibold text-foreground">{t("distribution.manual.title", { name })}</h3>
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-[13px] text-foreground/90">
        <li>
          {downloadUrl ? (
            <a href={downloadUrl} download className={BUTTON}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {t("distribution.manual.download")}
            </a>
          ) : (
            <span>
              {t("distribution.manual.exportFirst")}{" "}
              {editorHref && (
                <a href={editorHref} className="font-semibold text-primary underline-offset-2 hover:underline">
                  {t("distribution.manual.openEditor")}
                </a>
              )}
            </span>
          )}
        </li>
        <li>
          <a href={manualUploadUrl(destination)} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline">
            {t("distribution.manual.openUpload", { name })}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
          {caption && (
            <button type="button" onClick={() => void copyCaption()} className="ml-2 min-h-9 rounded-lg px-2 font-semibold text-foreground hover:bg-accent">
              {copied ? t("distribution.manual.captionCopied") : t("distribution.manual.copyCaption")}
            </button>
          )}
        </li>
        <li className="flex flex-col gap-1.5">
          <label htmlFor={inputId}>{t("distribution.manual.pasteLink", { name })}</label>
          <input
            id={inputId}
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://"
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={url !== "" && !valid}
            className="min-h-11 w-full min-w-0 rounded-[10px] border border-border bg-background px-3 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
          />
          {url !== "" && !valid && <p className="text-destructive">{t("distribution.manual.badLink", { name })}</p>}
          {!manualPostTracksMetrics(destination) && <p className="text-muted-foreground">{t("distribution.manual.noStats", { name })}</p>}
        </li>
      </ol>
      <button
        type="button"
        disabled={!valid || mark.isPending}
        onClick={() => mark.mutate()}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
      >
        {mark.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {t("distribution.manual.markPosted")}
      </button>
      {mark.isError && (
        <p role="alert" className="text-[13px] text-destructive">
          {mark.error instanceof Error ? mark.error.message : t("distribution.list.actionFailed")}
        </p>
      )}
    </section>
  );
}
