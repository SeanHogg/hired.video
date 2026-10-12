/**
 * Game AABB physics solver (#1024).
 *
 * Drop-in replacement for `stepPhysics` in
 * `frontend/lib/studio/game/runtime-core.js`:
 *   - gravity integration on dynamic bodies (#1009)
 *   - dynamic vs static / kinematic AABB response (#1009)
 *   - dynamic vs dynamic with mass-weighted momentum exchange
 *   - velocity-sign resolution so deep-penetration cases push back
 *     along the entry path instead of the AABB-centre heuristic
 *   - substepping when a body's displacement this frame exceeds its
 *     smallest axis (stops tunneling through thin walls)
 *
 * Host wiring: `runtime-core.js` still owns the play loop. When that
 * file is in scope, replace its `stepPhysics` body with this export
 * (same signature). Tests in `__tests__/physics.test.ts` pin the
 * contract so a later one-line swap cannot silently regress.
 */

import type { GamePhysicsSettings, GameSpritePhysics } from "@shared/game-state";

const REST_THRESHOLD = 0.5;
const MAX_SUBSTEPS = 8;

export interface PhysicsBody {
  source: { physics?: GameSpritePhysics };
  x: number;
  y: number;
  width: number;
  height: number;
  vx?: number;
  vy?: number;
  /** Set when this dynamic body landed on a surface this tick. */
  onGround?: boolean;
}

export function stepPhysics(
  sprites: PhysicsBody[],
  projectPhysics: GamePhysicsSettings | undefined,
  dt: number,
): void {
  if (!projectPhysics) return;
  const gravity = typeof projectPhysics.gravity === "number" ? projectPhysics.gravity : 0;
  const friction = typeof projectPhysics.friction === "number" ? projectPhysics.friction : 0.1;

  const steps = substepCount(sprites, dt);
  const subDt = dt / steps;

  for (let step = 0; step < steps; step++) {
    integrate(sprites, gravity, subDt);
    // Floors first so a crate that just landed can act as a support
    // for the pair pass. A second immovable pass then undoes any
    // pair-induced overlap with walls / platforms.
    resolveDynamicVsImmovable(sprites, friction);
    resolveDynamicPairs(sprites, friction);
    resolveDynamicVsImmovable(sprites, friction);
  }
}

function substepCount(sprites: PhysicsBody[], dt: number): number {
  let n = 1;
  for (const s of sprites) {
    if (s.source.physics?.kind !== "dynamic") continue;
    const speed = Math.max(Math.abs(s.vx ?? 0), Math.abs(s.vy ?? 0));
    const size = Math.min(s.width, s.height);
    if (size > 0 && speed * dt > size) {
      n = Math.max(n, Math.ceil((speed * dt) / size));
    }
  }
  return Math.min(n, MAX_SUBSTEPS);
}

function integrate(sprites: PhysicsBody[], gravity: number, dt: number): void {
  for (const s of sprites) {
    const p = s.source.physics;
    if (!p || p.kind !== "dynamic") continue;
    if (typeof s.vx !== "number") s.vx = 0;
    if (typeof s.vy !== "number") s.vy = 0;
    if (gravity !== 0) s.vy += gravity * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.onGround = false;
  }
}

function overlapX(a: PhysicsBody, b: PhysicsBody): number {
  return Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
}

function overlapY(a: PhysicsBody, b: PhysicsBody): number {
  return Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
}

function bodyMass(p: GameSpritePhysics | undefined): number {
  const m = p?.mass;
  return typeof m === "number" && m > 0 ? m : 1;
}

function bodyRestitution(p: GameSpritePhysics | undefined): number {
  const r = p?.restitution;
  return typeof r === "number" ? r : 0;
}

function resolveDynamicVsImmovable(sprites: PhysicsBody[], friction: number): void {
  for (let i = 0; i < sprites.length; i++) {
    const a = sprites[i];
    const pa = a.source.physics;
    if (!pa || pa.kind !== "dynamic") continue;
    for (let j = 0; j < sprites.length; j++) {
      if (i === j) continue;
      const b = sprites[j];
      const pb = b.source.physics;
      if (!pb || pb.kind === "dynamic") continue;
      separateFromImmovable(a, b, friction);
    }
  }
}

function separateFromImmovable(a: PhysicsBody, b: PhysicsBody, friction: number): void {
  const ox = overlapX(a, b);
  const oy = overlapY(a, b);
  if (ox <= 0 || oy <= 0) return;

  const restitution = bodyRestitution(a.source.physics);
  const vx = a.vx ?? 0;
  const vy = a.vy ?? 0;

  if (ox < oy) {
    const fromLeft = vx !== 0 ? vx > 0 : a.x + a.width / 2 < b.x + b.width / 2;
    a.x = fromLeft ? b.x - a.width : b.x + b.width;
    a.vx = -vx * restitution || 0;
  } else {
    const fromAbove = vy !== 0 ? vy > 0 : a.y + a.height / 2 < b.y + b.height / 2;
    if (fromAbove) {
      a.y = b.y - a.height;
      a.onGround = true;
      a.vx = (a.vx ?? 0) * (1 - friction);
      a.vy = vy > 0 ? -vy * restitution : vy;
      if (Math.abs(a.vy ?? 0) < REST_THRESHOLD) a.vy = 0;
    } else {
      a.y = b.y + b.height;
      a.vy = -vy * restitution || 0;
    }
  }
}

function resolveDynamicPairs(sprites: PhysicsBody[], friction: number): void {
  for (let i = 0; i < sprites.length; i++) {
    const a = sprites[i];
    const pa = a.source.physics;
    if (!pa || pa.kind !== "dynamic") continue;
    for (let j = i + 1; j < sprites.length; j++) {
      const b = sprites[j];
      const pb = b.source.physics;
      if (!pb || pb.kind !== "dynamic") continue;
      // A body that already landed this tick is a support, not a
      // free mass — otherwise stacked crates push each other through
      // the floor. Airborne pairs still exchange momentum by mass.
      if (b.onGround && !a.onGround) {
        separateFromImmovable(a, b, friction);
      } else if (a.onGround && !b.onGround) {
        separateFromImmovable(b, a, friction);
      } else {
        separateDynamicPair(a, b, friction);
      }
    }
  }
}

function separateDynamicPair(a: PhysicsBody, b: PhysicsBody, friction: number): void {
  const ox = overlapX(a, b);
  const oy = overlapY(a, b);
  if (ox <= 0 || oy <= 0) return;

  const pa = a.source.physics;
  const pb = b.source.physics;
  const massA = bodyMass(pa);
  const massB = bodyMass(pb);
  const invA = 1 / massA;
  const invB = 1 / massB;
  const invSum = invA + invB;
  const rest = Math.max(bodyRestitution(pa), bodyRestitution(pb));

  const vxA = a.vx ?? 0;
  const vyA = a.vy ?? 0;
  const vxB = b.vx ?? 0;
  const vyB = b.vy ?? 0;
  const relVx = vxA - vxB;
  const relVy = vyA - vyB;

  if (ox < oy) {
    const fromLeft = relVx !== 0 ? relVx > 0 : a.x + a.width / 2 < b.x + b.width / 2;
    const gap = fromLeft ? a.x + a.width - b.x : b.x + b.width - a.x;
    if (fromLeft) {
      a.x -= gap * (invA / invSum);
      b.x += gap * (invB / invSum);
    } else {
      a.x += gap * (invA / invSum);
      b.x -= gap * (invB / invSum);
    }
    if ((fromLeft && relVx > 0) || (!fromLeft && relVx < 0)) {
      const j = (-(1 + rest) * relVx) / invSum;
      a.vx = vxA + j * invA;
      b.vx = vxB - j * invB;
    }
  } else {
    const fromAbove = relVy !== 0 ? relVy > 0 : a.y + a.height / 2 < b.y + b.height / 2;
    const gap = fromAbove ? a.y + a.height - b.y : b.y + b.height - a.y;
    if (fromAbove) {
      a.y -= gap * (invA / invSum);
      b.y += gap * (invB / invSum);
      a.onGround = true;
      a.vx = (a.vx ?? 0) * (1 - friction);
    } else {
      a.y += gap * (invA / invSum);
      b.y -= gap * (invB / invSum);
      b.onGround = true;
      b.vx = (b.vx ?? 0) * (1 - friction);
    }
    if ((fromAbove && relVy > 0) || (!fromAbove && relVy < 0)) {
      const j = (-(1 + rest) * relVy) / invSum;
      a.vy = vyA + j * invA;
      b.vy = vyB - j * invB;
    }
  }
}
