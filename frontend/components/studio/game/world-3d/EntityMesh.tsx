/**
 * EntityMesh — renders a single `World3DEntity` as the right Three.js
 * mesh + the right Rapier collider, picking both from the entity's
 * `kind`. The mapping is the SSoT for "what does each kind look like"
 * — adding a new kind is one entry in this file (the geometry +
 * collider) and one entry in `ENTITY_KIND_DEFAULTS`
 * (`world-3d-edit.ts`); no other file forks per kind.
 *
 * Selection chrome is handled here (a wireframe outline when
 * `selected` is true) so the host scene doesn't need to overlay a
 * separate gizmo per entity (DRY).
 */

import { useMemo } from "react";
import { CuboidCollider, RigidBody, BallCollider } from "@react-three/rapier";
import type { ThreeEvent } from "@react-three/fiber";
import type {
  World3DEntity,
  World3DEntityKind,
  World3DPhysicsKind,
} from "@shared/game-state";

/** Trigger event emitted by sensor-physics entities when the player
 *  overlaps them (gap #1635 challenge runtime). The shape is the union
 *  of fields any challenge handler needs — `kind` for "collect coin vs
 *  reach goal", `tag` for "challenge X targets coins tagged Y". */
export interface EntityTriggerEvent {
  entityId: string;
  kind: World3DEntityKind;
  tag: string | null;
}

interface EntityMeshProps {
  entity: World3DEntity;
  /** Edit mode shows selection chrome + makes the entity clickable.
   *  Play mode drops both (the player is playing, not authoring). */
  mode: "edit" | "play";
  selected: boolean;
  onSelect?: (id: string) => void;
  /** Fired when a sensor entity (collectible / goal / hazard) detects
   *  player overlap. Only emitted in play mode + when physics === "sensor".
   *  Scene3D consumes this and forwards to the host's ChallengeTracker. */
  onTrigger?: (event: EntityTriggerEvent) => void;
}

/** Map `World3DPhysicsKind` to Rapier's RigidBody type prop. `none` is
 *  handled by the caller (renders without a RigidBody wrapper). `sensor`
 *  maps to "fixed" — the sensor flag is set on the collider, not the
 *  body. */
function physicsToRapierType(p: World3DPhysicsKind): "fixed" | "dynamic" | "kinematicPosition" {
  switch (p) {
    case "static":
      return "fixed";
    case "dynamic":
      return "dynamic";
    case "kinematic":
      return "kinematicPosition";
    case "sensor":
    case "none":
      // Caller checks for "none" first; sensor bodies are "fixed" in
      // Rapier terms with a sensor-flagged collider.
      return "fixed";
  }
}

export default function EntityMesh({
  entity,
  mode,
  selected,
  onSelect,
  onTrigger,
}: EntityMeshProps) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (mode !== "edit" || !onSelect) return;
    // Stop the click bubbling to the ground placement handler — clicking
    // an entity selects it, it doesn't drop a new block underneath.
    e.stopPropagation();
    onSelect(entity.id);
  };

  // Decorative-only entities (light / no-collider) render the mesh
  // without a RigidBody wrapper; they don't participate in physics.
  if (entity.physics === "none") {
    return (
      <group
        position={entity.position}
        rotation={entity.rotation}
        scale={entity.scale}
      >
        <KindMesh
          kind={entity.kind}
          color={entity.color}
          selected={selected}
          onClick={handleClick}
        />
      </group>
    );
  }

  const isSensor = entity.physics === "sensor";

  return (
    <RigidBody
      type={physicsToRapierType(entity.physics)}
      position={entity.position}
      rotation={entity.rotation}
      colliders={false}
      sensor={isSensor}
      // Only sensor bodies fire trigger events. The handler is wired
      // unconditionally — non-sensor entities don't intersect-overlap
      // anyone, so Rapier never calls it. The mode === "play" gate
      // exists upstream (Scene3D drops onTrigger in edit mode).
      onIntersectionEnter={
        isSensor && onTrigger
          ? () =>
              onTrigger({
                entityId: entity.id,
                kind: entity.kind,
                tag: entity.tag ?? null,
              })
          : undefined
      }
    >
      <KindCollider kind={entity.kind} scale={entity.scale} sensor={isSensor} />
      <group scale={entity.scale}>
        <KindMesh
          kind={entity.kind}
          color={entity.color}
          selected={selected}
          onClick={handleClick}
        />
      </group>
    </RigidBody>
  );
}

// ─── Per-kind mesh ────────────────────────────────────────────────────────

interface KindMeshProps {
  kind: World3DEntityKind;
  color: string;
  selected: boolean;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}

function KindMesh({ kind, color, selected, onClick }: KindMeshProps) {
  const material = (
    <meshStandardMaterial
      color={color}
      // Slight emissive on selection so the chrome reads even when the
      // entity is in shadow; cleared when not selected so colors stay
      // accurate during normal authoring.
      emissive={selected ? "#3b82f6" : "#000000"}
      emissiveIntensity={selected ? 0.4 : 0}
    />
  );

  switch (kind) {
    case "block":
    case "platform":
    case "hazard":
      return (
        <mesh onClick={onClick} castShadow receiveShadow>
          <boxGeometry args={[1, 1, 1]} />
          {material}
        </mesh>
      );
    case "ramp":
      // Right-triangular prism: a box geometry with one face slanted
      // via vertex displacement isn't worth the cost — use a fallback
      // "slope" approximation by rotating a half-thickness box. Good
      // enough for the Phase-1 designer; a proper ramp mesh lands when
      // the geometry library lands (gap #1639).
      return (
        <mesh onClick={onClick} castShadow receiveShadow rotation={[0, 0, -Math.PI / 6]}>
          <boxGeometry args={[1, 0.2, 1]} />
          {material}
        </mesh>
      );
    case "sphere":
    case "collectible":
      return (
        <mesh onClick={onClick} castShadow receiveShadow>
          <sphereGeometry args={[0.5, 24, 18]} />
          {material}
        </mesh>
      );
    case "goal":
      // Goal renders as a translucent box so the player can tell it's
      // a trigger, not a wall. Physics is "none" so it never collides.
      return (
        <mesh onClick={onClick}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.4}
            emissive={selected ? "#3b82f6" : color}
            emissiveIntensity={selected ? 0.5 : 0.2}
          />
        </mesh>
      );
    case "light":
      return (
        <group>
          <pointLight color={color} intensity={1.5} distance={20} castShadow />
          {/* Visible marker so the author can see + click the light */}
          <mesh onClick={onClick}>
            <sphereGeometry args={[0.3, 12, 8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1} />
          </mesh>
        </group>
      );
  }
}

// ─── Per-kind collider ────────────────────────────────────────────────────

interface KindColliderProps {
  kind: World3DEntityKind;
  scale: [number, number, number];
  /** Sensor flag — set on triggers so Rapier raises intersection
   *  events instead of physical contacts. Forwarded to the underlying
   *  collider; the parent RigidBody passes the same flag in parallel. */
  sensor?: boolean;
}

/** Rapier collider sized to match the entity's authored scale. The
 *  mesh inside the RigidBody is also scale-wrapped so the visuals + the
 *  collider stay locked — change one place, both update. */
function KindCollider({ kind, scale, sensor = false }: KindColliderProps) {
  // Cuboid expects half-extents; mesh box geometry is unit-cube so the
  // half-extent is half the scale on each axis.
  const halfExtents = useMemo<[number, number, number]>(
    () => [scale[0] / 2, scale[1] / 2, scale[2] / 2],
    [scale],
  );
  const sphereRadius = useMemo(
    () => Math.max(scale[0], scale[1], scale[2]) / 2,
    [scale],
  );

  switch (kind) {
    case "sphere":
    case "collectible":
      return <BallCollider args={[sphereRadius]} sensor={sensor} />;
    case "block":
    case "platform":
    case "ramp":
    case "hazard":
    case "goal":
    case "light":
      return <CuboidCollider args={halfExtents} sensor={sensor} />;
  }
}
