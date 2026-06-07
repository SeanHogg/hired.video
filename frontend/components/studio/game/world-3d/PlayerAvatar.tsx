/**
 * PlayerAvatar — the shared Roblox-style blocky humanoid figure used
 * for BOTH the local player (third-person camera) and remote peers.
 *
 * Extracted so there is one avatar look across the whole 3D runtime
 * (DRY rule): `PlayerController`'s third-person body and `PeerAvatars`
 * both render `<AvatarFigure>` instead of each hand-rolling a capsule.
 * The figure is centered on its group origin with a total height of
 * ~2.0 units, matching the player's `CapsuleCollider` (half-height 0.6
 * + radius 0.4) so it lines up with the physics body when positioned
 * at the body's translation.
 *
 * Presentational only — the caller owns the group's position +
 * rotation (the local controller sets them from the Rapier body each
 * frame; `PeerAvatars` sets them from the peer's broadcast packet).
 */

import { useMemo } from "react";
import { Color } from "three";

interface AvatarFigureProps {
  /** Body / limb color (CSS hex or hsl). The head + face derive
   *  lighter / darker shades from this so the same input yields one
   *  coherent character. */
  color: string;
}

/** Blocky humanoid built from a handful of boxes, centered on the
 *  group origin. The figure faces -Z at rotation 0 (three.js default
 *  forward), so callers set `group.rotation.y` to aim it. */
export function AvatarFigure({ color }: AvatarFigureProps) {
  // Head reads as a slightly lighter tint of the body so the character
  // has some depth without a second authored color.
  const headColor = useMemo(() => {
    const c = new Color(color);
    c.offsetHSL(0, 0, 0.12);
    return `#${c.getHexString()}`;
  }, [color]);

  return (
    <group>
      {/* Head — cube with two eyes on the front (-Z) face. */}
      <group position={[0, 0.65, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.55, 0.55, 0.55]} />
          <meshStandardMaterial color={headColor} />
        </mesh>
        {/* Eyes — small dark blocks just proud of the front face. */}
        <mesh position={[-0.13, 0.05, -0.29]}>
          <boxGeometry args={[0.1, 0.12, 0.04]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <mesh position={[0.13, 0.05, -0.29]}>
          <boxGeometry args={[0.1, 0.12, 0.04]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      </group>

      {/* Torso. */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[0.6, 0.65, 0.32]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Arms. */}
      <mesh position={[-0.43, 0.08, 0]} castShadow>
        <boxGeometry args={[0.22, 0.6, 0.28]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.43, 0.08, 0]} castShadow>
        <boxGeometry args={[0.22, 0.6, 0.28]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Legs. */}
      <mesh position={[-0.16, -0.6, 0]} castShadow>
        <boxGeometry args={[0.24, 0.7, 0.3]} />
        <meshStandardMaterial color={color} />
      </mesh>
      <mesh position={[0.16, -0.6, 0]} castShadow>
        <boxGeometry args={[0.24, 0.7, 0.3]} />
        <meshStandardMaterial color={color} />
      </mesh>
    </group>
  );
}

/** Deterministic hue from a userId — same player, same color across
 *  sessions and across every surface that renders them (local avatar +
 *  remote peers). Tiny djb2 hash → HSL palette. Shared here so the
 *  local third-person body and `PeerAvatars` never drift (DRY). */
export function colorForId(userId: string): string {
  let hash = 5381;
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) + hash + userId.charCodeAt(i)) & 0xffffffff;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 55%)`;
}
