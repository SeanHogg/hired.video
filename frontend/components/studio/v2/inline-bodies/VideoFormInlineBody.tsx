/**
 * VideoFormInlineBody — canvas-side preview of a video lead-capture
 * (or knowledge-check) form. Renders the form's title + the field
 * stack so the author can SEE which form they dropped onto the canvas;
 * the actual interactive submission UX is the player's job (tracked
 * as the playback half of gap #1579 / #1582).
 *
 * Loads its row through `useEngagementAsset` (shared with the playback
 * overlay, which makes the form fillable — #1586) — the parent body just provides
 * chrome. Loading + missing states render inline.
 */
import { ClipboardList, EyeOff, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { isPlayableForm, useEngagementAsset } from "@/lib/studio/engagement/use-engagement-asset";

interface Props {
  projectId: string;
  assetId: string;
}

export default function VideoFormInlineBody({ projectId, assetId }: Props) {
  const { t } = useTranslation();
  const loaded = useEngagementAsset("video-form", projectId, assetId);
  const form = loaded === undefined ? undefined : loaded?.kind === "video-form" ? loaded.form : null;

  if (form === undefined) {
    return (
      <div className="flex h-full w-full items-center justify-center text-[11px] text-muted-foreground">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Loading form…
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] text-muted-foreground">
        <ClipboardList className="h-4 w-4" />
        Form not found
      </div>
    );
  }

  // The owner listing carries inactive forms too: say so plainly instead of
  // "not found" — playback skips them (the submit route would 404).
  if (!isPlayableForm(form)) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-2 text-center text-[11px] opacity-80">
        <EyeOff className="h-4 w-4" aria-hidden="true" />
        <p className="truncate font-semibold">{form.title}</p>
        <p>{t("studio.engagementAsset.formTurnedOff")}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-1.5 overflow-hidden p-2 text-left">
      <div className="flex items-center gap-1.5">
        <ClipboardList className="h-3.5 w-3.5 shrink-0" />
        <p className="truncate text-xs font-semibold">{form.title}</p>
      </div>
      <ul className="flex-1 space-y-1 overflow-hidden text-[11px]">
        {form.fields.slice(0, 4).map((field) => (
          <li
            key={field.key}
            className="truncate rounded-sm border border-current/20 px-1.5 py-0.5"
          >
            {field.label}
            {field.required && <span className="ml-0.5 opacity-60">*</span>}
          </li>
        ))}
        {form.fields.length > 4 && (
          <li className="text-[10px] opacity-60">
            +{form.fields.length - 4} more
          </li>
        )}
      </ul>
      <div className="flex items-center justify-between text-[10px] opacity-70">
        <span>@{form.positionSeconds.toFixed(1)}s</span>
        <span>{form.requireToContinue ? "Gated" : "Skippable"}</span>
      </div>
    </div>
  );
}
