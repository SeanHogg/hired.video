/**
 * The Actions panel's "Original music" step: the shared MusicComposer plus
 * the upload outcome (#563). A composed track joins the project only once it
 * is hosted; if the upload fails the track stays here in memory behind the
 * shared Retry / Download / Discard alert instead of landing on the canvas
 * as a tab-scoped blob: URL.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import MusicComposer from "@/components/studio/music/MusicComposer";
import UnsavedMediaAlert from "@/components/studio/UnsavedMediaAlert";
import { audioFileFromBlob } from "@/lib/studio/media-persistence";

export interface ComposedMusicActionProps {
  /** Hosts the track and adds it as a music layer; `false` = not saved. */
  onSetMusicFromBlob: (blob: Blob, durationSeconds: number, label: string) => Promise<boolean>;
  /** The track is on the canvas — close the step. */
  onDone: () => void;
}

export default function ComposedMusicAction({ onSetMusicFromBlob, onDone }: ComposedMusicActionProps) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<{ blob: Blob; durationSec: number } | null>(null);
  const label = t("studio.editor.originalCompositionLabel");

  async function save(blob: Blob, durationSec: number) {
    setSaving(true);
    const ok = await onSetMusicFromBlob(blob, durationSec, label);
    setSaving(false);
    if (ok) {
      setFailed(null);
      onDone();
      return;
    }
    setFailed({ blob, durationSec });
  }

  return (
    <>
      <MusicComposer onMusicReady={(blob, durationSec) => void save(blob, durationSec)} />
      {saving && !failed && (
        <p className="mt-2 text-xs text-muted-foreground">{t("studio.unsavedMedia.uploading")}</p>
      )}
      {failed && (
        <UnsavedMediaAlert
          blob={failed.blob}
          filename={audioFileFromBlob(failed.blob, label).name}
          message={t("studio.unsavedMedia.audioNotSavedYet")}
          downloadLabel={t("studio.unsavedMedia.downloadTrack")}
          busy={saving}
          onRetry={() => void save(failed.blob, failed.durationSec)}
          onDiscard={() => setFailed(null)}
        />
      )}
    </>
  );
}
