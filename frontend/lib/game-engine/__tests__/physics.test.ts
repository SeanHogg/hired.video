/**
 * Tests for the game-engine AABB solver (#1024) — `stepPhysics`.
 *
 * Pins the #1009 dynamic-vs-(static|kinematic) contract plus the
 * #1024 additions: mass-weighted dynamic-vs-dynamic, velocity-sign
 * deep-penetration resolution, and displacement substepping.
 *
 * Run: npx vitest run lib/game-engine/__tests__/physics.test.ts
 */

import { describe, expect, it } from "vitest";
import { stepPhysics, type PhysicsBody } from "../physics";
import type { GameSpritePhysics, GamePhysicsSettings } from "@shared/game-state";

function rs(
  partial: {
    x: number;
    y: number;
    width: number;
    height: number;
    physics?: GameSpritePhysics;
  },
  initial: { vx?: number; vy?: number; onGround?: boolean } = {},
): PhysicsBody {
  return {
    source: { physics: partial.physics },
    x: partial.x,
    y: partial.y,
    width: partial.width,
    height: partial.height,
    vx: initial.vx ?? 0,
    vy: initial.vy ?? 0,
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
    expect(dynamic.vy).toBe(100);
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
    const dynamic = rs({ x: 100, y: 480, width: 32, height: 32, physics: { kind: "dynamic" } });
    const platform = rs({ x: 0, y: 500, width: 800, height: 20, physics: { kind: "static" } });
    for (let i = 0; i < 30; i++) {
      stepPhysics([dynamic, platform], DEFAULT_PHYSICS, 0.05);
    }
    expect(dynamic.y + dynamic.height).toBeLessThanOrEqual(platform.y + 0.5);
    expect(dynamic.y + dynamic.height).toBeGreaterThanOrEqual(platform.y - 0.5);
    expect(dynamic.onGround).toBe(true);
    expect(Math.abs(dynamic.vy ?? 0)).toBeLessThan(1);
  });

  it("applies horizontal friction when resting on a surface", () => {
    const dynamic = rs(
      { x: 100, y: 468, width: 32, height: 32, physics: { kind: "dynamic" } },
      { vx: 100, vy: 50 },
    );
    const platform = rs({ x: 0, y: 500, width: 800, height: 20, physics: { kind: "static" } });
    stepPhysics([dynamic, platform], { gravity: 0, friction: 0.5 }, 0.1);
    expect(dynamic.vx).toBeCloseTo(50, 1);
  });

  it("bouncy body rebounds off a static platform", () => {
    const ball = rs(
      { x: 100, y: 480, width: 32, height: 32, physics: { kind: "dynamic", restitution: 0.8 } },
      { vy: 200 },
    );
    const platform = rs({ x: 0, y: 500, width: 800, height: 20, physics: { kind: "static" } });
    stepPhysics([ball, platform], { gravity: 0, friction: 0 }, 0.1);
    expect(ball.vy).toBeLessThan(0);
    expect(Math.abs(ball.vy ?? 0)).toBeGreaterThan(150);
  });

  it("horizontal collision pushes a dynamic body away from a wall", () => {
    const player = rs(
      { x: 130, y: 100, width: 32, height: 32, physics: { kind: "dynamic" } },
      { vx: 50 },
    );
    const wall = rs({ x: 150, y: 80, width: 20, height: 80, physics: { kind: "static" } });
    stepPhysics([player, wall], { gravity: 0, friction: 0 }, 0.05);
    expect(player.x + player.width).toBeLessThanOrEqual(wall.x + 0.5);
    expect(Math.abs(player.vx ?? 0)).toBe(0);
  });

  it("ignores sprites without the physics field — kinematic-by-default", () => {
    const noPhysics = rs({ x: 100, y: 100, width: 32, height: 32 });
    stepPhysics([noPhysics], DEFAULT_PHYSICS, 0.1);
    expect(noPhysics.x).toBe(100);
    expect(noPhysics.y).toBe(100);
    expect(noPhysics.vy).toBe(0);
  });
});

describe("stepPhysics dynamic-vs-dynamic (#1024)", () => {
  it("two equal-mass boxes colliding head-on stop (restitution 0)", () => {
    const a = rs(
      { x: 100, y: 100, width: 32, height: 32, physics: { kind: "dynamic", mass: 1 } },
      { vx: 100 },
    );
    const b = rs(
      { x: 140, y: 100, width: 32, height: 32, physics: { kind: "dynamic", mass: 1 } },
      { vx: -100 },
    );
    stepPhysics([a, b], { gravity: 0, friction: 0 }, 0.1);
    expect(a.x + a.width).toBeLessThanOrEqual(b.x + 0.5);
    expect(Math.abs(a.vx ?? 0)).toBeLessThan(1e-6);
    expect(Math.abs(b.vx ?? 0)).toBeLessThan(1e-6);
  });

  it("equal-mass elastic collision exchanges velocities", () => {
    const a = rs(
      { x: 100, y: 100, width: 32, height: 32, physics: { kind: "dynamic", mass: 1, restitution: 1 } },
      { vx: 80 },
    );
    const b = rs(
      { x: 140, y: 100, width: 32, height: 32, physics: { kind: "dynamic", mass: 1, restitution: 1 } },
      { vx: -80 },
    );
    stepPhysics([a, b], { gravity: 0, friction: 0 }, 0.1);
    expect(a.vx).toBeCloseTo(-80, 5);
    expect(b.vx).toBeCloseTo(80, 5);
  });

  it("heavier crate keeps most of its speed and pushes the lighter body", () => {
    const crate = rs(
      { x: 100, y: 100, width: 32, height: 32, physics: { kind: "dynamic", mass: 10 } },
      { vx: 50 },
    );
    const sprite = rs(
      { x: 136, y: 100, width: 32, height: 32, physics: { kind: "dynamic", mass: 1 } },
      { vx: 0 },
    );
    stepPhysics([crate, sprite], { gravity: 0, friction: 0 }, 0.1);
    expect(crate.vx ?? 0).toBeGreaterThan(40);
    expect(sprite.vx ?? 0).toBeGreaterThan(40);
    expect(crate.x + crate.width).toBeLessThanOrEqual(sprite.x + 0.5);
  });

  it("stacked dynamic boxes rest on each other instead of passing through", () => {
    const top = rs({ x: 100, y: 436, width: 32, height: 32, physics: { kind: "dynamic" } });
    const bottom = rs({ x: 100, y: 468, width: 32, height: 32, physics: { kind: "dynamic" } });
    const platform = rs({ x: 0, y: 500, width: 800, height: 20, physics: { kind: "static" } });
    for (let i = 0; i < 40; i++) {
      stepPhysics([top, bottom, platform], DEFAULT_PHYSICS, 0.05);
    }
    expect(bottom.y + bottom.height).toBeLessThanOrEqual(platform.y + 0.5);
    expect(bottom.y + bottom.height).toBeGreaterThanOrEqual(platform.y - 1);
    expect(top.y + top.height).toBeLessThanOrEqual(bottom.y + 1);
    expect(top.y + top.height).toBeGreaterThanOrEqual(bottom.y - 1);
    expect(top.y).toBeLessThan(bottom.y);
    expect(top.onGround).toBe(true);
    expect(bottom.onGround).toBe(true);
  });

  it("deep-penetration against a wall pushes back along the entry path", () => {
    // Centre is already past the wall's centre; the old AABB-centre
    // heuristic would push further right. Velocity sign (vx > 0) must
    // push left so the body exits the way it entered.
    const player = rs(
      { x: 155, y: 100, width: 32, height: 32, physics: { kind: "dynamic" } },
      { vx: 80 },
    );
    const wall = rs({ x: 150, y: 80, width: 20, height: 80, physics: { kind: "static" } });
    stepPhysics([player, wall], { gravity: 0, friction: 0 }, 0.05);
    expect(player.x + player.width).toBeLessThanOrEqual(wall.x + 0.5);
    expect(player.x).toBeLessThan(wall.x);
  });

  it("substeps so a fast body does not tunnel through a thin wall", () => {
    const player = rs(
      { x: 100, y: 100, width: 32, height: 32, physics: { kind: "dynamic" } },
      { vx: 1000 },
    );
    const wall = rs({ x: 150, y: 80, width: 20, height: 80, physics: { kind: "static" } });
    stepPhysics([player, wall], { gravity: 0, friction: 0 }, 0.1);
    expect(player.x + player.width).toBeLessThanOrEqual(wall.x + 0.5);
    expect(player.x).toBeLessThan(wall.x);
  });
});
