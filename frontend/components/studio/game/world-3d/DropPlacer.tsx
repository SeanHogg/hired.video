/**
 * DropPlacer — invisible R3F component that converts a DOM drop event
 * over the canvas into a world-space placement.
 *
 * The outer `<div>` wrapping the R3F Canvas catches the HTML5 drop
 * event (the only place HTML drag/drop fires); this inner component
 * has access (via `useThree()`) to the camera + the canvas geometry
 * needed to raycast the cursor position against the ground plane.
 *
 * The pieces are coordinated through a registration callback: the
 * outer drop handler calls `dropHandlerRef.current(kind, clientX, clientY)`,
 * which is set by this component on mount and cleared on unmount. No
 * global event bus needed — just a ref ping-ponged through React.
 *
 * Drop coordinates → world coords:
 *   1. Convert (clientX, clientY) to normalized device coordinates
 *      [-1, 1] using the WebGL canvas's bounding rect.
 *   2. Build a Raycaster from the camera through that NDC point.
 *   3. Intersect with a virtual ground plane at y = 0 (one ground plane,
 *      flat — heightmap terrain is tracked under gap #1639).
 *   4. Call `onPlace(kind, [x, y, z])` with the hit point.
 */

import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import type { World3DEntityKind } from "@shared/game-state";

export type DropPlacerHandler = (
  kind: World3DEntityKind,
  clientX: number,
  clientY: number,
) => void;

interface DropPlacerProps {
  /** Ref slot — the DropPlacer writes its handler into `.current`
   *  on mount and clears it on unmount. The host's outer drop handler
   *  reads from this ref to forward the drop into R3F. */
  handlerRef: React.MutableRefObject<DropPlacerHandler | null>;
  onPlace: (kind: World3DEntityKind, position: [number, number, number]) => void;
}

export default function DropPlacer({ handlerRef, onPlace }: DropPlacerProps) {
  const { camera, gl } = useThree();

  useEffect(() => {
    const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
    const raycaster = new Raycaster();
    const ndc = new Vector2();
    const hit = new Vector3();

    const handler: DropPlacerHandler = (kind, clientX, clientY) => {
      const rect = gl.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      ndc.set(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const intersected = raycaster.ray.intersectPlane(groundPlane, hit);
      if (!intersected) return;
      onPlace(kind, [hit.x, hit.y, hit.z]);
    };

    handlerRef.current = handler;
    return () => {
      // Only clear if we're still the registered handler — guards
      // against a quick remount/unmount race overwriting a newer one.
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, [camera, gl, handlerRef, onPlace]);

  return null;
}
