// Late-bound catalog lookup for runners that need another tool's metadata
// (generate_video_from_template's `tool_promo` pick). The catalog binds
// `getTool` here at module init, so runners never import the catalog —
// which itself imports the runners — and the module graph stays acyclic.

import type { ToolDefinition } from "../types";

type ToolLookup = (id: string) => ToolDefinition | undefined;

let lookup: ToolLookup = () => undefined;

export function bindToolLookup(fn: ToolLookup): void {
  lookup = fn;
}

export function lookupTool(id: string): ToolDefinition | undefined {
  return lookup(id);
}
