/**
 * Intake form for every comic template.
 *
 * One IntakeForm component is shared by every genre in the catalog (per
 * the DRY rule + the `feedback_extract_on_duplication` guidance — same
 * shape, different palette, so there's no reason to ship 12 near-
 * identical forms).
 *
 * Fields gathered:
 *   - Genre (12 cards, one is "Use the genre baked into the template")
 *   - Source (resume / profile / services / auto)
 *   - Protagonist name (auto-fills from the user's profile on first
 *     render via `useUserBasics`; user can override)
 *   - Prompt — free-form creative direction
 *   - "Generate a hero portrait" toggle (hybrid AI-image path)
 *
 * The generator endpoint (`POST /api/studio/generate-comic`) reads these
 * fields off the same `StudioProjectState` the rest of the studio uses
 * — no parallel "comic state" exists. The wizard / editor just calls
 * the endpoint and replaces the canvas state with the response.
 */

import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  COMIC_GENRES,
  type ComicGenreId,
} from "@shared/comic-genres";
import { MIN_PROMPT_CHARS, hasRepeatedCharPlaceholder } from "@/lib/studio/can-generate";
import { useAuth } from "@/lib/auth";
import type { IntakeProps } from "../catalog";

const SOURCES: {
  id: "resume" | "profile" | "services" | "auto";
  label: string;
  hint: string;
}[] = [
  { id: "auto",     label: "Auto-pick",  hint: "Use whichever artefact is richest." },
  { id: "resume",   label: "Resume",     hint: "Career history powers the panels." },
  { id: "profile",  label: "Profile",    hint: "Bio + highlights drive the story." },
  { id: "services", label: "My services", hint: "Pitch your offerings as the arc." },
];

export default function ComicIntake({
  state,
  onStateChange,
  validationFlash,
}: IntakeProps) {
  // Default genre = first in the catalog if the user hasn't picked one
  // yet (templates may pre-select via `defaultStudioState` on init).
  const activeGenre: ComicGenreId = state.comicGenreId ?? COMIC_GENRES[0].id;
  const source = state.comicSourceKind ?? "auto";

  // Pre-fill protagonist name from the user's auth profile the first
  // time the intake renders with an empty name. The form is uncontrolled
  // for back-fill: we DON'T write to state on mount (which would mark
  // the project dirty before the user has typed). We show the auth
  // first-name as a placeholder + as the visible value until the user
  // types something different.
  const { user } = useAuth();
  const protagonistName =
    state.comicProtagonistName ?? user?.firstName ?? "";

  const promptText = state.prompt?.trim() ?? "";
  const remaining = Math.max(0, MIN_PROMPT_CHARS - promptText.length);
  const placeholderLike =
    promptText.length >= MIN_PROMPT_CHARS && hasRepeatedCharPlaceholder(promptText);
  const flashPrompt =
    validationFlash && (promptText.length < MIN_PROMPT_CHARS || placeholderLike);

  // Memoise the active palette swatch — the picker shows a coloured
  // chip per genre and we re-render the SAME swatches across the grid.
  const swatches = useMemo(
    () =>
      COMIC_GENRES.map((g) => ({
        id: g.id,
        label: g.label,
        description: g.description,
        palette: g.palette,
      })),
    [],
  );

  return (
    <div className="flex flex-col gap-5 p-4">
      {/* ── Genre picker ─────────────────────────────────────────── */}
      <section>
        <Label className="mb-2 block text-sm font-semibold">Pick a genre</Label>
        <p className="mb-3 text-xs text-muted-foreground">
          Each genre ships its own palette, fonts, sound-effect vocabulary, and
          stock backgrounds. You can change anything later in the editor.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {swatches.map((g) => {
            const active = g.id === activeGenre;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() =>
                  onStateChange({ comicGenreId: g.id })
                }
                className={cn(
                  "group flex flex-col items-stretch rounded-lg border bg-card p-2 text-left transition-all",
                  active
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border hover:border-primary/60",
                )}
                aria-pressed={active}
              >
                <div
                  className="mb-2 h-14 w-full overflow-hidden rounded"
                  style={{
                    background: `linear-gradient(135deg, ${g.palette.primary} 0%, ${g.palette.secondary} 50%, ${g.palette.accent} 100%)`,
                  }}
                  aria-hidden="true"
                >
                  <div
                    className="h-full w-full"
                    style={{
                      background: `radial-gradient(circle at 20% 20%, ${g.palette.paper}88 0%, transparent 60%)`,
                    }}
                  />
                </div>
                <div className="text-sm font-medium leading-tight">{g.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                  {g.description}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Protagonist name ────────────────────────────────────── */}
      <section>
        <Label htmlFor="comic-protagonist" className="mb-1.5 block text-sm font-semibold">
          Who's the hero of the story?
        </Label>
        <p className="mb-2 text-xs text-muted-foreground">
          The protagonist's name appears in captions, on bubble tails, and on
          the closing pitch card.
        </p>
        <Input
          id="comic-protagonist"
          value={protagonistName}
          placeholder="e.g. Alex Chen"
          onChange={(e) =>
            onStateChange({ comicProtagonistName: e.target.value })
          }
        />
      </section>

      {/* ── Source picker ───────────────────────────────────────── */}
      <section>
        <Label className="mb-1.5 block text-sm font-semibold">
          What should fuel the story?
        </Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SOURCES.map((s) => {
            const active = source === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onStateChange({ comicSourceKind: s.id })}
                className={cn(
                  "rounded-md border bg-card p-2 text-left transition-colors",
                  active
                    ? "border-primary ring-2 ring-primary/40"
                    : "border-border hover:border-primary/60",
                )}
                aria-pressed={active}
              >
                <div className="text-sm font-medium">{s.label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {s.hint}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ── Creative direction ─────────────────────────────────── */}
      <section>
        <Label htmlFor="comic-prompt" className="mb-1.5 block text-sm font-semibold">
          Creative direction
        </Label>
        <p className="mb-2 text-xs text-muted-foreground">
          One sentence on what this comic is for — the role you're chasing, the
          client you want to land, the founder you'd love to work for. We turn
          it into a 6-page pitch.
        </p>
        <Textarea
          id="comic-prompt"
          rows={4}
          placeholder="e.g. I want to land a Senior React role at a climate-tech startup — show me solving a hard frontend problem under pressure and shipping it."
          value={state.prompt}
          onChange={(e) => onStateChange({ prompt: e.target.value })}
          className={
            flashPrompt ? "border-red-500 focus-visible:ring-red-500" : undefined
          }
        />
        <p
          className={cn(
            "mt-1.5 text-[11px]",
            flashPrompt ? "text-red-600" : "text-muted-foreground",
          )}
        >
          {remaining > 0
            ? `${remaining} more character${remaining === 1 ? "" : "s"} before we can scaffold the comic.`
            : placeholderLike
              ? "That looks like a placeholder — try real sentences."
              : "Ready to scaffold."}
        </p>
      </section>

      {/* ── Hybrid AI portrait toggle ──────────────────────────── */}
      <section className="rounded-lg border bg-muted/30 p-3">
        <div className="flex items-start gap-3">
          <Switch
            id="comic-portrait-toggle"
            checked={state.comicGenerateCharacterPortrait ?? false}
            onCheckedChange={(checked) =>
              onStateChange({ comicGenerateCharacterPortrait: checked })
            }
          />
          <div className="flex-1">
            <Label
              htmlFor="comic-portrait-toggle"
              className="cursor-pointer text-sm font-semibold"
            >
              Generate a personalised hero portrait
            </Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              On: we generate one portrait of your protagonist in this genre's
              style and use it on every page. Off: free stock SVG silhouettes
              are used instead. (Costs ~10k tokens; ~$0.03 if you're metered.)
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
