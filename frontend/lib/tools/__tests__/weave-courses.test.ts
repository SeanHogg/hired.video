import { describe, it, expect } from "vitest";
import { weaveToolsAndCourses } from "@/lib/tools/weave-courses";
import type { ToolCatalogEntry } from "@/data/tools-catalog";
import type { PublicCourseCard } from "@/lib/services/course-service";

// Minimal fixtures — the weave only reads `id`, so the rest is structural.
const tool = (id: string) => ({ id }) as unknown as ToolCatalogEntry;
const course = (id: string) => ({ id }) as unknown as PublicCourseCard;

describe("weaveToolsAndCourses", () => {
  it("returns tools-only (in order) when there are no courses", () => {
    const out = weaveToolsAndCourses([tool("a"), tool("b")], []);
    expect(out.map((i) => i.kind)).toEqual(["tool", "tool"]);
    expect(out.map((i) => i.value.id)).toEqual(["a", "b"]);
  });

  it("returns courses-only when there are no tools", () => {
    const out = weaveToolsAndCourses([], [course("c1"), course("c2")]);
    expect(out.map((i) => i.kind)).toEqual(["course", "course"]);
  });

  it("forces a course into the second slot so learning shows in the first row", () => {
    const out = weaveToolsAndCourses(
      [tool("a"), tool("b"), tool("c"), tool("d")],
      [course("c1"), course("c2")],
    );
    expect(out[0].kind).toBe("tool");
    expect(out[1].kind).toBe("course");
  });

  it("emits every tool and every course exactly once", () => {
    const tools = [tool("a"), tool("b"), tool("c")];
    const courses = [course("c1"), course("c2")];
    const out = weaveToolsAndCourses(tools, courses);
    expect(out).toHaveLength(5);
    expect(out.filter((i) => i.kind === "tool")).toHaveLength(3);
    expect(out.filter((i) => i.kind === "course")).toHaveLength(2);
    // Keys are unique and namespaced by kind.
    expect(new Set(out.map((i) => i.key)).size).toBe(5);
  });

  it("returns an empty list when both inputs are empty", () => {
    expect(weaveToolsAndCourses([], [])).toEqual([]);
  });
});
