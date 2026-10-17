// Serialize the catalog into the function-calling specs the AI coach sends
// to the LLM.

import { getStudioEditor } from "@/lib/studio/editor-v2/studio-editor-bridge";
import { getActiveForm } from "../active-form-bridge";
import type { ToolDefinition } from "../types";
import { toolRegistry } from "./catalog";

export interface CoachToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: NonNullable<ToolDefinition["parameters"]>;
  };
}

/**
 * Serialize the tools the AI coach should expose to the LLM. Filters to
 * tools that declare a JSON-schema `parameters` block — wizards and
 * page-only tools are intentionally left out.
 *
 * Single source of truth: the chat panel calls this on every request so
 * adding a tool to the registry automatically exposes it to the model.
 */
export function getCoachToolSpecs(opts?: { superAdmin?: boolean }): CoachToolSpec[] {
  const superAdmin = opts?.superAdmin === true;
  // Studio editor tools only make sense — and only work — when an editor
  // is mounted. Game / image / animation / CAD / document register a handle
  // too, but `supportsRecording` / `supportsScenes` are false so the
  // recorder and scene tools stay hidden (#1911).
  const studioEditor = getStudioEditor();
  const studioEditorOpen = studioEditor !== null;
  return toolRegistry
    // SuperAdmin-only tools are never exposed to the model for other
    // users — the backend route enforces the same gate as a backstop.
    .filter((t) => (t.requiresSuperAdmin ? superAdmin : true))
    .filter((t) => (t.requiresStudioEditor ? studioEditorOpen : true))
    .filter((t) => (t.requiresRecording ? studioEditor?.supportsRecording === true : true))
    .filter((t) => (t.requiresScenes ? studioEditor?.supportsScenes === true : true))
    // Form-writing tools exist only while their form is open (and the
    // permission-gated bridge registered it).
    .filter((t) => (t.requiresActiveForm ? getActiveForm(t.requiresActiveForm) !== undefined : true))
    .flatMap((t): CoachToolSpec[] =>
      t.parameters
        ? [{ type: "function", function: { name: t.id, description: t.description, parameters: t.parameters } }]
        : [],
    );
}
