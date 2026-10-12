/**
 * DropPlacer — pure raycast helper. Lives inside the R3F Canvas so it
 * can read the camera + canvas geometry via `useThree()` and convert
 * a screen-space cursor position into a world-space hit on the ground
 * plane.
 *
 * The outer HTML5 drop event (in [GameStage3D.tsx](../GameStage3D.tsx))
 * is the only place DnD fires. It reads the dataTransfer MIME, decides
 * what to place (primitive kind, sprite asset, future custom upload),
 * then asks DropPlacer for the world position via the registered
 * ref. **DropPlacer doesn't know what's being placed** — it just
 * returns the hit point. The host owns the dispatch (DRY: one drop
 * receiver, multiple drag sources, no per-source raycast fork).
 *
 * Drop coordinates → world coords:
 *   1. Convert (clientX, clientY) to normalized device coordinates
 *      [-1, 1] using the WebGL canvas's bounding rect.
 *   2. Build a Raycaster from the camera through that NDC point.
 *   3. Intersect with a virtual ground plane at y = 0 (one ground plane,
 *      flat — heightmap terrain is tracked under gap #1639).
 *   4. Return [x, y, z] or null when the ray misses (camera looking up
 *      at the sky, etc).
 */

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Plane, Raycaster, Vector2, Vector3 } from "three";

/** Resolves the cursor position to a world-space hit on the ground.
 *  `null` when the ray misses the plane (looking at the sky). */
export type DropPlacerHandler = (
  clientX: number,
  clientY: number,
) => [number, number, number] | null;

interface DropPlacerProps {
  /** Ref slot — DropPlacer writes its handler in on mount and clears
   *  it on unmount. The outer drop event reads this to convert the
   *  raw cursor coords into a world-space position. */
  handlerRef: React.MutableRefObject<DropPlacerHandler | null>;
}

export default function DropPlacer({ handlerRef }: DropPlacerProps) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const hit = new Vector3();

    const handler: DropPlacerHandler = (clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const intersected = raycaster.ray.intersectPlane(groundPlane, hit);
      if (!intersected) return null;
      return [hit.x, hit.y, hit.z];
    };

    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, [camera, gl, handlerRef]);

  return null;
}
