/**
 * PlayerController — Rapier-driven first-person character for play mode.
 *
 * Behavior model: a capsule-collidered dynamic RigidBody with rotations
 * locked (so the player can't tip over), driven by setting linear
 * velocity each frame from WASD input + a one-shot upward impulse on
 * jump. Camera tracks the body and is steered by `<PointerLockControls>`.
 *
 * Why not Rapier's `KinematicCharacterController`? The kinematic
 * controller is more robust on slopes / steps, but adds a substantial
 * setup cost (manual collide-and-slide each frame, separate world API
 * use, no @react-three/rapier wrapper). For the Phase-1 designer-MVP
 * the dynamic-body approach reads correctly on flat ground + simple
 * blocks. Upgrading to the kinematic controller is tracked in the gap
 * register (Phase-3 multiplayer work needs deterministic motion
 * anyway).
 */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CapsuleCollider, RigidBody, useRapier } from "@react-three/rapier";
import type { RapierRigidBody } from "@react-three/rapier";
import { PointerLockControls } from "@react-three/drei";
import { Vector3, type PerspectiveCamera as ThreePerspectiveCamera } from "three";
import type { World3DTransform } from "@shared/game-state";

const WALK_SPEED = 6; // m/s — slightly slower than a real-world run
const JUMP_IMPULSE = 6; // m/s upward velocity on jump
const GROUND_CHECK_DISTANCE = 0.15; // raycast distance below the capsule

interface PlayerControllerProps {
  spawn: World3DTransform;
  /** Reset signal — incrementing this value teleports the player back
   *  to spawn. Used by the host's "respawn" button + the hazard handler
   *  (Phase 2) without forcing the controller to re-mount. */
  respawnNonce?: number;
  /** Per-frame position broadcaster (gap #1636 multiplayer). When
   *  passed, the controller pushes its position + rotation to the
   *  multiplayer room each tick — `useGameRoom` throttles internally
   *  so this is safe to call at 60 Hz. No-op when omitted (single-
   *  player). */
  onBroadcastPosition?: (
    position: [number, number, number],
    rotation: [number, number, number],
  ) => void;
}

export default function PlayerController({
  spawn,
  respawnNonce = 0,
  onBroadcastPosition,
}: PlayerControllerProps) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const camera = useThree((s) => s.camera) as ThreePerspectiveCamera;
  const keysRef = useRef<Set<string>>(new Set());
  const groundedRef = useRef(false);
  const { rapier, world } = useRapier();

  // ─── Keyboard ─────────────────────────────────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      keysRef.current.add(e.code);
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ─── Respawn ──────────────────────────────────────────────────────────
  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    body.setTranslation(
      { x: spawn.position[0], y: spawn.position[1], z: spawn.position[2] },
      true,
    );
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  }, [spawn.position, respawnNonce]);

  // ─── Per-frame movement ───────────────────────────────────────────────
  useFrame(() => {
    const body = bodyRef.current;
    if (!body) return;

    // Ground check — short ray straight down from the capsule's base.
    // Used to gate jump (no air jumps in Phase 1).
    const translation = body.translation();
    const rayOrigin = {
      x: translation.x,
      y: translation.y - 0.9,
      z: translation.z,
    };
    const ray = new rapier.Ray(rayOrigin, { x: 0, y: -1, z: 0 });
    const hit = world.castRay(
      ray,
      GROUND_CHECK_DISTANCE,
      true,
      undefined,
      undefined,
      // Exclude the player's own collider from the ray hit list.
      undefined,
      body,
    );
    groundedRef.current = hit != null;

    // Derive desired horizontal velocity from WASD + camera facing.
    const keys = keysRef.current;
    const forward = keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0;
    const back = keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0;
    const left = keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0;
    const right = keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0;

    const inputZ = back - forward; // forward = -Z in three.js camera space
    const inputX = right - left;

    // Camera forward / right (projected onto XZ plane) — so movement
    // is camera-relative (W always walks the way you're looking).
    const camForward = new Vector3();
    camera.getWorldDirection(camForward);
    camForward.y = 0;
    camForward.normalize();
    const camRight = new Vector3(camForward.z, 0, -camForward.x);

    const velocity = new Vector3();
    velocity.addScaledVector(camForward, -inputZ);
    velocity.addScaledVector(camRight, inputX);
    if (velocity.lengthSq() > 0) {
      velocity.normalize().multiplyScalar(WALK_SPEED);
    }

    // Preserve current vertical velocity (gravity / jump) — only the
    // horizontal components are driven by input.
    const currentVel = body.linvel();
    body.setLinvel(
      { x: velocity.x, y: currentVel.y, z: velocity.z },
      true,
    );

    // Jump — only when grounded; sets vertical velocity directly so a
    // held Space doesn't compound impulses across frames.
    if (groundedRef.current && (keys.has("Space") || keys.has("KeyJ"))) {
      body.setLinvel({ x: velocity.x, y: JUMP_IMPULSE, z: velocity.z }, true);
    }

    // Camera follows the capsule's "head" (top of the capsule).
    camera.position.set(translation.x, translation.y + 0.7, translation.z);

    // Broadcast this frame's position to the multiplayer room.
    // useGameRoom throttles internally — safe to call every frame.
    if (onBroadcastPosition) {
      onBroadcastPosition(
        [translation.x, translation.y, translation.z],
        [camera.rotation.x, camera.rotation.y, camera.rotation.z],
      );
    }
  });

  return (
    <>
      <RigidBody
        ref={bodyRef}
        type="dynamic"
        position={spawn.position}
        colliders={false}
        enabledRotations={[false, false, false]}
        ccd
        canSleep={false}
      >
        {/* Capsule — half-height 0.6, radius 0.4 → total height 2.0 */}
        <CapsuleCollider args={[0.6, 0.4]} />
      </RigidBody>
      {/* PointerLockControls — clicking the canvas locks the mouse +
          drives camera rotation. drei wires the lock + escape lifecycle
          so the host doesn't need a listener. */}
      <PointerLockControls />
    </>
  );
}
