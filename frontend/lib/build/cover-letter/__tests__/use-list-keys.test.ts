/**
 * Stable keys for the letter's highlights: a move / remove carries the keys
 * with the items; an outside change that grows or shrinks the list adds or
 * drops keys at the end.
 */
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { fitKeys, movedKeys, useListKeys } from "../use-list-keys";

describe("fitKeys / movedKeys", () => {
  it("fits keys to a length", () => {
    let n = 0;
    const make = () => `k${n++}`;
    expect(fitKeys(["a", "b"], 2, make)).toEqual(["a", "b"]);
    expect(fitKeys(["a", "b", "c"], 1, make)).toEqual(["a"]);
    expect(fitKeys(["a"], 3, make)).toEqual(["a", "k0", "k1"]);
  });

  it("moves a key", () => {
    expect(movedKeys(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(movedKeys(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
  });
});

describe("useListKeys", () => {
  it("keeps each item's key through a move and a remove", () => {
    const { result, rerender } = renderHook(({ length }) => useListKeys(length, "h"), { initialProps: { length: 3 } });
    const [a, b, c] = result.current.keys;
    expect(new Set([a, b, c]).size).toBe(3);

    act(() => result.current.move(0, 1));
    rerender({ length: 3 });
    expect(result.current.keys).toEqual([b, a, c]);

    act(() => result.current.remove(0));
    rerender({ length: 2 });
    expect(result.current.keys).toEqual([a, c]);
  });

  it("an added item gets a new key; existing keys stay", () => {
    const { result, rerender } = renderHook(({ length }) => useListKeys(length, "h"), { initialProps: { length: 1 } });
    const [first] = result.current.keys;
    rerender({ length: 2 });
    expect(result.current.keys[0]).toBe(first);
    expect(result.current.keys[1]).not.toBe(first);
  });
});
