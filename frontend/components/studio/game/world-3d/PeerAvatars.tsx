/**
 * PeerAvatars — renders one capsule + name tag per remote peer inside
 * the R3F scene. Self-gates internally: returns null when the peer
 * map is empty (no consumer needs to know whether multiplayer is
 * active — they just mount the component).
 *
 * Reads peer state from the `useGameRoom` hook's `peers` Map. The
 * `useFrame` tick re-reads positions on every render so the 15Hz
 * data-channel updates show as smooth motion without a React
 * reconcile per packet (the Map is mutated in place by the hook for
 * the per-frame position; React state only changes on join/leave).
 */

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Group } from "three";
import { Html } from "@react-three/drei";
import type { RemotePeer } from "@/lib/studio/game/use-game-room";
import { AvatarFigure, colorForId } from "./PlayerAvatar";

interface PeerAvatarsProps {
  peers: Map<string, RemotePeer>;
}

export default function PeerAvatars({ peers }: PeerAvatarsProps) {
  if (peers.size === 0) return null;
  return (
    <>
      {Array.from(peers.values()).map((peer) => (
        <PeerAvatar key={peer.id} peer={peer} />
      ))}
    </>
  );
}

/** One peer rendered as a colored capsule + a floating name tag.
 *  The peer's color is derived from its `userId` so the same friend
 *  always gets the same hue across sessions. */
function PeerAvatar({ peer }: { peer: RemotePeer }) {
  const groupRef = useRef<Group>(null);
  const color = colorForId(peer.userId);

  // Position is mutated in-place on the peer object by useGameRoom.
  // useFrame reads it each tick — no useState needed for the hot
  // path (a 15Hz reconcile would tank perf).
  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    g.position.set(peer.position[0], peer.position[1], peer.position[2]);
    g.rotation.set(peer.rotation[0], peer.rotation[1], peer.rotation[2]);
  });

  return (
    <group ref={groupRef}>
      {/* Shared blocky figure — same look the local player sees in
          third-person view (DRY: one avatar across local + peers). */}
      <AvatarFigure color={color} />
      <Html position={[0, 1.4, 0]} center distanceFactor={10}>
        <span
          className="select-none rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white shadow"
          style={{ pointerEvents: "none" }}
        >
          {peer.displayName}
        </span>
      </Html>
    </group>
  );
}
