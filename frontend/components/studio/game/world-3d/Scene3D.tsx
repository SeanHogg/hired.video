/**
 * Scene3D — the R3F `<Canvas>` contents for the 3D world runtime.
 * Mounts the lights, sky, ground, every entity, the spawn gizmo
 * (edit), and the player controller (play). Stays presentational —
 * authoring mutations (place / select / move) are wired by the host
 * `<GameStage3D>` through the props it passes here.
 *
 * The Canvas itself lives in the parent so the host can compose
 * overlay chrome (palette toolbar, playtest toggle, HUD) without
 * fighting R3F's portal model.
 */

import { useRef } from "react";
import { OrbitControls } from "@react-three/drei";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import type { ThreeEvent } from "@react-three/fiber";
import type { World3DState } from "@shared/game-state";
import EntityMesh, { type EntityTriggerEvent } from "./EntityMesh";
import PlayerController from "./PlayerController";
import PeerAvatars from "./PeerAvatars";
import type { RemotePeer } from "@/lib/studio/game/use-game-room";

interface Scene3DProps {
  world: World3DState;
  mode: "edit" | "play";
  selectedEntityId: string | null;
  onSelectEntity: (id: string | null) => void;
  /** Sensor-entity overlap events bubble up to the host's challenge
   *  tracker. Only fires in play mode (the scene drops the handler in
   *  edit mode so authoring clicks can't accidentally trigger
   *  challenge progress). */
  onTrigger?: (event: EntityTriggerEvent) => void;
  /** Bumps when the host wants to teleport the player back to spawn
   *  (respawn button, hazard hit in Phase 2). */
  respawnNonce?: number;
  /** Remote peers from `useGameRoom` (gap #1636). Empty map = single-
   *  player or pre-connect; `<PeerAvatars>` self-gates and renders
   *  nothing in that case. */
  peers?: Map<string, RemotePeer>;
  /** Position broadcaster — the PlayerController fans every frame
   *  through this so peers see live motion over WebRTC data
   *  channels. No-op when multiplayer is disabled. */
  onBroadcastPosition?: (
    position: [number, number, number],
    rotation: [number, number, number],
  ) => void;
}

export default function Scene3D({
  world,
  mode,
  selectedEntityId,
  onSelectEntity,
  onTrigger,
  respawnNonce = 0,
  peers,
  onBroadcastPosition,
}: Scene3DProps) {
  const sunDirRef = useRef(world.lighting.sun.direction);
  // Convert "direction the light shines toward" into a light position
  // (opposite direction, scaled out so shadows have angular spread).
  const sunPosition: [number, number, number] = [
    -world.lighting.sun.direction[0] * 30,
    -world.lighting.sun.direction[1] * 30,
    -world.lighting.sun.direction[2] * 30,
  ];
  sunDirRef.current = world.lighting.sun.direction;

  // Empty-ground click in edit mode = deselect any currently-selected
  // entity. Placement uses HTML5 drag-and-drop now (the DropPlacer
  // R3F component handles the drop raycast), so the ground click no
  // longer needs to know about palette kind.
  const handleGroundClick = (_e: ThreeEvent<MouseEvent>) => {
    if (mode !== "edit") return;
    onSelectEntity(null);
  };

  return (
    <>
      <color attach="background" args={[world.skyColor]} />
      <fog attach="fog" args={[world.skyColor, 50, 200]} />

      <ambientLight
        intensity={world.lighting.ambient.intensity}
        color={world.lighting.ambient.color}
      />
      <directionalLight
        position={sunPosition}
        intensity={world.lighting.sun.intensity}
        color={world.lighting.sun.color}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-50}
        shadow-camera-right={50}
        shadow-camera-top={50}
        shadow-camera-bottom={-50}
      />

      <Physics gravity={[0, -9.81, 0]} paused={mode === "edit"}>
        {/* Ground — single static cuboid sized to the authored ground.
            The mesh under it catches click-to-place in edit mode. */}
        <RigidBody type="fixed" colliders={false} position={[0, -0.5, 0]}>
          <CuboidCollider args={[world.ground.size / 2, 0.5, world.ground.size / 2]} />
          <mesh
            receiveShadow
            onClick={handleGroundClick}
            position={[0, 0.5, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[world.ground.size, world.ground.size]} />
            <meshStandardMaterial color={world.ground.color} />
          </mesh>
        </RigidBody>

        {world.entities.map((entity) => (
          <EntityMesh
            key={entity.id}
            entity={entity}
            mode={mode}
            selected={mode === "edit" && entity.id === selectedEntityId}
            onSelect={onSelectEntity}
            onTrigger={mode === "play" ? onTrigger : undefined}
          />
        ))}

        {/* Spawn gizmo — visible in edit only. A translucent green
            cylinder marks where the player will appear on Playtest. */}
        {mode === "edit" && (
          <mesh
            position={world.spawn.position}
            rotation={world.spawn.rotation}
          >
            <cylinderGeometry args={[0.6, 0.6, 2, 24]} />
            <meshStandardMaterial
              color="#22c55e"
              transparent
              opacity={0.35}
              emissive="#22c55e"
              emissiveIntensity={0.5}
            />
          </mesh>
        )}

        {mode === "play" && (
          <PlayerController
            spawn={world.spawn}
            respawnNonce={respawnNonce}
            onBroadcastPosition={onBroadcastPosition}
          />
        )}

        {/* Remote peers — self-gating, renders nothing when the
            peers Map is undefined or empty. */}
        {peers && <PeerAvatars peers={peers} />}
      </Physics>

      {mode === "edit" && (
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          target={[0, 1, 0]}
          maxPolarAngle={Math.PI / 2 - 0.05}
        />
      )}
    </>
  );
}
