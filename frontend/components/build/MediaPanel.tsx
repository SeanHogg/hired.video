/**
 * Media — the kit side panel's media for the résumé + video: the photo
 * (`basics.image`, shown on the résumé and in the video's avatar) and the
 * video's music track (stock tracks from the studio's music catalog, rendered
 * procedurally — nothing to host).
 *
 * The photo comes through the app's one MediaPicker (upload / stock / AI).
 * Uploading needs a session, so the picker sits inside the guest-first gate
 * the post dock uses: a signed-out visitor gets a silent guest session, never
 * a form.
 */
import { useTranslation } from "react-i18next";
import { Check, ImageIcon } from "lucide-react";
import { BasicsSchema, type ResumeContent } from "@shared/resume";
import MediaPicker from "@/components/shared/MediaPicker";
import { AnonGateContext } from "@/lib/studio/anon-gate-context";
import { useGuestAnonGate } from "@/lib/studio/use-guest-anon-gate";
import { MUSIC_TRACKS } from "@/lib/studio/music-catalog";
import { initialsOf } from "@/lib/build/video-copy";
import { cn } from "@/lib/utils";
import { AuthGateSheet } from "@/components/auth/useAuthGate";

interface MediaPanelProps {
  content: ResumeContent;
  /** Current track id ("none" = silent). */
  music: string;
  onChange: (next: ResumeContent) => void;
  onMusicChange: (track: string) => void;
}

const LABEL = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const OUTLINE_BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-[10px] border border-input bg-card px-3 text-sm font-semibold text-foreground transition-colors hover:bg-muted";

export default function MediaPanel({ content, music, onChange, onMusicChange }: MediaPanelProps) {
  const { t } = useTranslation();
  const { value: gateValue, sheet: gateSheet } = useGuestAnonGate();
  const photo = (content.basics?.image ?? "").trim();
  // Through the schema so a résumé with no header yet gets its defaults.
  const setPhoto = (url: string) =>
    onChange({ ...content, basics: BasicsSchema.parse({ ...(content.basics ?? {}), image: url }) });

  return (
    <AnonGateContext.Provider value={gateValue}>
      <div className="flex flex-col gap-6">
        <section aria-labelledby="build-media-photo" className="flex flex-col gap-3">
          <h2 id="build-media-photo" className={LABEL}>
            {t("build.media.photo")}
          </h2>
          <div className="flex items-center gap-3">
            {photo ? (
              <img src={photo} alt={t("build.media.photoAlt")} className="h-16 w-16 flex-none rounded-full object-cover" />
            ) : (
              <span
                aria-hidden="true"
                className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-muted text-lg font-bold text-muted-foreground"
              >
                {initialsOf(content.basics?.name ?? "") || <ImageIcon className="h-6 w-6" />}
              </span>
            )}
            <div className="flex flex-wrap gap-2">
              <MediaPicker
                accept="image"
                title={t("build.media.photo")}
                onPick={(asset) => setPhoto(asset.url)}
                trigger={
                  <button type="button" className={OUTLINE_BUTTON}>
                    {photo ? t("build.media.changePhoto") : t("build.media.addPhoto")}
                  </button>
                }
              />
              {photo && (
                <button type="button" onClick={() => setPhoto("")} className={OUTLINE_BUTTON}>
                  {t("build.media.removePhoto")}
                </button>
              )}
            </div>
          </div>
          <p className="text-[13px] text-muted-foreground">{t("build.media.photoHelp")}</p>
        </section>

        <section aria-labelledby="build-media-music" className="flex flex-col gap-3">
          <h2 id="build-media-music" className={LABEL}>
            {t("build.media.music")}
          </h2>
          <ul className="flex flex-col gap-1.5" role="radiogroup" aria-labelledby="build-media-music">
            {MUSIC_TRACKS.map((track) => {
              const active = track.id === music;
              return (
                <li key={track.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onMusicChange(track.id)}
                    className={cn(
                      "flex min-h-11 w-full items-center justify-between gap-3 rounded-[10px] border px-3 text-left text-sm transition-colors",
                      active ? "border-primary bg-primary/5 font-semibold" : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {track.id === "none" ? t("build.media.noMusic") : track.label}
                    </span>
                    {active && <Check aria-hidden="true" className="h-4 w-4 flex-none text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <AuthGateSheet {...gateSheet} />
    </AnonGateContext.Provider>
  );
}
