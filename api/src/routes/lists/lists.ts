// /api/lists — list CRUD + list items (thin HTTP adapters over
// services/lists/listsService.ts).
import { Hono } from "hono";
import type { AppEnv } from "../../types/index.js";
import { error } from "../../types/index.js";
import { requireUser } from "../helpers/routerHelpers.js";
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
import { AddItemSchema, CreateListSchema, parseBody, respond, UpdateListSchema } from "./http.js";

export const listsCrudRoutes = new Hono<AppEnv>();

/** `?entityType=` when it names a known type, else null (= all types). */
function entityTypeQuery(raw: string | undefined) {
  return isListItemEntityType(raw) ? raw : null;
}

// GET /api/lists?entityType=person — visible lists, optionally annotated with
// item counts for a particular entity type.
listsCrudRoutes.get("/", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, getVisibleListsOverview(auth.userId, entityTypeQuery(c.req.query("entityType"))));
});

// POST /api/lists
listsCrudRoutes.post("/", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseBody(c, CreateListSchema);
  if ("response" in body) return body.response;
  return respond(c, createList(auth.userId, body.data), 201);
});

// PATCH /api/lists/:id
listsCrudRoutes.patch("/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseBody(c, UpdateListSchema);
  if ("response" in body) return body.response;
  return respond(c, updateList(auth.userId, c.req.param("id"), body.data));
});

// DELETE /api/lists/:id
listsCrudRoutes.delete("/:id", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, deleteList(auth.userId, c.req.param("id")));
});

// GET /api/lists/:id/items?entityType=person — items in a list, optionally
// scoped to one entity type.
listsCrudRoutes.get("/:id/items", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(
    c,
    getListItems(auth.userId, c.req.param("id"), entityTypeQuery(c.req.query("entityType"))),
  );
});

// POST /api/lists/:id/items — idempotent (200 + alreadyPresent when present).
listsCrudRoutes.post("/:id/items", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const body = await parseBody(c, AddItemSchema);
  if ("response" in body) return body.response;
  return respond(c, addListItem(auth.userId, c.req.param("id"), body.data), (r) => (r.alreadyPresent ? 200 : 201));
});

// DELETE /api/lists/:id/items/:itemId — remove by list_items.id
listsCrudRoutes.delete("/:id/items/:itemId", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  return respond(c, removeListItem(auth.userId, c.req.param("id"), c.req.param("itemId")));
});

// DELETE /api/lists/:id/items?entityType=&entityId=
// Convenience endpoint — UI knows the entity, not the list_items.id.
listsCrudRoutes.delete("/:id/items", async (c) => {
  const auth = requireUser(c);
  if ("response" in auth) return auth.response;
  const entityType = c.req.query("entityType");
  const entityId = c.req.query("entityId");
  if (!entityType || !entityId) {
    return c.json(error("VALIDATION_ERROR", "entityType and entityId are required"), 400);
  }
  if (!isListItemEntityType(entityType)) {
    return c.json(error("VALIDATION_ERROR", "Invalid entityType"), 400);
  }
  return respond(c, removeListEntity(auth.userId, c.req.param("id"), entityType, entityId));
});
