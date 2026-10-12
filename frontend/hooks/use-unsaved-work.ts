// use-unsaved-work.ts — app-wide "is there work that a reload would lose?"
// signal.
//
// Editors register while they hold edits the server has not accepted yet;
// anything that would reload the page (the PWA auto-update in
// PWAUpdatePrompt) asks `hasUnsavedWork()` first and waits instead of
// discarding the work. A module store, not React context, so a non-React
// caller (a timer, a service-worker hook) can read it too.
//
// The same registry drives the browser's "Leave site? Changes you made may
// not be saved" prompt: a `beforeunload` guard is attached while anything is
// dirty and removed once everything is saved (attached lazily, so pages with
// no editor keep the back/forward cache).

import { useEffect, useRef } from "react";

const dirtyOwners = new Set<symbol>();

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (dirtyOwners.size === 0) return;
  event.preventDefault();
  // Legacy browsers only show the prompt when returnValue is set.
  event.returnValue = "";
}

let guardAttached = false;

function syncUnloadGuard(): void {
  if (typeof window === "undefined") return;
  const want = dirtyOwners.size > 0;
  if (want === guardAttached) return;
  guardAttached = want;
  if (want) window.addEventListener("beforeunload", onBeforeUnload);
  else window.removeEventListener("beforeunload", onBeforeUnload);
}

/** Mark one owner's work as unsaved (`true`) or safe (`false`). */
export function setUnsavedWork(owner: symbol, dirty: boolean): void {
  if (dirty) dirtyOwners.add(owner);
  else dirtyOwners.delete(owner);
  syncUnloadGuard();
}

/** True while any registered editor holds work a reload would lose. */
export function hasUnsavedWork(): boolean {
  return dirtyOwners.size > 0;
}

/** Drop every registration — for a deliberate reload the user chose (e.g.
 *  "load the newer copy"), so the unload prompt doesn't second-guess it. */
export function releaseAllUnsavedWork(): void {
  dirtyOwners.clear();
  syncUnloadGuard();
}

/** A stable owner token for one component instance. Cleared on unmount. */
export function useUnsavedWorkOwner(): symbol {
  const ownerRef = useRef<symbol>(Symbol("unsaved-work"));
  useEffect(() => {
    const owner = ownerRef.current;
    return () => setUnsavedWork(owner, false);
  }, []);
  return ownerRef.current;
}

/** Declarative form for an editor that already tracks a dirty boolean:
 *  registered while `dirty`, released when clean or unmounted. */
export function useRegisterUnsavedWork(dirty: boolean): void {
  const owner = useUnsavedWorkOwner();
  useEffect(() => {
    setUnsavedWork(owner, dirty);
  }, [owner, dirty]);
}
