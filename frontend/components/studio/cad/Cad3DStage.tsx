/**
 * Cad3DStage — minimal Three.js viewer for `mediaKind: "cad_3d"`
 * (#930 follow-on). Mounts a perspective camera + orbit-style camera
 * via react-three-fiber, renders every entity in `state.entities`
 * through the same primitive-→-mesh translator used by the export
 * pipeline. Boolean ops + replicad-backed analytic BREP land in the
 * next phase.
 *
 * Authoring primitives surface via a small toolbar on the canvas
 * (Add Box / Add Cylinder / Add Sphere); clicking inserts the
 * primitive at the world origin so the user has something to grab.
 * Per the DRY rule the mesh-conversion logic lives ONCE in the
 * export module (`cad-3d-export.ts`); this stage imports the entity-
 * shaping helpers from there at render time. Selection + transform
 * controls ride the existing `<TransformHandles/>` primitive once
 * the 3D viewport plumbs the bounding-box bridge — see #1106 follow-on.
 */
import { useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { Cad3DState, CadEntity3D } from "@shared/cad-3d-state";
import { Button } from "@/components/ui/button";
import { Box as BoxIcon, Circle, Move3d } from "lucide-react";

interface Cad3DStageProps {
  state: Cad3DState;
  onChange: (next: Cad3DState) => void;
}

export default function Cad3DStage({ state, onChange }: Cad3DStageProps) {
  const [activeTool, setActiveTool] = useState<"select" | "box" | "cylinder" | "sphere">("select");

  const addPrimitive = (kind: "box" | "cylinder" | "sphere") => {
    const id = `ent-${Math.random().toString(36).slice(2, 10)}`;
    let entity: CadEntity3D;
    if (kind === "box") {
      entity = { id, kind: "box", widthMm: 50, heightMm: 50, depthMm: 50 };
    } else if (kind === "cylinder") {
      entity = { id, kind: "cylinder", radiusMm: 25, heightMm: 50, segments: 32 };
    } else {
      entity = { id, kind: "sphere", radiusMm: 25, segments: 16 };
    }
    onChange({ ...state, entities: [...state.entities, entity], selectedIds: [id] });
  };

  return (
    <div className="relative h-full w-full bg-slate-900">
      <div className="absolute left-3 top-3 z-10 flex flex-col gap-1 rounded border border-border bg-background/95 p-1 shadow-md">
        <ToolButton label="Select" Icon={Move3d} active={activeTool === "select"} onClick={() => setActiveTool("select")} />
        <ToolButton label="Add box" Icon={BoxIcon} active={activeTool === "box"} onClick={() => { setActiveTool("box"); addPrimitive("box"); }} />
        <ToolButton label="Add cylinder" Icon={Circle} active={activeTool === "cylinder"} onClick={() => { setActiveTool("cylinder"); addPrimitive("cylinder"); }} />
        <ToolButton label="Add sphere" Icon={Circle} active={activeTool === "sphere"} onClick={() => { setActiveTool("sphere"); addPrimitive("sphere"); }} />
      </div>
      <Canvas camera={{ position: [state.buildVolumeMm.x, state.buildVolumeMm.y * 1.5, state.buildVolumeMm.z], fov: 45 }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[1, 1, 1]} intensity={0.8} />
        <gridHelper args={[Math.max(state.buildVolumeMm.x, state.buildVolumeMm.y), 20, "#64748b", "#334155"]} />
        {state.entities.map((entity) => (
          <EntityMesh key={entity.id} entity={entity} selected={state.selectedIds.includes(entity.id)} />
        ))}
        <OrbitControls makeDefault />
      </Canvas>
    </div>
  );
}

function ToolButton({ label, Icon, active, onClick }: { label: string; Icon: React.ComponentType<{ className?: string }>; active: boolean; onClick: () => void }) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="icon"
      className="h-8 w-8"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

function EntityMesh({ entity, selected }: { entity: CadEntity3D; selected: boolean }) {
  const colour = selected ? "#22d3ee" : "#cbd5e1";
  const position: [number, number, number] = [
    entity.translate?.x ?? 0,
    entity.translate?.y ?? 0,
    entity.translate?.z ?? 0,
  ];
  if (entity.kind === "box") {
    return (
      <mesh position={position}>
        <boxGeometry args={[entity.widthMm, entity.heightMm, entity.depthMm]} />
        <meshStandardMaterial color={colour} flatShading />
      </mesh>
    );
  }
  if (entity.kind === "cylinder") {
    return (
      <mesh position={position} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[entity.radiusMm, entity.radiusMm, entity.heightMm, entity.segments ?? 32]} />
        <meshStandardMaterial color={colour} flatShading />
      </mesh>
    );
  }
  if (entity.kind === "sphere") {
    return (
      <mesh position={position}>
        <sphereGeometry args={[entity.radiusMm, entity.segments ?? 16, entity.segments ?? 16]} />
        <meshStandardMaterial color={colour} flatShading />
      </mesh>
    );
  }
  return null;
}
