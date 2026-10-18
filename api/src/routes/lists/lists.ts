// /api/lists — list CRUD + list items (thin HTTP adapters over
// services/lists/listsService.ts).
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
import { validateJson } from "../helpers/validate.js";
import { isListItemEntityType } from "../../services/lists/listAccess.js";
import {
  addListItem,
  createList,
  deleteList,
  getListItems,
  getVisibleListsOverview,
  removeListEntity,
  removeListItem,
  updateList,
} from "../../services/lists/listsService.js";
import { AddItemSchema, CreateListSchema, respond, UpdateListSchema } from "./http.js";

export const listsCrudRoutes = new Hono<AppEnv>();

/** `?entityType=` when it names a known type, else null (= all types). */
function entityTypeQuery(raw: string | undefined) {
  return isListItemEntityType(raw) ? raw : null;
}

// GET /api/lists?entityType=person — visible lists, optionally annotated with
// item counts for a particular entity type.
listsCrudRoutes.get("/", async (c) => {
  const userId = requireUser(c);
  return respond(c, getVisibleListsOverview(userId, entityTypeQuery(c.req.query("entityType"))));
});

// POST /api/lists
listsCrudRoutes.post("/", validateJson(CreateListSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, createList(userId, body), 201);
});

// PATCH /api/lists/:id
listsCrudRoutes.patch("/:id", validateJson(UpdateListSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, updateList(userId, c.req.param("id"), body));
});

// DELETE /api/lists/:id
listsCrudRoutes.delete("/:id", async (c) => {
  const userId = requireUser(c);
  return respond(c, deleteList(userId, c.req.param("id")));
});

// GET /api/lists/:id/items?entityType=person — items in a list, optionally
// scoped to one entity type.
listsCrudRoutes.get("/:id/items", async (c) => {
  const userId = requireUser(c);
  return respond(
    c,
    getListItems(userId, c.req.param("id"), entityTypeQuery(c.req.query("entityType"))),
  );
});

// POST /api/lists/:id/items — idempotent (200 + alreadyPresent when present).
listsCrudRoutes.post("/:id/items", validateJson(AddItemSchema, undefined, { emptyBody: null }), async (c) => {
  const userId = requireUser(c);
  const body = c.req.valid("json");
  return respond(c, addListItem(userId, c.req.param("id"), body), (r) => (r.alreadyPresent ? 200 : 201));
});

// DELETE /api/lists/:id/items/:itemId — remove by list_items.id
listsCrudRoutes.delete("/:id/items/:itemId", async (c) => {
  const userId = requireUser(c);
  return respond(c, removeListItem(userId, c.req.param("id"), c.req.param("itemId")));
});

// DELETE /api/lists/:id/items?entityType=&entityId=
// Convenience endpoint — UI knows the entity, not the list_items.id.
listsCrudRoutes.delete("/:id/items", async (c) => {
  const userId = requireUser(c);
  const entityType = c.req.query("entityType");
  const entityId = c.req.query("entityId");
  if (!entityType || !entityId) {
    return c.json(error("VALIDATION_ERROR", "entityType and entityId are required"), 400);
  }
  if (!isListItemEntityType(entityType)) {
    return c.json(error("VALIDATION_ERROR", "Invalid entityType"), 400);
  }
  return respond(c, removeListEntity(userId, c.req.param("id"), entityType, entityId));
});
