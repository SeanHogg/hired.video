/**
 * Tests for the game runtime's physics solver (#1009) — `stepPhysics`
 * in `runtime-core.js`. Pins the integration contract + the
 * dynamic-vs-(static|kinematic) collision response so a future tweak
 * doesn't silently break platformers.
 */

import { describe, expect, it } from "vitest";
import { stepPhysics } from "../game/runtime";
import type { GameSprite, GamePhysicsSettings } from "@shared/game-state";

/** Helper — builds a RuntimeSprite literal for the solver to consume.
 *  The solver only reads x/y/width/height/vx/vy/source.physics so the
 *  full RuntimeSprite shape isn't needed in tests. */
function rs(
  partial: Partial<GameSprite> & { x: number; y: number; width: number; height: number },
  initial: { vx?: number; vy?: number; onGround?: boolean } = {},
) {
  const source: GameSprite = {
    id: partial.id ?? `sprite-${Math.random().toString(36).slice(2, 8)}`,
    assetId: partial.assetId ?? "asset-1",
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
    behavior: partial.behavior ?? null,
    ...(partial.physics ? { physics: partial.physics } : {}),
  } as GameSprite;
  return {
    source,
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
    vx: initial.vx ?? 0,
    vy: initial.vy ?? 0,
    flipped: false,
    picked: false,
    visible: true,
    alpha: 1,
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    mountTs: 0,
    message: null,
    messageUntilTs: 0,
    hasFiredOnMount: false,
    everySecondsLastFiredTs: {},
    onGround: initial.onGround ?? false,
  };
}

const DEFAULT_PHYSICS: GamePhysicsSettings = { gravity: 1000, friction: 0.1 };

describe("stepPhysics", () => {
  it("is a no-op when projectPhysics is undefined", () => {
    const dynamic = rs({ x: 100, y: 100, width: 32, height: 32, physics: { kind: "dynamic" } });
    stepPhysics([dynamic], undefined, 0.016);
    expect(dynamic.x).toBe(100);
    expect(dynamic.y).toBe(100);
    expect(dynamic.vy).toBe(0);
  });

  it("applies gravity to dynamic bodies", () => {
    const dynamic = rs({ x: 100, y: 100, width: 32, height: 32, physics: { kind: "dynamic" } });
    stepPhysics([dynamic], DEFAULT_PHYSICS, 0.1);
    // vy += gravity * dt = 0 + 1000 * 0.1 = 100
    expect(dynamic.vy).toBe(100);
    // y += vy * dt = 100 + 100 * 0.1 = 110
    expect(dynamic.y).toBeCloseTo(110, 5);
  });

  it("doesn't apply gravity to static or kinematic bodies", () => {
    const platform = rs({ x: 0, y: 500, width: 800, height: 20, physics: { kind: "static" } });
    const elevator = rs({ x: 100, y: 300, width: 60, height: 12, physics: { kind: "kinematic" } });
    stepPhysics([platform, elevator], DEFAULT_PHYSICS, 0.1);
    expect(platform.y).toBe(500);
    expect(platform.vy).toBe(0);
    expect(elevator.y).toBe(300);
    expect(elevator.vy).toBe(0);
  });

  it("dynamic body falls onto a static platform and stops", () => {
    // Dynamic body just above the platform; one big step lands it.
    const dynamic = rs({ x: 100, y: 480, width: 32, height: 32, physics: { kind: "dynamic" } });
    const platform = rs({ x: 0, y: 500, width: 800, height: 20, physics: { kind: "static" } });
    // Multiple steps to let gravity accumulate + the collision resolve.
    for (let i = 0; i < 30; i++) {
      stepPhysics([dynamic, platform], DEFAULT_PHYSICS, 0.05);
    }
    // The dynamic body sits ON TOP of the platform: y + height === platform.y.
    expect(dynamic.y + dynamic.height).toBeLessThanOrEqual(platform.y + 0.5);
    expect(dynamic.y + dynamic.height).toBeGreaterThanOrEqual(platform.y - 0.5);
    // onGround flag set so platformer-player jump gate works.
    expect(dynamic.onGround).toBe(true);
    // Resting — vertical velocity drained.
    expect(Math.abs(dynamic.vy)).toBeLessThan(1);
  });

  it("applies horizontal friction when resting on a surface", () => {
    const dynamic = rs(
      { x: 100, y: 468, width: 32, height: 32, physics: { kind: "dynamic" } },
      { vx: 100, vy: 50 },
    );
    const platform = rs({ x: 0, y: 500, width: 800, height: 20, physics: { kind: "static" } });
    // One step — body lands on platform; friction trims vx.
    stepPhysics([dynamic, platform], { gravity: 0, friction: 0.5 }, 0.1);
    // Friction = 0.5 → vx *= (1 - 0.5) = 50.
    expect(dynamic.vx).toBeCloseTo(50, 1);
  });

  it("bouncy body rebounds off a static platform", () => {
    const ball = rs(
      { x: 100, y: 480, width: 32, height: 32, physics: { kind: "dynamic", restitution: 0.8 } },
      { vy: 200 },
    );
    const platform = rs({ x: 0, y: 500, width: 800, height: 20, physics: { kind: "static" } });
    stepPhysics([ball, platform], { gravity: 0, friction: 0 }, 0.1);
    // After collision the ball is moving UP (negative vy) at 0.8× input speed.
    // Input vy at impact ~= 200 + gravity*dt = 200. Restitution mirror: vy = -200 * 0.8 = -160.
    expect(ball.vy).toBeLessThan(0);
    expect(Math.abs(ball.vy)).toBeGreaterThan(150);
  });

  it("horizontal collision pushes a dynamic body away from a wall", () => {
    // Player positioned just-penetrating the wall on the left so the
    // solver's center-comparison picks the correct push direction.
    // Deep-penetration cases (body passed the wall's centre in a
    // single step) are a known shortcoming of the simple AABB
    // resolution — logged on the gap register as a follow-on.
    const player = rs(
      { x: 130, y: 100, width: 32, height: 32, physics: { kind: "dynamic" } },
      { vx: 50 },
    );
    const wall = rs({ x: 150, y: 80, width: 20, height: 80, physics: { kind: "static" } });
    // Small step keeps the body's centre left of the wall's centre.
    stepPhysics([player, wall], { gravity: 0, friction: 0 }, 0.05);
    // Player's right edge sits at or before the wall's left edge.
    expect(player.x + player.width).toBeLessThanOrEqual(wall.x + 0.5);
    // vx reflected by restitution (default 0 = stopped dead). `Math.abs`
    // collapses the -0 vs 0 distinction (JS `Object.is(-0, 0)` is false
    // which would trip `toBe(0)`).
    expect(Math.abs(player.vx)).toBe(0);
  });

  it("ignores sprites without the physics field — kinematic-by-default", () => {
    const noPhysics = rs({ x: 100, y: 100, width: 32, height: 32 });
    stepPhysics([noPhysics], DEFAULT_PHYSICS, 0.1);
    // Sprite stays put — no `physics` opt-in means the solver doesn't
    // touch it (matches the "everything works the same when physics is
    // off" contract).
    expect(noPhysics.x).toBe(100);
    expect(noPhysics.y).toBe(100);
    expect(noPhysics.vy).toBe(0);
  });
});
