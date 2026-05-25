// Intake for the "Basic" template + every kind-specific fallback that
// shares it (40+ templates across video / podcast / voice / animation /
// game / comic / image / cad — see `IntakeForm: BasicIntake` rows in
// `catalog.tsx`). The user describes the project in prose
// (→ `resumeText`) plus an optional creative direction (→ `prompt`).
// The script generator (video / podcast / voice / animation) reads
// `resumeText` as context; non-CanvasState kinds (game / image) read it
// when their template seeds reference a description field.
//
// Kind-aware copy: pulls the noun from `MEDIA_KIND_UI[kind].badgeLabel`
// instead of hard-coding "video". The wizard + editor pass `kind` via
// `IntakeProps` — the single source of truth lives in
// `@shared/media-kinds`, so adding a new MediaKind doesn't touch this
// file. Per `feedback_extract_on_duplication`, no per-template copy
// fork; the same component renders the right noun for any kind.

import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MIN_PROMPT_CHARS, hasRepeatedCharPlaceholder } from "@/lib/studio/can-generate";
import { MEDIA_KIND_UI } from "@shared/media-kinds";
import type { IntakeProps } from "../catalog";

export default function BasicIntake({ state, onStateChange, validationFlash, kind }: IntakeProps) {
  const trimmedText = state.resumeText.trim();
  const trimmed = trimmedText.length;
  const remaining = Math.max(0, MIN_PROMPT_CHARS - trimmed);
  // #484 — also flash on a repeated-char placeholder (e.g. "sssss…")
  // even when the user has typed enough characters in total. Saves the
  // user from burning 3 minutes of LLM time on an obviously-broken input.
  const placeholderLike = trimmed >= MIN_PROMPT_CHARS && hasRepeatedCharPlaceholder(trimmedText);
  const flash = validationFlash && (trimmed < MIN_PROMPT_CHARS || placeholderLike);
  const noun = MEDIA_KIND_UI[kind].badgeLabel.toLowerCase();
  // The "describe in real sentences" hint shouldn't say "podcast in
  // real sentences" — the singular noun reads awkwardly there. Use a
  // generic "your input" for that sub-line only.
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
          <Label className="text-sm font-semibold">Describe your {noun}</Label>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          One scene, your words. Tell us what the {noun} should convey —
          we'll turn it into a single-scene script you can refine.
        </p>
        <Textarea
          rows={6}
          placeholder={`What's this ${noun} about? Who's it for? What should the audience take away?`}
          value={state.resumeText}
          onChange={(e) => onStateChange({ resumeText: e.target.value })}
          className={flash ? "border-red-500 focus-visible:ring-red-500" : undefined}
        />
        <p className={`text-[11px] mt-1.5 ${flash ? "text-red-600" : "text-muted-foreground"}`}>
          {remaining > 0
            ? `${remaining} more character${remaining === 1 ? "" : "s"} before we have enough to generate.`
            : placeholderLike
              ? "That looks like a placeholder — try describing it in real sentences."
              : "Ready to generate."}
        </p>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1.5 block">
          Creative direction (optional)
        </Label>
        <Textarea
          rows={2}
          placeholder="e.g. Keep it upbeat. End with a clear call to action."
          value={state.prompt}
          onChange={(e) => onStateChange({ prompt: e.target.value })}
        />
      </div>
    </div>
  );
}
