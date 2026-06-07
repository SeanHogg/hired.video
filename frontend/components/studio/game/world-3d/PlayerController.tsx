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
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody } from "@react-three/rapier";
import { PointerLockControls } from "@react-three/drei";
import { Group, Raycaster, Vector2, Vector3, type Object3D, type PerspectiveCamera as ThreePerspectiveCamera } from "three";
import type { World3DTransform } from "@shared/game-state";
import { AvatarFigure } from "./PlayerAvatar";

const WALK_SPEED = 6; // m/s — slightly slower than a real-world run
const JUMP_IMPULSE = 6; // m/s upward velocity on jump
const GROUND_CHECK_DISTANCE = 0.15; // raycast distance below the capsule
const EYE_HEIGHT = 0.7; // camera/head offset above the capsule center
// Third-person rig — the camera orbits this far behind the player's
// head along the look direction, raised slightly so the avatar sits in
// the lower-center of frame (the over-the-shoulder Roblox default).
const THIRD_PERSON_DISTANCE = 5;
const THIRD_PERSON_HEIGHT = 1.2;
const CAMERA_WALL_PADDING = 0.4; // keep the camera off walls it backs into

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
  /** Hit callback for the Roblox-style click-to-shoot hitscan
   *  (gap #1661). Called when the player left-clicks while pointer-
   *  locked and the camera-forward raycast lands on an entity. Host
   *  is responsible for actually destroying the entity (so play
   *  sessions can be replayed without permanently mutating the
   *  authored gameState). */
  onShootHit?: (entityId: string) => void;
  /** Camera framing for play mode. `"first"` keeps the camera at the
   *  player's eyes (the body is hidden); `"third"` orbits the camera
   *  behind a visible avatar. The host owns the toggle so the choice
   *  survives respawns without re-mounting the controller. */
  cameraView?: "first" | "third";
  /** Avatar body color — only used in third-person. Derived from the
   *  player's id by the host so it matches the player's remote-peer
   *  capsule (one color per player everywhere). */
  playerColor?: string;
}

export default function PlayerController({
  spawn,
  respawnNonce = 0,
  onBroadcastPosition,
  onShootHit,
  cameraView = "first",
  playerColor = "#38bdf8",
}: PlayerControllerProps) {
  const bodyRef = useRef<RapierRigidBody | null>(null);
  const avatarRef = useRef<Group | null>(null);
  const camera = useThree((s) => s.camera) as ThreePerspectiveCamera;
  const scene = useThree((s) => s.scene);
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

  // ─── Shoot (Roblox-style, gap #1661) ─────────────────────────────────
  // Left-click while pointer-locked = hitscan from camera center.
  // Walks the raycast hits, picks the first ancestor carrying
  // `userData.entityId` (every EntityMesh group tags its own id), and
  // hands the id up to the host. The host owns the runtime "destroyed"
  // set — keeps play sessions from permanently mutating the authored
  // gameState (a new playtest starts fresh).
  useEffect(() => {
    if (!onShootHit) return;
    const raycaster = new Raycaster();
    const centerNdc = new Vector2(0, 0);
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // Only fire while the pointer is locked to the canvas — keeps
      // accidental edit-mode clicks out of the play loop.
      if (!document.pointerLockElement) return;
      raycaster.setFromCamera(centerNdc, camera);
      const hits = raycaster.intersectObjects(scene.children, true);
      for (const hit of hits) {
        const entityId = findEntityId(hit.object);
        if (entityId) {
          onShootHit(entityId);
          return;
        }
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [camera, scene, onShootHit]);

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

    // ─── Camera framing ──────────────────────────────────────────────
    // The head is the pivot for both views. `camForward` is the look
    // direction PointerLockControls writes into the camera rotation;
    // first-person sits the camera AT the head, third-person pulls it
    // back ALONG that direction so the avatar stays centered in frame.
    const headX = translation.x;
    const headY = translation.y + EYE_HEIGHT;
    const headZ = translation.z;

    if (cameraView === "third") {
      // Use the FULL look direction (with pitch) so looking up/down
      // orbits the camera vertically — `camForward` above was flattened
      // for movement and would pin the camera to a fixed height.
      const lookDir = new Vector3();
      camera.getWorldDirection(lookDir);

      // Desired camera = behind the head along the look direction,
      // raised a little. Cast a ray from the head toward that point so
      // the camera doesn't punch through a wall behind the player —
      // clamp the pull-back distance to the nearest obstruction.
      let dist = THIRD_PERSON_DISTANCE;
      const backRay = new rapier.Ray(
        { x: headX, y: headY, z: headZ },
        { x: -lookDir.x, y: -lookDir.y, z: -lookDir.z },
      );
      const wallHit = world.castRay(
        backRay,
        THIRD_PERSON_DISTANCE,
        true,
        undefined,
        undefined,
        undefined,
        body, // ignore the player's own collider
      );
      if (wallHit) {
        dist = Math.max(0.5, wallHit.timeOfImpact - CAMERA_WALL_PADDING);
      }
      camera.position.set(
        headX - lookDir.x * dist,
        headY + THIRD_PERSON_HEIGHT - lookDir.y * dist,
        headZ - lookDir.z * dist,
      );

      // Face the avatar along the camera's heading (yaw only) so it
      // turns with the look direction. Object forward is -Z, hence the
      // negated atan2 args.
      const avatar = avatarRef.current;
      if (avatar) {
        avatar.position.set(translation.x, translation.y, translation.z);
        avatar.rotation.set(0, Math.atan2(-camForward.x, -camForward.z), 0);
      }
    } else {
      // First-person — camera at the head, body hidden.
      camera.position.set(headX, headY, headZ);
    }

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
      {/* Local avatar — only shown in third-person (you'd see the
          inside of your own head in first-person). Positioned +
          oriented from the Rapier body each frame in `useFrame`; it's
          NOT a child of the RigidBody so it can yaw to the look
          direction independently of the rotation-locked body. Same
          blocky figure remote peers render (DRY). */}
      <group ref={avatarRef} visible={cameraView === "third"}>
        <AvatarFigure color={playerColor} />
      </group>
      {/* PointerLockControls — clicking the canvas locks the mouse +
          drives camera rotation. drei wires the lock + escape lifecycle
          so the host doesn't need a listener. */}
      <PointerLockControls />
    </>
  );
}

/** Walk a raycast-hit Object3D's ancestor chain looking for an entity
 *  id tag. Every EntityMesh tags its outermost group with
 *  `userData.entityId`; this helper finds it regardless of which mesh
 *  inside the entity actually got hit. */
function findEntityId(obj: Object3D | null): string | null {
  let cur: Object3D | null = obj;
  while (cur) {
    const id = (cur.userData as { entityId?: string } | undefined)?.entityId;
    if (typeof id === "string" && id.length > 0) return id;
    cur = cur.parent;
  }
  return null;
}
