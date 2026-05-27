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

interface EntityMeshProps {
  entity: World3DEntity;
  /** Edit mode shows selection chrome + makes the entity clickable.
   *  Play mode drops both (the player is playing, not authoring). */
  mode: "edit" | "play";
  selected: boolean;
  onSelect?: (id: string) => void;
}

/** Map `World3DPhysicsKind` to Rapier's RigidBody type prop. `none` is
 *  handled by the caller (renders without a RigidBody wrapper). */
function physicsToRapierType(p: World3DPhysicsKind): "fixed" | "dynamic" | "kinematicPosition" {
  switch (p) {
    case "static":
      return "fixed";
    case "dynamic":
      return "dynamic";
    case "kinematic":
      return "kinematicPosition";
    case "none":
      // Caller checks first; this fallback prevents a TS hole if the
      // discriminant grows a new value before this switch updates.
      return "fixed";
  }
}

export default function EntityMesh({
  entity,
  mode,
  selected,
  onSelect,
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

  return (
    <RigidBody
      type={physicsToRapierType(entity.physics)}
      position={entity.position}
      rotation={entity.rotation}
      colliders={false}
    >
      <KindCollider kind={entity.kind} scale={entity.scale} />
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
}

/** Rapier collider sized to match the entity's authored scale. The
 *  mesh inside the RigidBody is also scale-wrapped so the visuals + the
 *  collider stay locked — change one place, both update. */
function KindCollider({ kind, scale }: KindColliderProps) {
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
      return <BallCollider args={[sphereRadius]} />;
    case "block":
    case "platform":
    case "ramp":
    case "hazard":
    case "goal":
    case "light":
      return <CuboidCollider args={halfExtents} />;
  }
}
