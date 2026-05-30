/**
 * Cad3DEntityMesh — renders one `CadEntity3D` as the matching Three.js
 * primitive via R3F (#930 Phase 2 — 3D modelling on the existing
 * Three.js + R3F stack from the 3D world game studio per
 * [[project_3d_world_game_studio]]).
 *
 * Phase 2 ships the four primitives (box / cylinder / sphere / extrude)
 * plus boolean-op pass-through (renders each child mesh layered — a
 * proper CSG evaluation needs `three-bvh-csg` which isn't bundled today;
 * the boolean-op nodes are correctly stored + visualised, ready for the
 * CSG kernel to subsume the renderer when bundled).
 *
 * Per the DRY rule + the "shared components self-gate" rule from the
 * project hooks: this component reads materialId off the entity and
 * looks up the material in the supplied palette — callers don't pass
 * separate `color` / `density` props.
 */

import type { CadEntity3D, CadMaterial, V3, Quat } from "@shared/cad-3d-state";
import { Extrude } from "@react-three/drei";
import { Shape } from "three";
import type { ThreeEvent } from "@react-three/fiber";

interface Cad3DEntityMeshProps {
  entity: CadEntity3D;
  /** Material palette from `Cad3DState.materials`. The component
   *  resolves the entity's `materialId` against this — caller doesn't
   *  thread `color` separately. */
  materials: CadMaterial[];
  /** Default material id from `Cad3DState.defaultMaterialId`. Used when
   *  the entity has no `materialId` assigned. */
  defaultMaterialId: string;
  /** Currently-selected entity ids from `Cad3DState.selectedIds`. The
   *  component compares its own id against this — caller doesn't pass
   *  `isSelected`. */
  selectedIds: string[];
  /** Click handler — host swaps selection. */
  onSelect?: (id: string, additive: boolean) => void;
  /** All entities — needed when this is a boolean-op node so we can
   *  resolve children by id. Passed through; the renderer reaches into
   *  this list when `entity.kind === "boolean"`. */
  allEntities?: CadEntity3D[];
}

function tupleV3(v: V3 | undefined, fallback: [number, number, number] = [0, 0, 0]): [number, number, number] {
  if (!v) return fallback;
  // CAD state is in millimetres; Three.js uses unitless world units but
  // we treat 1 unit = 1 mm so the build-volume hint maps to the camera
  // distance directly.
  return [v.x, v.y, v.z];
}

function tupleQuat(q: Quat | undefined): [number, number, number, number] {
  return q ?? [0, 0, 0, 1];
}

function resolveColor(
  entity: CadEntity3D,
  materials: CadMaterial[],
  defaultMaterialId: string,
): string {
  const id = entity.materialId ?? defaultMaterialId;
  const m = materials.find((m) => m.id === id);
  return m?.color ?? "#fafafa";
}

export default function Cad3DEntityMesh({
  entity,
  materials,
  defaultMaterialId,
  selectedIds,
  onSelect,
  allEntities = [],
}: Cad3DEntityMeshProps) {
  const isSelected = selectedIds.includes(entity.id);
  const color = resolveColor(entity, materials, defaultMaterialId);
  const position = tupleV3(entity.translate);
  const quaternion = tupleQuat(entity.rotate);
  const scale = tupleV3(entity.scale, [1, 1, 1]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect?.(entity.id, e.shiftKey);
  };

  const wrap = (children: React.ReactNode) => (
    <group
      position={position}
      quaternion={quaternion}
      scale={scale}
      onClick={handleClick}
    >
      {children}
    </group>
  );

  switch (entity.kind) {
    case "box":
      return wrap(
        <mesh>
          <boxGeometry args={[entity.widthMm, entity.heightMm, entity.depthMm]} />
          <meshStandardMaterial color={color} />
          {isSelected && <SelectionOutline />}
        </mesh>,
      );

    case "cylinder":
      return wrap(
        <mesh>
          <cylinderGeometry
            args={[entity.radiusMm, entity.radiusMm, entity.heightMm, entity.segments ?? 32]}
          />
          <meshStandardMaterial color={color} />
          {isSelected && <SelectionOutline />}
        </mesh>,
      );

    case "sphere":
      return wrap(
        <mesh>
          <sphereGeometry
            args={[entity.radiusMm, entity.segments ?? 32, Math.max(8, (entity.segments ?? 32) / 2)]}
          />
          <meshStandardMaterial color={color} />
          {isSelected && <SelectionOutline />}
        </mesh>,
      );

    case "extrude": {
      const shape = new Shape();
      const pts = entity.profile;
      if (pts.length > 0) {
        shape.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          shape.lineTo(pts[i].x, pts[i].y);
        }
        shape.closePath();
      }
      return wrap(
        <Extrude args={[shape, { depth: entity.depthMm, bevelEnabled: false }]}>
          <meshStandardMaterial color={color} />
          {isSelected && <SelectionOutline />}
        </Extrude>,
      );
    }

    case "boolean": {
      // CSG kernel (three-bvh-csg) isn't bundled today — we render each
      // child as its own mesh with the boolean op recorded in the data
      // model. When the kernel ships, this branch evaluates the op + the
      // wireframe collapses to one mesh; until then the visual is "all
      // children stacked" with a subtle wireframe hint so it's clear the
      // op is pending evaluation.
      const childEntities = entity.children
        .map((id) => allEntities.find((e) => e.id === id))
        .filter(Boolean) as CadEntity3D[];
      return wrap(
        <group>
          {childEntities.map((child) => (
            <Cad3DEntityMesh
              key={child.id}
              entity={child}
              materials={materials}
              defaultMaterialId={defaultMaterialId}
              selectedIds={selectedIds}
              onSelect={onSelect}
              allEntities={allEntities}
            />
          ))}
          {/* Pending-op marker — small wireframe sphere at origin */}
          <mesh>
            <sphereGeometry args={[2, 8, 6]} />
            <meshBasicMaterial color="#facc15" wireframe />
          </mesh>
        </group>,
      );
    }

    default:
      return null;
  }
}

/** Thin wireframe outline rendered alongside the mesh when the entity
 *  is selected. Sized via inherited `<group scale>` so it follows the
 *  primitive's transform without per-kind sizing logic. */
function SelectionOutline() {
  // Simple slightly-larger wireframe overlay — replicates the "selected"
  // affordance from the 2D CadStage. The host can swap this for the
  // drei `<TransformControls>` gizmo once translation/rotation/scale
  // handles ship (#930 Phase 3).
  return (
    <mesh scale={[1.02, 1.02, 1.02]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial color="#3b82f6" wireframe transparent opacity={0.4} />
    </mesh>
  );
}
