// Intake for "Basic" — the blank-slate template. One scene, no pickers,
// no auto-imports. Just a description (→ resumeText) and an optional
// creative direction (→ prompt). The script generator reads resumeText as
// context and produces a single-scene storyboard.

import { Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MIN_PROMPT_CHARS } from "@/lib/studio/can-generate";
import type { IntakeProps } from "../catalog";

export default function BasicIntake({ state, onStateChange, validationFlash }: IntakeProps) {
  const trimmed = state.resumeText.trim().length;
  const remaining = Math.max(0, MIN_PROMPT_CHARS - trimmed);
  const flash = validationFlash && trimmed < MIN_PROMPT_CHARS;
  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
          <Label className="text-sm font-semibold">Describe your video</Label>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          One scene, your words. Tell us what the video should say — we'll
          turn it into a single-scene script you can refine.
        </p>
        <Textarea
          rows={6}
          placeholder="What's this video about? Who's it for? What should the viewer take away?"
          value={state.resumeText}
          onChange={(e) => onStateChange({ resumeText: e.target.value })}
          className={flash ? "border-red-500 focus-visible:ring-red-500" : undefined}
        />
        <p className={`text-[11px] mt-1.5 ${flash ? "text-red-600" : "text-muted-foreground"}`}>
          {remaining > 0
            ? `${remaining} more character${remaining === 1 ? "" : "s"} before we have enough to generate.`
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
