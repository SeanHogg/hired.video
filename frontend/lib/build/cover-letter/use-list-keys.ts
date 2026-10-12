/**
 * useListKeys — stable React keys for a list whose items carry no id (the
 * letter's highlights). Reordering or removing through `move` / `remove`
 * moves the keys with the items, so a field keeps its focus and draft on
 * the item it belongs to. A change from outside (Undo, an AI rewrite) that
 * grows or shrinks the list adds keys at the end / drops the last ones.
 */
import { useCallback, useRef } from "react";

export interface ListKeys {
  keys: readonly string[];
  /** Call BEFORE committing the reordered list. */
  move: (from: number, to: number) => void;
  /** Call BEFORE committing the list without item `index`. */
  remove: (index: number) => void;
}

/** The keys fitted to `length`: new ones appended, extra ones dropped. Pure. */
export function fitKeys(keys: readonly string[], length: number, make: () => string): string[] {
  if (keys.length === length) return [...keys];
  if (keys.length > length) return keys.slice(0, length);
  return [...keys, ...Array.from({ length: length - keys.length }, make)];
}

/** `keys` with the key at `from` moved to `to`. Pure. */
export function movedKeys(keys: readonly string[], from: number, to: number): string[] {
  const next = [...keys];
  const [key] = next.splice(from, 1);
  if (key !== undefined) next.splice(to, 0, key);
  return next;
}

export function useListKeys(length: number, prefix = "item"): ListKeys {
  const seq = useRef(0);
  const keysRef = useRef<string[]>([]);
  const make = () => `${prefix}-${seq.current++}`;
  if (keysRef.current.length !== length) keysRef.current = fitKeys(keysRef.current, length, make);

  const move = useCallback((from: number, to: number) => {
    keysRef.current = movedKeys(keysRef.current, from, to);
  }, []);
  const remove = useCallback((index: number) => {
    keysRef.current = keysRef.current.filter((_, i) => i !== index);
  }, []);
  return { keys: keysRef.current, move, remove };
}
