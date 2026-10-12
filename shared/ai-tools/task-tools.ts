import type { AIToolDef } from "./types.js";

/** Task tools.
 *
 * Endpoint paths corrected from the legacy frontend registry:
 *
 *   `/api/Task/{id}`   → `/api/task/:id`
 *   `/api/Task`        → `/api/task`     (list = GET; create = POST /save)
 *   `/api/Task/save`   → `/api/task/save`
 *
 * Note: TASK_DELETE in the legacy registry used method POST against
 * `/api/Task/{id}` — the actual backend uses DELETE for removal.
 * Updated to match.
 */
export const taskGet: AIToolDef = {
  id: "task-get",
  description: "Get a task by id.",
  endpoint: "/api/task/:id",
  method: "GET",
  requiresAuth: true,
  supportedActions: ["break-down-task", "estimate-time", "suggest-deadlines"],
  contextTypes: ["tasks"],
  responseSchema: {
    id: "string",
    text: "string",
    description: "string",
    start: "date",
    end: "date",
    progress: "number",
    type: "string",
    priority: "string",
  },
};

export const taskList: AIToolDef = {
  id: "task-list",
  description: "List the authenticated user's tasks.",
  endpoint: "/api/task",
  method: "GET",
  requiresAuth: true,
  supportedActions: ["prioritize-tasks", "organize-tasks", "suggest-schedule"],
  contextTypes: ["tasks", "dashboard"],
  responseSchema: { tasks: "array", total: "number" },
};

export const taskSave: AIToolDef = {
  id: "task-save",
  description: "Create or update a task.",
  endpoint: "/api/task/save",
  method: "POST",
  requiresAuth: true,
  supportedActions: ["create-task", "break-down-task", "suggest-deadlines"],
  contextTypes: ["tasks"],
  requestSchema: {
    id: "string (optional — omit for new tasks)",
    text: "string",
    description: "string (optional)",
    start: "date",
    end: "date (optional)",
    progress: "number (0-100)",
    type: "string (optional)",
    priority: "string (optional)",
  },
  responseSchema: { id: "string", success: "boolean" },
};

export const taskDelete: AIToolDef = {
  id: "task-delete",
  description: "Delete a task by id.",
  endpoint: "/api/task/:id",
  method: "DELETE",
  requiresAuth: true,
  supportedActions: ["organize-tasks"],
  contextTypes: ["tasks"],
  responseSchema: { success: "boolean" },
};
