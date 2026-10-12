/**
 * Guard for src/hot-routes.ts (gap #2342).
 *
 * lazyRoute dispatches a request by walking the mounts registered for its
 * path IN ORDER, loading each module on the way until one matches. So a hot
 * route is only free of in-request module init if every module mounted AHEAD
 * of it under a covering prefix (the same prefix, a parent such as "/api",
 * or "/") is also evaluated at startup. Otherwise the first request on a
 * fresh isolate still inits that module and the Workers Free plan kills it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Mount {
  prefix: string;
  module: string;
}

function readMounts(): Mount[] {
  const app = readFileSync(join(SRC, "app.ts"), "utf8");
  const re = /mount\("([^"]+)",\s*\(\)\s*=>\s*import\("\.\/routes\/([^"]+)\.js"\)/g;
  return [...app.matchAll(re)].map(([, prefix, module]) => ({ prefix, module }));
}

function readHot(): Set<string> {
  const hot = readFileSync(join(SRC, "hot-routes.ts"), "utf8");
  return new Set([...hot.matchAll(/^import "\.\/routes\/([^"]+)\.js";$/gm)].map(([, m]) => m));
}

/** True when `outer` is walked before reaching a request under `inner`. */
function covers(outer: string, inner: string): boolean {
  return outer === "/" || inner === outer || inner.startsWith(`${outer}/`);
}

describe("hot-routes — startup-evaluated route modules", () => {
  const mounts = readMounts();
  const hot = readHot();

  it("parses the mount table and the hot list", () => {
    assert.ok(mounts.length > 150, `expected the app.ts mount table, got ${mounts.length} mounts`);
    assert.ok(hot.size > 20, `expected the hot-routes import list, got ${hot.size}`);
  });

  it("every hot module is a mounted route module", () => {
    const mounted = new Set(mounts.map((m) => m.module));
    assert.deepEqual([...hot].filter((m) => !mounted.has(m)), []);
  });

  it("no hot route lazily loads a module mounted ahead of it", () => {
    const problems: string[] = [];
    mounts.forEach((target, i) => {
      if (!hot.has(target.module)) return;
      for (const earlier of mounts.slice(0, i)) {
        if (covers(earlier.prefix, target.prefix) && !hot.has(earlier.module)) {
          problems.push(`${target.prefix} (${target.module}) walks ${earlier.prefix} (${earlier.module}) first`);
        }
      }
    });
    assert.deepEqual(problems, []);
  });
});
