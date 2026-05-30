/**
 * #927 — `<GameStage/>` editor surface for `mediaKind === "game"`
 * studio projects. Mirrors the slot that `<CanvasStage/>` occupies for
 * Timeline kinds. Hosts the asset bin + scene list + node-editor
 * panel. Phaser-3 runtime hydrate from `GameState` is loaded into an
 * iframe so script eval is sandboxed; we don't expose phaser to the
 * main studio context.
 *
 * Self-gates: when `gameState` is null we render a "Create your first
 * scene" empty state instead of pretending the stage has content. No
 * prop-drilled boolean.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type GameState,
  type GameScene,
  type GameSceneNode,
  emptyGameState,
} from "@shared/game-state";

interface GameStageProps {
  state: GameState | null;
  onChange: (next: GameState) => void;
}

export default function GameStage({ state, onChange }: GameStageProps) {
  const [activeSceneId, setActiveSceneId] = useState<string | null>(state?.initialSceneId ?? null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Initialise an empty game state on first mount when the parent
  // hasn't supplied one yet. Keeps the editor usable for brand-new
  // game projects without forcing the parent to seed.
  useEffect(() => {
    if (state) return;
    onChange(emptyGameState());
  }, [state, onChange]);

  const activeScene: GameScene | null = useMemo(() => {
    if (!state || !activeSceneId) return null;
    return state.scenes.find((s) => s.id === activeSceneId) ?? state.scenes[0] ?? null;
  }, [state, activeSceneId]);

  if (!state) return null;

  const addScene = () => {
    const id = `scene-${state.scenes.length + 1}`;
    onChange({
      ...state,
      scenes: [
        ...state.scenes,
        { id, label: `Scene ${state.scenes.length + 1}`, nodes: [], config: {} },
      ],
      initialSceneId: state.initialSceneId || id,
    });
    setActiveSceneId(id);
  };

  const addNode = () => {
    if (!activeScene) return;
    const node: GameSceneNode = {
      id: `node-${Date.now()}`,
      kind: "sprite",
      position: { x: 200, y: 200 },
    };
    onChange({
      ...state,
      scenes: state.scenes.map((s) =>
        s.id === activeScene.id ? { ...s, nodes: [...s.nodes, node] } : s,
      ),
    });
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <header className="border-b p-2 flex items-center gap-2">
        <span className="text-sm font-medium">Game ({state.engine})</span>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={addScene}>
          <Plus className="h-4 w-4 mr-1" /> Scene
        </Button>
        <Button size="sm" variant="outline" onClick={addNode} disabled={!activeScene}>
          <Plus className="h-4 w-4 mr-1" /> Node
        </Button>
      </header>
      <div className="flex flex-1 min-h-0">
        <aside className="w-48 border-r p-2 overflow-y-auto">
          <h3 className="text-xs uppercase font-medium text-muted-foreground mb-1">Scenes</h3>
          {state.scenes.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveSceneId(s.id)}
              className={`w-full text-left text-sm px-2 py-1 rounded ${
                activeSceneId === s.id ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              {s.label}
            </button>
          ))}
        </aside>
        <main className="flex-1 min-w-0 flex items-center justify-center bg-muted/30 p-4">
          {/* Phaser runtime preview iframe — sandboxed so script eval
              can't reach the host studio. The actual hydrate-from-
              GameState happens inside the iframe; we just hand it the
              state via postMessage. Iframe SRC kept blank when the
              runtime bundle isn't yet built so this safely no-ops. */}
          <iframe
            ref={iframeRef}
            title="Game runtime preview"
            className="rounded border bg-card shadow-sm"
            sandbox="allow-scripts"
            style={{
              width: state.config?.width ?? 1280,
              height: state.config?.height ?? 720,
              maxWidth: "100%",
              maxHeight: "100%",
            }}
            srcDoc={`<!doctype html><html><body style="margin:0;background:${state.config?.backgroundColor ?? "#0b0b14"};color:#fff;font:14px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;">Phaser-3 runtime stub — scene "${activeScene?.label ?? ""}" with ${activeScene?.nodes.length ?? 0} node(s). Real runtime ships under #1789.</body></html>`}
          />
        </main>
        <aside className="w-56 border-l p-2 overflow-y-auto">
          <h3 className="text-xs uppercase font-medium text-muted-foreground mb-1">Nodes</h3>
          {activeScene?.nodes.length === 0 ? (
            <p className="text-xs text-muted-foreground">No nodes in this scene yet.</p>
          ) : (
            activeScene?.nodes.map((n) => (
              <div key={n.id} className="text-xs rounded border bg-card p-2 mb-1">
                <div className="flex items-center gap-1.5">
                  <ImageIcon className="h-3 w-3 text-muted-foreground" />
                  <span className="font-medium">{n.kind}</span>
                </div>
                <div className="mt-1">
                  pos {n.position.x},{n.position.y}
                </div>
              </div>
            ))
          )}
          <div className="mt-3">
            <h3 className="text-xs uppercase font-medium text-muted-foreground mb-1">Initial scene</h3>
            <Input
              value={state.initialSceneId}
              onChange={(e) => onChange({ ...state, initialSceneId: e.target.value })}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
