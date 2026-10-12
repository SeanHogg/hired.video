/**
 * The one "this media isn't saved yet" panel (#563). Shown by every surface
 * whose upload failed — recorded clips, composed music, dubbed tracks — while
 * the blob is still held in memory: Retry the upload, Download the file, or
 * Discard it. While mounted it counts as unsaved work, so a PWA update or
 * closing the tab asks first.
 */
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useRegisterUnsavedWork } from "@/hooks/use-unsaved-work";
import { downloadBlob } from "@/lib/studio/media-persistence";

export interface UnsavedMediaAlertProps {
  blob: Blob;
  /** Download file name, e.g. `recording-1760000000000.webm`. */
  filename: string;
  /** Why it isn't in the project yet (already localized). */
  message: string;
  /** Label for the download button (already localized). */
  downloadLabel: string;
  /** A retry upload is in flight — buttons wait for it. */
  busy?: boolean;
  onRetry: () => void;
  onDiscard: () => void;
}

export default function UnsavedMediaAlert({
  blob,
  filename,
  message,
  downloadLabel,
  busy = false,
  onRetry,
  onDiscard,
}: UnsavedMediaAlertProps) {
  const { t } = useTranslation();
  useRegisterUnsavedWork(true);
  return (
    <div
      role="alert"
      className="mt-3 flex flex-col gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <span className="min-w-0 text-destructive">{busy ? t("studio.unsavedMedia.uploading") : message}</span>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onRetry}>
          {t("studio.unsavedMedia.retry")}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => downloadBlob(blob, filename)}>
          {downloadLabel}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onDiscard}>
          {t("studio.unsavedMedia.discard")}
        </Button>
      </div>
    </div>
  );
}
