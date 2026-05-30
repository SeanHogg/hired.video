/**
 * GamePropertiesPanel — right-rail panel for game-kind projects.
 * Parallel to `<PropertiesPanel>` for Timeline-runtime kinds: same
 * shell slot, same "the panel content adapts to the editor's
 * current selection" interaction model.
 *
 * Selection dispatch (per `GameSelection` in StudioEditorV2):
 *   - { kind: "canvas" } / null → game-wide settings (canvas dims,
 *       FPS, start level).
 *   - { kind: "level", levelId } → that level's properties (label,
 *       background color, sprite count, set-as-start, delete).
 *   - { kind: "sprite", levelId, spriteId } → sprite inspector (id /
 *       x / y / w / h / behavior + per-behavior params + sprite
 *       picker that swaps the visual).
 *
 * All mutations go through pure helpers in `lib/studio/game/game-state-edit.ts`.
 * Sprite-swap goes through `assignSpriteAsset` so the new sprite's
 * asset is copied into `state.assets` once (idempotent).
 */
import { useMemo, useState } from "react";
import type { ScriptProgram } from "@shared/game-blocks";
import BlockWorkspace from "@/components/studio/game/blocks/BlockWorkspace";
import { Gamepad2, Plus, Trash2 } from "lucide-react";
import {
  PanelShell,
  Section,
  Field,
  ReadOnlyRow,
  NumberInput,
  DangerZone,
} from "@/components/studio/shared/InspectorShell";
import type {
  AnimationSpec,
  BlockAction,
  BlockRule,
  BlockTrigger,
  GameSprite,
  GameState,
} from "@shared/game-state";
import {
  BEHAVIORS,
  BEHAVIOR_LABELS,
  BEHAVIOR_PARAM_DEFAULTS,
  addAction,
  addRule,
  assignSpriteAsset,
  deleteAction,
  deleteLevel,
  deleteRule,
  deleteSprite,
  setStartLevel,
  updateAction,
  updateGamePhysics,
  updateGameSettings,
  updateLevel,
  updateRuleTrigger,
  updateSprite,
  updateSpriteAnimation,
  updateSpriteParam,
  updateSpritePhysics,
  type Behavior,
} from "@/lib/studio/game/game-state-edit";
import type { GameSpritePhysics } from "@shared/game-state";
import {
  BUILTIN_SPRITES,
  pickBuiltinSprite,
} from "@/lib/studio/game/sprite-library";
import { cn } from "@/lib/utils";

// Trigger + action option tables — single source the rule editor
// reads to populate dropdowns. Adding a new trigger / action is one
// entry here + one branch in the runtime (`fireRules` / `executeActions`).

const TRIGGER_OPTIONS: Array<{ kind: BlockTrigger["kind"]; label: string }> = [
  { kind: "on-level-mount", label: "When the level starts" },
  { kind: "on-tick",        label: "Every frame" },
  { kind: "on-key-press",   label: "When a key is pressed" },
  { kind: "on-click",       label: "When this sprite is clicked" },
  { kind: "every-seconds",  label: "Every N seconds" },
];

const ACTION_OPTIONS: Array<{ kind: BlockAction["kind"]; label: string }> = [
  { kind: "move-by",      label: "Move by Δx, Δy" },
  { kind: "set-position", label: "Set position (x, y)" },
  { kind: "set-property", label: "Set width / height" },
  { kind: "show",         label: "Show sprite" },
  { kind: "hide",         label: "Hide sprite" },
  { kind: "goto-level",   label: "Go to level" },
  { kind: "set-message",  label: "Say message" },
];

const ANIMATION_OPTIONS: Array<{ kind: AnimationSpec["kind"]; label: string }> = [
  { kind: "none",           label: "None (instant)" },
  { kind: "fade-in",        label: "Fade in" },
  { kind: "slide-in-left",  label: "Slide in (from left)" },
  { kind: "slide-in-right", label: "Slide in (from right)" },
  { kind: "slide-in-up",    label: "Slide in (from above)" },
  { kind: "slide-in-down",  label: "Slide in (from below)" },
  { kind: "scale-up",       label: "Scale up" },
];

const EASING_OPTIONS: Array<{ kind: AnimationSpec["easing"]; label: string }> = [
  { kind: "linear",      label: "Linear" },
  { kind: "ease-in",     label: "Ease in" },
  { kind: "ease-out",    label: "Ease out" },
  { kind: "ease-in-out", label: "Ease in-out" },
];

/** Factory for a fresh action of the chosen kind. Each action has its
 *  own default-arg shape; the rule editor calls this when the user
 *  picks "+ Add action" from the dropdown so the new entry arrives
 *  fully populated (no `undefined`-field crashes when the runtime
 *  reads it). */
function defaultAction(kind: BlockAction["kind"]): BlockAction {
  switch (kind) {
    case "move-by":      return { kind: "move-by", dx: 10, dy: 0 };
    case "set-position": return { kind: "set-position", x: 0, y: 0 };
    case "set-property": return { kind: "set-property", property: "width", value: 64 };
    case "show":         return { kind: "show" };
    case "hide":         return { kind: "hide" };
    case "goto-level":   return { kind: "goto-level", levelId: "" };
    case "play-sound":   return { kind: "play-sound", assetId: "" };
    case "wait-seconds": return { kind: "wait-seconds", seconds: 1 };
    case "set-message":  return { kind: "set-message", text: "" };
  }
}

function defaultTrigger(kind: BlockTrigger["kind"]): BlockTrigger {
  switch (kind) {
    case "on-level-mount":   return { kind: "on-level-mount" };
    case "on-tick":          return { kind: "on-tick" };
    case "on-key-press":     return { kind: "on-key-press", key: "ArrowRight" };
    case "on-click":         return { kind: "on-click" };
    case "on-collide-with":  return { kind: "on-collide-with", spriteId: "" };
    case "every-seconds":    return { kind: "every-seconds", interval: 2 };
  }
}

export type GameSelection =
  | { kind: "canvas" }
  | { kind: "level"; levelId: string }
  | { kind: "sprite"; levelId: string; spriteId: string }
  // 3D world selection — used when `gameState.engine === "world-3d"`.
  // The right-rail `<Game3DRightRail>` reads this; GameStage3D
  // dispatches selection updates through the same gameSelection
  // setter the 2D path uses (DRY: one selection bus per project).
  | { kind: "entity-3d"; entityId: string };

interface Props {
  gameState: GameState;
  onChange: (next: GameState) => void;
  selection: GameSelection;
  onSelectionChange: (next: GameSelection) => void;
}

export default function GamePropertiesPanel({
  gameState,
  onChange,
  selection,
  onSelectionChange,
}: Props) {
  if (selection.kind === "sprite") {
    const level = gameState.levels.find((l) => l.id === selection.levelId);
    const sprite = level?.sprites.find((s) => s.id === selection.spriteId);
    if (!level || !sprite) {
      // Stale selection (the sprite or level was deleted while still
      // selected). Snap to canvas so the panel always renders something
      // valid.
      onSelectionChange({ kind: "canvas" });
      return null;
    }
    return (
      <SpriteInspector
        gameState={gameState}
        onChange={onChange}
        levelId={level.id}
        sprite={sprite}
        onDeselect={() => onSelectionChange({ kind: "canvas" })}
        onDelete={() => {
          onChange(deleteSprite(gameState, level.id, sprite.id));
          onSelectionChange({ kind: "canvas" });
        }}
      />
    );
  }
  if (selection.kind === "level") {
    const level = gameState.levels.find((l) => l.id === selection.levelId);
    if (!level) {
      onSelectionChange({ kind: "canvas" });
      return null;
    }
    return (
      <LevelInspector
        gameState={gameState}
        onChange={onChange}
        levelId={level.id}
        onDeselect={() => onSelectionChange({ kind: "canvas" })}
        onDelete={() => {
          onChange(deleteLevel(gameState, level.id));
          onSelectionChange({ kind: "canvas" });
        }}
      />
    );
  }
  return <GameSettingsInspector gameState={gameState} onChange={onChange} />;
}

// ─── Section subcomponents ──────────────────────────────────────────────────

function GameSettingsInspector({
  gameState,
  onChange,
}: {
  gameState: GameState;
  onChange: (next: GameState) => void;
}) {
  return (
    <PanelShell title="Game" icon={Gamepad2}>
      <Section label="Canvas">
        <Field label="Width">
          <NumberInput
            value={gameState.width}
            onChange={(v) => onChange(updateGameSettings(gameState, { width: Math.max(1, v) }))}
            min={1}
            step={16}
          />
        </Field>
        <Field label="Height">
          <NumberInput
            value={gameState.height}
            onChange={(v) => onChange(updateGameSettings(gameState, { height: Math.max(1, v) }))}
            min={1}
            step={16}
          />
        </Field>
        <Field label="FPS">
          <NumberInput
            value={gameState.fps}
            onChange={(v) => onChange(updateGameSettings(gameState, { fps: Math.max(1, Math.min(120, v)) }))}
            min={1}
            max={120}
            step={1}
          />
        </Field>
      </Section>

      <Section label="Start level">
        <select
          value={gameState.startLevelId}
          onChange={(e) => onChange(setStartLevel(gameState, e.target.value))}
          className="h-7 w-full rounded border border-border bg-background px-1 text-xs"
        >
          {gameState.levels.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      </Section>

      {/* Physics (#1009) — opt-in. Enabling turns on the gravity +
          collision solver in `runtime-core.js`'s stepPhysics; sprites
          opt into being affected via the SpriteInspector's Physics
          section. */}
      <Section label="Physics">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!gameState.physics}
            onChange={(e) =>
              onChange(
                updateGamePhysics(
                  gameState,
                  e.target.checked ? { gravity: 1200, friction: 0.1 } : undefined,
                ),
              )
            }
            className="h-4 w-4 accent-fuchsia-500"
          />
          <span>Enable physics (gravity + collisions)</span>
        </label>
        {gameState.physics && (
          <>
            <Field label="Gravity">
              <NumberInput
                value={gameState.physics.gravity}
                onChange={(v) => onChange(updateGamePhysics(gameState, { gravity: v, friction: gameState.physics!.friction }))}
                min={0}
                max={5000}
                step={50}
              />
            </Field>
            <Field label="Friction">
              <NumberInput
                value={gameState.physics.friction}
                onChange={(v) => onChange(updateGamePhysics(gameState, { gravity: gameState.physics!.gravity, friction: Math.max(0, Math.min(1, v)) }))}
                min={0}
                max={1}
                step={0.05}
              />
            </Field>
            <p className="text-[10px] text-muted-foreground">
              Sprites are kinematic by default — set a sprite's body kind to
              <code className="mx-1 rounded bg-slate-100 px-1">dynamic</code>
              or <code className="rounded bg-slate-100 px-1">static</code> in
              the sprite inspector to make them participate.
            </p>
          </>
        )}
      </Section>

      <Section label="Stats">
        <ReadOnlyRow label="Levels">{gameState.levels.length}</ReadOnlyRow>
        <ReadOnlyRow label="Sprites">
          {gameState.levels.reduce((n, l) => n + l.sprites.length, 0)}
        </ReadOnlyRow>
        <ReadOnlyRow label="Assets">{gameState.assets.length}</ReadOnlyRow>
        <ReadOnlyRow label="Engine">{gameState.engine}</ReadOnlyRow>
      </Section>
    </PanelShell>
  );
}

function LevelInspector({
  gameState,
  onChange,
  levelId,
  onDeselect,
  onDelete,
}: {
  gameState: GameState;
  onChange: (next: GameState) => void;
  levelId: string;
  onDeselect: () => void;
  onDelete: () => void;
}) {
  const level = gameState.levels.find((l) => l.id === levelId)!;
  const isStart = gameState.startLevelId === level.id;
  return (
    <PanelShell title="Level" icon={Gamepad2} onDeselect={onDeselect}>
      <Section label="Identity">
        <Field label="Label">
          <input
            value={level.label}
            onChange={(e) => onChange(updateLevel(gameState, level.id, { label: e.target.value }))}
            className="h-7 w-full rounded border border-border bg-background px-1.5 text-xs"
          />
        </Field>
        <Field label="Id">
          <span className="font-mono text-[10px] text-muted-foreground">{level.id}</span>
        </Field>
      </Section>

      <Section label="Appearance">
        <Field label="Background">
          <input
            type="color"
            value={level.backgroundColor}
            onChange={(e) =>
              onChange(updateLevel(gameState, level.id, { backgroundColor: e.target.value }))
            }
            className="h-7 w-12 cursor-pointer rounded border border-border"
          />
        </Field>
      </Section>

      <Section label="Flow">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={isStart}
            disabled={isStart}
            onChange={() => onChange(setStartLevel(gameState, level.id))}
            className="h-4 w-4 accent-amber-500"
          />
          <span>Start the game on this level</span>
        </label>
      </Section>

      <Section label="Stats">
        <ReadOnlyRow label="Sprites">{level.sprites.length}</ReadOnlyRow>
      </Section>

      <DangerZone>
        <button
          type="button"
          onClick={onDelete}
          disabled={gameState.levels.length <= 1}
          className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Trash2 className="h-3 w-3" />
          Delete level
        </button>
        {gameState.levels.length <= 1 && (
          <p className="mt-1 text-[10px] text-muted-foreground">
            Can't delete — a game needs at least one level.
          </p>
        )}
      </DangerZone>
    </PanelShell>
  );
}

function SpriteInspector({
  gameState,
  onChange,
  levelId,
  sprite,
  onDeselect,
  onDelete,
}: {
  gameState: GameState;
  onChange: (next: GameState) => void;
  levelId: string;
  sprite: GameSprite;
  onDeselect: () => void;
  onDelete: () => void;
}) {
  const currentBuiltin = useMemo(
    () => pickBuiltinSprite(sprite.assetId),
    [sprite.assetId],
  );
  return (
    <PanelShell title="Sprite" icon={Gamepad2} onDeselect={onDeselect}>
      <Section label="Identity">
        {/* `id` is read-only — it doubles as the runtime reference key
            for selection + behavior dispatch, so an in-place rename
            would invalidate the editor's `gameSelection.spriteId` and
            any `nextLevelId` flow edges that point at this sprite.
            Free-text labelling is intentionally deferred (one field on
            the data model + a single inspector input) until the data
            model splits id from label. */}
        <Field label="Id">
          <span className="font-mono text-[10px] text-muted-foreground">{sprite.id}</span>
        </Field>
      </Section>

      <Section label="Position & size">
        <Field label="x">
          <NumberInput
            value={sprite.x}
            onChange={(v) => onChange(updateSprite(gameState, levelId, sprite.id, { x: v }))}
            step={1}
          />
        </Field>
        <Field label="y">
          <NumberInput
            value={sprite.y}
            onChange={(v) => onChange(updateSprite(gameState, levelId, sprite.id, { y: v }))}
            step={1}
          />
        </Field>
        <Field label="Width">
          <NumberInput
            value={sprite.width}
            onChange={(v) => onChange(updateSprite(gameState, levelId, sprite.id, { width: Math.max(1, v) }))}
            min={1}
            step={1}
          />
        </Field>
        <Field label="Height">
          <NumberInput
            value={sprite.height}
            onChange={(v) => onChange(updateSprite(gameState, levelId, sprite.id, { height: Math.max(1, v) }))}
            min={1}
            step={1}
          />
        </Field>
      </Section>

      <Section label="Sprite">
        {currentBuiltin && (
          <div className="mb-2 flex items-center gap-2 rounded border border-border bg-muted/30 px-2 py-1.5">
            <img
              src={currentBuiltin.url}
              alt=""
              className="h-8 w-8 object-contain"
              draggable={false}
            />
            <span className="text-xs text-muted-foreground">{currentBuiltin.label}</span>
          </div>
        )}
        <p className="mb-1 text-[10px] text-muted-foreground">Swap to a different sprite:</p>
        <div className="grid grid-cols-4 gap-1.5">
          {BUILTIN_SPRITES.map((s) => {
            const isCurrent = s.id === sprite.assetId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onChange(assignSpriteAsset(gameState, levelId, sprite.id, s))}
                title={s.label}
                className={cn(
                  "flex h-10 items-center justify-center rounded border bg-card p-1 hover:border-fuchsia-400",
                  isCurrent ? "border-fuchsia-500 ring-2 ring-fuchsia-500/30" : "border-border",
                )}
              >
                <img
                  src={s.url}
                  alt=""
                  className="max-h-8 max-w-full object-contain"
                  draggable={false}
                />
              </button>
            );
          })}
        </div>
      </Section>

      <Section label="Behavior">
        <Field label="Type">
          <select
            value={sprite.behavior ?? ""}
            onChange={(e) => {
              const value = e.target.value === "" ? null : (e.target.value as Behavior);
              // Reset params to the new behavior's defaults so the
              // runtime sees the expected shape after a swap.
              const params = value
                ? Object.fromEntries(
                    (BEHAVIOR_PARAM_DEFAULTS[value] ?? []).map((p) => [p.key, p.default]),
                  )
                : {};
              onChange(updateSprite(gameState, levelId, sprite.id, { behavior: value, params }));
            }}
            className="h-7 w-full rounded border border-border bg-background px-1 text-xs"
          >
            <option value="">(none)</option>
            {BEHAVIORS.map((b) => (
              <option key={b} value={b}>{BEHAVIOR_LABELS[b]}</option>
            ))}
          </select>
        </Field>
        {sprite.behavior && (
          <BehaviorParamsForm
            behavior={sprite.behavior as Behavior}
            sprite={sprite}
            onParamChange={(key, value) =>
              onChange(updateSpriteParam(gameState, levelId, sprite.id, key, value))
            }
          />
        )}
      </Section>

      <Section label="Animation">
        <AnimationForm
          spec={sprite.onMount ?? null}
          onChange={(spec) =>
            onChange(updateSpriteAnimation(gameState, levelId, sprite.id, spec))
          }
        />
      </Section>

      {/* Physics (#1009) — per-sprite body kind opt-in. Only visible
          when project-level physics is enabled (mirrors the "shared
          component decides its own visibility" DRY rule). */}
      {gameState.physics && (
        <Section label="Physics">
          <SpritePhysicsForm
            physics={sprite.physics ?? null}
            onChange={(next) =>
              onChange(updateSpritePhysics(gameState, levelId, sprite.id, next))
            }
          />
        </Section>
      )}

      <Section label="Block scripts">
        <ScriptsTabbed
          gameState={gameState}
          onChange={onChange}
          levelId={levelId}
          sprite={sprite}
        />
      </Section>

      <DangerZone>
        <button
          type="button"
          onClick={onDelete}
          className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100"
        >
          <Trash2 className="h-3 w-3" />
          Delete sprite
        </button>
      </DangerZone>
    </PanelShell>
  );
}

// ─── Chrome primitives ──────────────────────────────────────────────────────

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
    <div className="mt-1 space-y-1.5 rounded border border-border bg-muted/30 px-2 py-2">
      {specs.map((spec) => {
        const current = sprite.params?.[spec.key];
        if (spec.kind === "number") {
          const v = typeof current === "number" ? current : (spec.default as number);
          return (
            <Field key={spec.key} label={spec.label}>
              <NumberInput value={v} onChange={(next) => onParamChange(spec.key, next)} />
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

// ─── Animation form ─────────────────────────────────────────────────────────

function AnimationForm({
  spec,
  onChange,
}: {
  spec: AnimationSpec | null;
  onChange: (next: AnimationSpec | null) => void;
}) {
  const kind = spec?.kind ?? "none";
  const duration = spec?.durationMs ?? 500;
  const easing = spec?.easing ?? "ease-out";
  return (
    <div className="space-y-1.5 rounded border border-border bg-muted/30 px-2 py-2">
      <Field label="Style">
        <select
          value={kind}
          onChange={(e) => {
            const next = e.target.value as AnimationSpec["kind"];
            if (next === "none") {
              onChange(null);
            } else {
              onChange({ kind: next, durationMs: duration, easing });
            }
          }}
          className="h-7 rounded border border-border bg-background px-1 text-xs"
        >
          {ANIMATION_OPTIONS.map((opt) => (
            <option key={opt.kind} value={opt.kind}>{opt.label}</option>
          ))}
        </select>
      </Field>
      {kind !== "none" && (
        <>
          <Field label="Duration (ms)">
            <NumberInput
              value={duration}
              onChange={(v) =>
                onChange({
                  kind: kind as AnimationSpec["kind"],
                  durationMs: Math.max(1, v),
                  easing,
                })
              }
              min={1}
              step={50}
            />
          </Field>
          <Field label="Easing">
            <select
              value={easing}
              onChange={(e) =>
                onChange({
                  kind: kind as AnimationSpec["kind"],
                  durationMs: duration,
                  easing: e.target.value as AnimationSpec["easing"],
                })
              }
              className="h-7 rounded border border-border bg-background px-1 text-xs"
            >
              {EASING_OPTIONS.map((opt) => (
                <option key={opt.kind} value={opt.kind}>{opt.label}</option>
              ))}
            </select>
          </Field>
        </>
      )}
    </div>
  );
}

// ─── Per-sprite physics opt-in form (#1009) ────────────────────────────────

/** Sprite physics inspector — body-kind picker + mass + restitution
 *  fields. Visibility is gated by GameState.physics being enabled
 *  (parent toggles via the project-level Physics section). Per the DRY
 *  rule the form decides what to render based on the `physics` shape
 *  the caller hands it — no extra `enabled` boolean is prop-drilled. */
function SpritePhysicsForm({
  physics,
  onChange,
}: {
  physics: GameSpritePhysics | null;
  onChange: (next: GameSpritePhysics | undefined) => void;
}) {
  const kind = physics?.kind ?? "kinematic";
  const mass = physics?.mass ?? 1;
  const restitution = physics?.restitution ?? 0;
  return (
    <div className="space-y-1.5 rounded border border-border bg-muted/30 px-2 py-2">
      <Field label="Body kind">
        <select
          value={kind}
          onChange={(e) => {
            const next = e.target.value as GameSpritePhysics["kind"];
            // "kinematic" is the default no-op — clear the field so
            // the saved data stays compact for the common case.
            if (next === "kinematic" && !physics) {
              onChange(undefined);
            } else {
              onChange({ kind: next, mass, restitution });
            }
          }}
          className="h-7 rounded border border-border bg-background px-1 text-xs"
        >
          <option value="kinematic">Kinematic (default — moved by scripts)</option>
          <option value="static">Static (immovable platform)</option>
          <option value="dynamic">Dynamic (falls, bounces, collides)</option>
        </select>
      </Field>
      {kind === "dynamic" && (
        <>
          <Field label="Mass">
            <NumberInput
              value={mass}
              onChange={(v) =>
                onChange({ kind, mass: Math.max(0.1, v), restitution })
              }
              min={0.1}
              max={100}
              step={0.1}
            />
          </Field>
          <Field label="Bounciness">
            <NumberInput
              value={restitution}
              onChange={(v) =>
                onChange({ kind, mass, restitution: Math.max(0, Math.min(1, v)) })
              }
              min={0}
              max={1}
              step={0.05}
            />
          </Field>
        </>
      )}
      {physics && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          Clear physics
        </button>
      )}
    </div>
  );
}

// ─── Block scripts editor — tabbed: Visual blocks (#1007) | Form (#973) ─────

/** Tabbed wrapper that swaps the visual block editor (Scratch-shaped
 *  block canvas) with the flat-form trigger+actions table (#973).
 *
 *  Per the user's spec on #1007: non-coders get the visual block
 *  surface; advanced authors keep the form view. Both edit the same
 *  sprite but write to different fields — `scriptProgram` (extended
 *  AST) vs `scripts` (flat BlockRule[]) — so a sprite can carry both
 *  and the runtime fires them side-by-side.
 */
function ScriptsTabbed({
  gameState,
  onChange,
  levelId,
  sprite,
}: {
  gameState: GameState;
  onChange: (next: GameState) => void;
  levelId: string;
  sprite: GameSprite;
}) {
  // Default to "visual" when the sprite already has a scriptProgram, else
  // "form" to preserve the existing UX for legacy authoring.
  const [tab, setTab] = useState<"visual" | "form">(
    sprite.scriptProgram && sprite.scriptProgram.events.length > 0 ? "visual" : "form",
  );
  return (
    <div className="space-y-2">
      <div className="inline-flex rounded-md border bg-muted/30 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setTab("visual")}
          className={cn(
            "px-2 py-1 rounded transition-colors",
            tab === "visual" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Visual blocks
        </button>
        <button
          type="button"
          onClick={() => setTab("form")}
          className={cn(
            "px-2 py-1 rounded transition-colors",
            tab === "form" ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:text-foreground",
          )}
        >
          Form
        </button>
      </div>
      {tab === "visual" ? (
        <BlockWorkspace
          program={sprite.scriptProgram}
          activeLevelId={levelId}
          gameState={gameState}
          onChange={(program: ScriptProgram) =>
            onChange(updateSprite(gameState, levelId, sprite.id, { scriptProgram: program }))
          }
        />
      ) : (
        <ScriptsEditor
          gameState={gameState}
          onChange={onChange}
          levelId={levelId}
          spriteId={sprite.id}
          rules={sprite.scripts ?? []}
        />
      )}
    </div>
  );
}

function ScriptsEditor({
  gameState,
  onChange,
  levelId,
  spriteId,
  rules,
}: {
  gameState: GameState;
  onChange: (next: GameState) => void;
  levelId: string;
  spriteId: string;
  rules: BlockRule[];
}) {
  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">
        Snap-style rules — pick a trigger + a list of actions. Runs alongside
        the behavior above.
      </p>
      {rules.length === 0 && (
        <p className="rounded border border-dashed border-border bg-muted/30 px-2 py-2 text-[11px] text-muted-foreground">
          No rules yet. Add one below.
        </p>
      )}
      {rules.map((rule) => (
        <RuleCard
          key={rule.id}
          gameState={gameState}
          onChange={onChange}
          levelId={levelId}
          spriteId={spriteId}
          rule={rule}
        />
      ))}
      <button
        type="button"
        onClick={() =>
          onChange(addRule(gameState, levelId, spriteId, defaultTrigger("on-level-mount")))
        }
        className="inline-flex items-center gap-1 rounded border border-fuchsia-300 bg-fuchsia-50 px-2 py-1 text-xs text-fuchsia-700 hover:bg-fuchsia-100"
      >
        <Plus className="h-3 w-3" />
        Add rule
      </button>
    </div>
  );
}

function RuleCard({
  gameState,
  onChange,
  levelId,
  spriteId,
  rule,
}: {
  gameState: GameState;
  onChange: (next: GameState) => void;
  levelId: string;
  spriteId: string;
  rule: BlockRule;
}) {
  return (
    <div className="rounded border border-border bg-card px-2 py-2 space-y-2">
      <div className="flex items-start gap-1">
        <div className="flex-1 space-y-1">
          <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            When
          </label>
          <select
            value={rule.trigger.kind}
            onChange={(e) =>
              onChange(
                updateRuleTrigger(
                  gameState,
                  levelId,
                  spriteId,
                  rule.id,
                  defaultTrigger(e.target.value as BlockTrigger["kind"]),
                ),
              )
            }
            className="h-7 w-full rounded border border-border bg-background px-1 text-xs"
          >
            {TRIGGER_OPTIONS.map((opt) => (
              <option key={opt.kind} value={opt.kind}>{opt.label}</option>
            ))}
          </select>
          <TriggerArgsForm
            trigger={rule.trigger}
            onChange={(next) =>
              onChange(updateRuleTrigger(gameState, levelId, spriteId, rule.id, next))
            }
          />
        </div>
        <button
          type="button"
          onClick={() => onChange(deleteRule(gameState, levelId, spriteId, rule.id))}
          className="rounded p-0.5 text-muted-foreground hover:text-rose-600"
          title="Delete rule"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-1.5">
        <label className="block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Do
        </label>
        {rule.actions.length === 0 && (
          <p className="text-[10px] text-muted-foreground">No actions yet.</p>
        )}
        {rule.actions.map((action, i) => (
          <ActionRow
            key={i}
            gameState={gameState}
            action={action}
            levels={gameState.levels}
            onChange={(next) =>
              onChange(updateAction(gameState, levelId, spriteId, rule.id, i, next))
            }
            onDelete={() =>
              onChange(deleteAction(gameState, levelId, spriteId, rule.id, i))
            }
          />
        ))}
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            const next = defaultAction(e.target.value as BlockAction["kind"]);
            onChange(addAction(gameState, levelId, spriteId, rule.id, next));
            e.target.selectedIndex = 0;
          }}
          className="h-6 w-full rounded border border-fuchsia-200 bg-fuchsia-50/40 px-1 text-[10px] uppercase tracking-widest text-fuchsia-700 hover:bg-fuchsia-50"
        >
          <option value="">+ Add action</option>
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.kind} value={opt.kind}>{opt.label}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function TriggerArgsForm({
  trigger,
  onChange,
}: {
  trigger: BlockTrigger;
  onChange: (next: BlockTrigger) => void;
}) {
  if (trigger.kind === "on-key-press") {
    return (
      <Field label="Key">
        <input
          value={trigger.key}
          onChange={(e) => onChange({ kind: "on-key-press", key: e.target.value })}
          className="h-7 w-20 rounded border border-border bg-background px-1.5 font-mono text-[11px]"
          placeholder="ArrowLeft"
        />
      </Field>
    );
  }
  if (trigger.kind === "every-seconds") {
    return (
      <Field label="Interval (s)">
        <NumberInput
          value={trigger.interval}
          onChange={(v) =>
            onChange({ kind: "every-seconds", interval: Math.max(0.1, v) })
          }
          min={0.1}
          step={0.5}
        />
      </Field>
    );
  }
  return null;
}

function ActionRow({
  gameState,
  action,
  levels,
  onChange,
  onDelete,
}: {
  gameState: GameState;
  action: BlockAction;
  levels: GameState["levels"];
  onChange: (next: BlockAction) => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded border border-border bg-muted/30 px-1.5 py-1">
      <div className="flex-1 space-y-1 text-[11px]">
        <ActionLabel kind={action.kind} />
        <ActionFields action={action} levels={levels} onChange={onChange} />
      </div>
      <button
        type="button"
        onClick={onDelete}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-rose-600"
        title="Delete action"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

function ActionLabel({ kind }: { kind: BlockAction["kind"] }) {
  const label = ACTION_OPTIONS.find((o) => o.kind === kind)?.label ?? kind;
  return <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</p>;
}

function ActionFields({
  action,
  levels,
  onChange,
}: {
  action: BlockAction;
  levels: GameState["levels"];
  onChange: (next: BlockAction) => void;
}) {
  switch (action.kind) {
    case "move-by":
      return (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Δx</span>
          <NumberInput value={action.dx} onChange={(v) => onChange({ ...action, dx: v })} step={1} />
          <span className="text-[10px] text-muted-foreground">Δy</span>
          <NumberInput value={action.dy} onChange={(v) => onChange({ ...action, dy: v })} step={1} />
        </div>
      );
    case "set-position":
      return (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">x</span>
          <NumberInput value={action.x} onChange={(v) => onChange({ ...action, x: v })} step={1} />
          <span className="text-[10px] text-muted-foreground">y</span>
          <NumberInput value={action.y} onChange={(v) => onChange({ ...action, y: v })} step={1} />
        </div>
      );
    case "set-property":
      return (
        <div className="flex items-center gap-1">
          <select
            value={action.property}
            onChange={(e) =>
              onChange({ ...action, property: e.target.value as "width" | "height" })
            }
            className="h-7 rounded border border-border bg-background px-1 text-xs"
          >
            <option value="width">width</option>
            <option value="height">height</option>
          </select>
          <NumberInput value={action.value} onChange={(v) => onChange({ ...action, value: Math.max(1, v) })} min={1} step={1} />
        </div>
      );
    case "goto-level":
      return (
        <select
          value={action.levelId}
          onChange={(e) => onChange({ ...action, levelId: e.target.value })}
          className="h-7 w-full rounded border border-border bg-background px-1 text-xs"
        >
          <option value="">(pick a level)</option>
          {levels.map((l) => (
            <option key={l.id} value={l.id}>{l.label}</option>
          ))}
        </select>
      );
    case "set-message":
      return (
        <input
          value={action.text}
          onChange={(e) => onChange({ ...action, text: e.target.value })}
          placeholder="Hello!"
          className="h-7 w-full rounded border border-border bg-background px-1.5 text-xs"
        />
      );
    case "show":
    case "hide":
      return null;
    case "play-sound":
    case "wait-seconds":
    default:
      return null;
  }
}
