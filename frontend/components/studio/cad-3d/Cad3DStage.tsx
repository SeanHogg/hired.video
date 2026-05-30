/**
 * Cad3DStage — R3F canvas for the 3D CAD modelling runtime
 * (`mediaKind: "cad_3d"`, #930 Phase 2).
 *
 * Rides the same Three.js + R3F stack the 3D World game studio already
 * ships (per [[project_3d_world_game_studio]]) — same `<Canvas>` host,
 * same OrbitControls preset, same lighting rig. The CAD-specific surface
 * is the entity primitive set (box/cylinder/sphere/extrude/boolean) and
 * the orthographic-friendly grid backdrop.
 *
 * Per the DRY rule + shared-component self-gating: this component owns
 * its own selection update (calls `setState` directly) and its own
 * mode (edit / view) — callers don't prop-drill `canEdit`.
 *
 * Camera defaults to ¾ iso looking at the build-volume centre. The
 * build-volume box is drawn as a wireframe so authors see the print
 * envelope while modelling.
 */

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid } from "@react-three/drei";
import { useMemo, type Dispatch, type SetStateAction } from "react";
import type { Cad3DState } from "@shared/cad-3d-state";
import Cad3DEntityMesh from "./Cad3DEntityMesh";

export interface Cad3DStageProps {
  state: Cad3DState;
  setState: Dispatch<SetStateAction<Cad3DState>>;
  /** Commit handler — host's history wrapper records the change.
   *  Selection-only updates don't fire commit (matches the 2D CadStage). */
  commit: (next: Cad3DState) => void;
  /** "edit" enables click-to-select + orbit; "view" disables selection
   *  but keeps orbit so a public viewer can rotate the model. */
  mode?: "edit" | "view";
  /** Wrapper className for callers controlling layout. */
  className?: string;
}

export default function Cad3DStage({
  state,
  setState,
  mode = "edit",
  className,
}: Cad3DStageProps) {
  // Camera-fit target — centre of the build volume so a fresh state's
  // primitives sit in frame. Subsequent OrbitControls drags move the
  // camera; we don't recompute on every state change to avoid yanking
  // the user's view.
  const bvCentre = useMemo(
    () =>
      [
        state.buildVolumeMm.x / 2,
        state.buildVolumeMm.y / 2,
        state.buildVolumeMm.z / 2,
      ] as [number, number, number],
    // build volume only changes via an explicit project setting; safe to
    // pin once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const cameraStart = useMemo(
    () =>
      [
        state.buildVolumeMm.x * 1.5,
        state.buildVolumeMm.y * 1.5,
        state.buildVolumeMm.z * 1.5,
      ] as [number, number, number],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleSelect = (id: string, additive: boolean) => {
    if (mode !== "edit") return;
    setState((prev) => {
      const exists = prev.selectedIds.includes(id);
      let next: string[];
      if (additive) {
        next = exists
          ? prev.selectedIds.filter((s) => s !== id)
          : [...prev.selectedIds, id];
      } else {
        next = exists && prev.selectedIds.length === 1 ? [] : [id];
      }
      return { ...prev, selectedIds: next };
    });
  };

  const handleBackgroundClick = () => {
    // Clicking empty space clears selection — matches every CAD tool's
    // convention and the 2D CadStage's selection behaviour.
    if (mode !== "edit") return;
    if (state.selectedIds.length === 0) return;
    setState((prev) => ({ ...prev, selectedIds: [] }));
  };

  return (
    <div className={className}>
      <Canvas
        camera={{ position: cameraStart, fov: 45, near: 0.1, far: 10000 }}
        onPointerMissed={handleBackgroundClick}
        shadows
      >
        {/* Lights — soft key + ambient fill, same intensities as the
         *  3D World stage so the materials read consistently across
         *  both surfaces. */}
        <ambientLight intensity={0.7} />
        <directionalLight
          position={[
            state.buildVolumeMm.x * 2,
            state.buildVolumeMm.y * 2,
            state.buildVolumeMm.z * 2,
          ]}
          intensity={0.8}
          castShadow
        />

        {/* Build-volume wireframe so the print envelope is visible. */}
        <mesh position={bvCentre}>
          <boxGeometry
            args={[state.buildVolumeMm.x, state.buildVolumeMm.y, state.buildVolumeMm.z]}
          />
          <meshBasicMaterial color="#64748b" wireframe transparent opacity={0.3} />
        </mesh>

        {/* Ground grid at z=0 sized to the build volume. */}
        <Grid
          position={[bvCentre[0], 0, bvCentre[2]]}
          args={[state.buildVolumeMm.x, state.buildVolumeMm.z]}
          cellSize={10}
          sectionSize={100}
          cellThickness={0.4}
          sectionThickness={1}
          fadeDistance={Math.max(state.buildVolumeMm.x, state.buildVolumeMm.z) * 3}
          infiniteGrid={false}
        />

        {/* Entities — boolean-op nodes render their children inline so
         *  we only walk top-level entities here (children are visited
         *  recursively by Cad3DEntityMesh's boolean branch). */}
        {state.entities
          .filter(
            (e) =>
              !state.entities.some(
                (other) => other.kind === "boolean" && other.children.includes(e.id),
              ),
          )
          .map((entity) => (
            <Cad3DEntityMesh
              key={entity.id}
              entity={entity}
              materials={state.materials}
              defaultMaterialId={state.defaultMaterialId}
              selectedIds={state.selectedIds}
              onSelect={handleSelect}
              allEntities={state.entities}
            />
          ))}

        <OrbitControls
          target={bvCentre}
          enableDamping
          dampingFactor={0.08}
          makeDefault
        />
      </Canvas>
    </div>
  );
}
