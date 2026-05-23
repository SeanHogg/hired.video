/**
 * GameEditor — right-rail editor surface for `mediaKind: "game"`
 * projects. Provides CRUD on the game state (replaced the earlier
 * read-only placeholder). Parallel to `<PropertiesPanel>` for
 * Timeline-runtime projects per the canvas-runtime extensibility
 * model (PRD §1.2): the editor shell dispatches to the right rail
 * surface based on `mediaKindUsesCanvasStateAuthoring(currentMediaKind)`.
 *
 * Sections (top → bottom):
 *   1. Game settings — canvas dimensions, FPS, start level dropdown.
 *   2. Levels — list of levels with select / rename / background-color
 *      / set-as-start / delete + "+ Add level" affordance.
 *   3. Sprites — list of sprites in the active level with select /
 *      delete + "+ Add sprite" with behavior picker.
 *   4. Sprite inspector — selected sprite's id / x / y / w / h /
 *      behavior dropdown / behavior-specific params from
 *      BEHAVIOR_PARAM_DEFAULTS.
 *
 * Every mutation flows through the pure helpers in
 * `lib/studio/game/game-state-edit.ts` — the component itself is a thin
 * controlled wrapper that calls helpers and threads the result to the
 * caller's `onChange`. The save / persistence concern belongs to the
 * editor shell (`StudioEditorV2.handleSave`).
 *
 * Behavior param forms are derived from `BEHAVIOR_PARAM_DEFAULTS` so
 * adding a new behavior + its params is ONE entry in that record;
 * the inspector picks it up automatically (DRY).
 */
import { useMemo } from "react";
import {
  Gamepad2,
  Plus,
  Star,
  StarOff,
  Trash2,
  ExternalLink,
} from "lucide-react";
import type { GameSprite, GameState } from "@shared/game-state";
import {
  BEHAVIORS,
  BEHAVIOR_LABELS,
  BEHAVIOR_PARAM_DEFAULTS,
  addLevel,
  addSprite,
  deleteLevel,
  deleteSprite,
  setStartLevel,
  updateGameSettings,
  updateLevel,
  updateSprite,
  updateSpriteParam,
  type Behavior,
} from "@/lib/studio/game/game-state-edit";
import { cn } from "@/lib/utils";

interface Props {
  gameState: GameState;
  onChange: (next: GameState) => void;
  activeLevelId: string | null;
  onSelectLevel: (levelId: string) => void;
  selectedSpriteId: string | null;
  onSelectSprite: (spriteId: string | null) => void;
}

export default function GameEditor({
  gameState,
  onChange,
  activeLevelId,
  onSelectLevel,
  selectedSpriteId,
  onSelectSprite,
}: Props) {
  const activeLevel = useMemo(
    () => gameState.levels.find((l) => l.id === activeLevelId) ?? gameState.levels[0] ?? null,
    [gameState.levels, activeLevelId],
  );
  const selectedSprite = useMemo(
    () => activeLevel?.sprites.find((s) => s.id === selectedSpriteId) ?? null,
    [activeLevel, selectedSpriteId],
  );

  function handleAddLevel() {
    const { state, level } = addLevel(gameState);
    onChange(state);
    onSelectLevel(level.id);
    onSelectSprite(null);
  }

  function handleDeleteLevel(levelId: string) {
    onChange(deleteLevel(gameState, levelId));
    if (levelId === activeLevelId) {
      // Retarget selection to the surviving first level.
      const fallback = gameState.levels.find((l) => l.id !== levelId);
      onSelectLevel(fallback?.id ?? "");
      onSelectSprite(null);
    }
  }

  function handleAddSprite(behavior: Behavior | null) {
    if (!activeLevel) return;
    const { state, sprite } = addSprite(gameState, activeLevel.id, {
      behavior,
      // Defaults under the behavior — start with the behavior's
      // canonical params (e.g. platformer-player gets runSpeed: 200) so
      // the runtime + the inspector agree on the initial values.
    });
    const params = Object.fromEntries(
      (BEHAVIOR_PARAM_DEFAULTS[behavior as Behavior] ?? []).map((p) => [p.key, p.default]),
    );
    const withParams = Object.keys(params).length > 0
      ? updateSprite(state, activeLevel.id, sprite.id, { params })
      : state;
    onChange(withParams);
    onSelectSprite(sprite.id);
  }

  function handleDeleteSprite(spriteId: string) {
    if (!activeLevel) return;
    onChange(deleteSprite(gameState, activeLevel.id, spriteId));
    if (spriteId === selectedSpriteId) onSelectSprite(null);
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-3 py-3 text-sm">
      <header className="flex items-center gap-2">
        <Gamepad2 className="h-5 w-5 text-fuchsia-500" />
        <h3 className="font-semibold">Game</h3>
      </header>

      {/* Game settings */}
      <Section label="Settings">
        <Field label="Canvas">
          <div className="flex items-center gap-1">
            <NumberInput
              value={gameState.width}
              onChange={(v) => onChange(updateGameSettings(gameState, { width: Math.max(1, v) }))}
              min={1}
              step={16}
              className="w-16"
            />
            <span className="text-muted-foreground">×</span>
            <NumberInput
              value={gameState.height}
              onChange={(v) => onChange(updateGameSettings(gameState, { height: Math.max(1, v) }))}
              min={1}
              step={16}
              className="w-16"
            />
          </div>
        </Field>
        <Field label="FPS">
          <NumberInput
            value={gameState.fps}
            onChange={(v) => onChange(updateGameSettings(gameState, { fps: Math.max(1, Math.min(120, v)) }))}
            min={1}
            max={120}
            step={1}
            className="w-16"
          />
        </Field>
        <Field label="Start level">
          <select
            value={gameState.startLevelId}
            onChange={(e) => onChange(setStartLevel(gameState, e.target.value))}
            className="h-7 rounded border border-border bg-background px-1 text-xs"
          >
            {gameState.levels.map((l) => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </Field>
      </Section>

      {/* Levels */}
      <Section
        label="Levels"
        action={
          <button
            type="button"
            onClick={handleAddLevel}
            className="inline-flex items-center gap-0.5 rounded px-1 text-[10px] uppercase tracking-widest text-fuchsia-600 hover:bg-fuchsia-50"
            title="Add level"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        }
      >
        <ul className="space-y-1">
          {gameState.levels.map((l, i) => {
            const isStart = l.id === gameState.startLevelId;
            const isActive = l.id === activeLevel?.id;
            return (
              <li
                key={l.id}
                className={cn(
                  "group flex items-center gap-1 rounded border px-1.5 py-1",
                  isActive ? "border-fuchsia-500 bg-fuchsia-50/40" : "border-border",
                )}
              >
                <button
                  type="button"
                  onClick={() => onChange(setStartLevel(gameState, l.id))}
                  title={isStart ? "Start level" : "Set as start level"}
                  className={cn("shrink-0", isStart ? "text-amber-500" : "text-muted-foreground hover:text-amber-500")}
                >
                  {isStart ? <Star className="h-3.5 w-3.5 fill-current" /> : <StarOff className="h-3.5 w-3.5" />}
                </button>
                <input
                  value={l.label}
                  onChange={(e) => onChange(updateLevel(gameState, l.id, { label: e.target.value }))}
                  onFocus={() => {
                    onSelectLevel(l.id);
                    onSelectSprite(null);
                  }}
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none focus:ring-1 focus:ring-fuchsia-500"
                />
                <input
                  type="color"
                  value={l.backgroundColor}
                  onChange={(e) => onChange(updateLevel(gameState, l.id, { backgroundColor: e.target.value }))}
                  className="h-5 w-5 shrink-0 cursor-pointer rounded border border-border"
                  title="Level background color"
                />
                <span className="shrink-0 tabular-nums text-[10px] text-muted-foreground">
                  {l.sprites.length}
                </span>
                <button
                  type="button"
                  onClick={() => handleDeleteLevel(l.id)}
                  disabled={gameState.levels.length <= 1}
                  className="shrink-0 text-muted-foreground opacity-0 hover:text-rose-600 group-hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-30"
                  title={gameState.levels.length <= 1 ? "Need at least one level" : "Delete level"}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
                {/* Reorder up/down — render arrows when there's room.
                    Cheap reorder via the pure helper. */}
                <span className="shrink-0 text-[9px] text-muted-foreground">{i + 1}</span>
              </li>
            );
          })}
        </ul>
      </Section>

      {/* Sprites */}
      {activeLevel && (
        <Section
          label={`Sprites — ${activeLevel.label}`}
          action={
            <SpritePicker onPick={handleAddSprite} />
          }
        >
          {activeLevel.sprites.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No sprites yet. Add one above to start placing them.
            </p>
          ) : (
            <ul className="space-y-1">
              {activeLevel.sprites.map((s) => {
                const isSel = s.id === selectedSprite?.id;
                return (
                  <li
                    key={s.id}
                    className={cn(
                      "group flex items-center gap-1 rounded border px-1.5 py-1",
                      isSel ? "border-fuchsia-500 bg-fuchsia-50/40" : "border-border",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectSprite(s.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-mono text-[11px]">{s.id}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {s.behavior ?? "no behavior"}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSprite(s.id)}
                      className="shrink-0 text-muted-foreground opacity-0 hover:text-rose-600 group-hover:opacity-100"
                      title="Delete sprite"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      )}

      {/* Sprite inspector */}
      {activeLevel && selectedSprite && (
        <Section label="Sprite">
          <Field label="id">
            <input
              value={selectedSprite.id}
              onChange={(e) =>
                onChange(updateSprite(gameState, activeLevel.id, selectedSprite.id, { id: e.target.value } as Partial<GameSprite>))
              }
              className="h-7 w-full rounded border border-border bg-background px-1.5 font-mono text-xs"
            />
          </Field>
          <Field label="x">
            <NumberInput
              value={selectedSprite.x}
              onChange={(v) => onChange(updateSprite(gameState, activeLevel.id, selectedSprite.id, { x: v }))}
              step={1}
              className="w-20"
            />
          </Field>
          <Field label="y">
            <NumberInput
              value={selectedSprite.y}
              onChange={(v) => onChange(updateSprite(gameState, activeLevel.id, selectedSprite.id, { y: v }))}
              step={1}
              className="w-20"
            />
          </Field>
          <Field label="width">
            <NumberInput
              value={selectedSprite.width}
              onChange={(v) => onChange(updateSprite(gameState, activeLevel.id, selectedSprite.id, { width: Math.max(1, v) }))}
              min={1}
              step={1}
              className="w-20"
            />
          </Field>
          <Field label="height">
            <NumberInput
              value={selectedSprite.height}
              onChange={(v) => onChange(updateSprite(gameState, activeLevel.id, selectedSprite.id, { height: Math.max(1, v) }))}
              min={1}
              step={1}
              className="w-20"
            />
          </Field>
          <Field label="behavior">
            <select
              value={selectedSprite.behavior ?? ""}
              onChange={(e) => {
                const value = e.target.value === "" ? null : (e.target.value as Behavior);
                // Reset params to the new behavior's defaults so the
                // runtime sees the expected shape after a behavior swap.
                const params = value
                  ? Object.fromEntries(
                      (BEHAVIOR_PARAM_DEFAULTS[value] ?? []).map((p) => [p.key, p.default]),
                    )
                  : {};
                onChange(
                  updateSprite(gameState, activeLevel.id, selectedSprite.id, {
                    behavior: value,
                    params,
                  }),
                );
              }}
              className="h-7 rounded border border-border bg-background px-1 text-xs"
            >
              <option value="">(none)</option>
              {BEHAVIORS.map((b) => (
                <option key={b} value={b}>{BEHAVIOR_LABELS[b]}</option>
              ))}
            </select>
          </Field>

          {/* Per-behavior params — rendered from the registry so adding
              a new behavior is one entry in BEHAVIOR_PARAM_DEFAULTS. */}
          {selectedSprite.behavior && (
            <BehaviorParamsForm
              behavior={selectedSprite.behavior as Behavior}
              sprite={selectedSprite}
              onParamChange={(key, value) =>
                onChange(updateSpriteParam(gameState, activeLevel.id, selectedSprite.id, key, value))
              }
            />
          )}
        </Section>
      )}

      {/* Roadmap pointer — the heavyweight upgrade (Phaser engine, drag-to-
          move on the canvas, asset library) lives in #939. Stays so users
          know what's still ahead. */}
      <section className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
        <p className="text-muted-foreground">
          Drag-to-move sprites, asset library, and Phaser engine ship next.
          <a
            href="https://github.com/anthropics/claude-code/issues"
            target="_blank"
            rel="noreferrer"
            className="ml-1 inline-flex items-center gap-0.5 text-fuchsia-600 hover:underline"
          >
            Roadmap #939
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </section>
    </div>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <header className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </h4>
        {action}
      </header>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      className={cn(
        "h-7 rounded border border-border bg-background px-1 text-right text-xs tabular-nums",
        className,
      )}
    />
  );
}

function SpritePicker({ onPick }: { onPick: (behavior: Behavior | null) => void }) {
  // Compact "+ Add sprite" affordance — single button that opens a small
  // dropdown of behaviors so a fresh sprite arrives with sensible params.
  // The "(no behavior)" option places a decorative sprite the user can
  // edit afterwards. Native <select> keeps the component dependency-free.
  return (
    <select
      onChange={(e) => {
        if (!e.target.value) return;
        const value = e.target.value === "__none__" ? null : (e.target.value as Behavior);
        onPick(value);
        e.target.selectedIndex = 0; // reset placeholder
      }}
      defaultValue=""
      className="h-6 rounded border border-fuchsia-300 bg-fuchsia-50/50 px-1 text-[10px] uppercase tracking-widest text-fuchsia-700 hover:bg-fuchsia-50"
      title="Add sprite"
    >
      <option value="" disabled>+ Add sprite</option>
      <option value="__none__">(no behavior)</option>
      {BEHAVIORS.map((b) => (
        <option key={b} value={b}>{BEHAVIOR_LABELS[b]}</option>
      ))}
    </select>
  );
}

function BehaviorParamsForm({
  behavior,
  sprite,
  onParamChange,
}: {
  behavior: Behavior;
  sprite: GameSprite;
  onParamChange: (key: string, value: unknown) => void;
}) {
  const specs = BEHAVIOR_PARAM_DEFAULTS[behavior];
  if (!specs || specs.length === 0) return null;
  return (
    <div className="mt-1 space-y-1 rounded border border-border bg-muted/30 px-2 py-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        Behavior params
      </p>
      {specs.map((spec) => {
        const current = sprite.params?.[spec.key];
        if (spec.kind === "number") {
          const v = typeof current === "number" ? current : (spec.default as number);
          return (
            <Field key={spec.key} label={spec.label}>
              <NumberInput
                value={v}
                onChange={(next) => onParamChange(spec.key, next)}
                className="w-20"
              />
            </Field>
          );
        }
        if (spec.kind === "boolean") {
          const v = typeof current === "boolean" ? current : (spec.default as boolean);
          return (
            <Field key={spec.key} label={spec.label}>
              <input
                type="checkbox"
                checked={v}
                onChange={(e) => onParamChange(spec.key, e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-fuchsia-600"
              />
            </Field>
          );
        }
        // text
        const v = typeof current === "string" ? current : String(spec.default);
        return (
          <Field key={spec.key} label={spec.label}>
            <input
              value={v}
              onChange={(e) => onParamChange(spec.key, e.target.value)}
              className="h-7 w-32 rounded border border-border bg-background px-1.5 text-xs"
            />
          </Field>
        );
      })}
    </div>
  );
}
