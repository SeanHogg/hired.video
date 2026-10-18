/**
 * HTTP adapter shared by the /api/lists sub-routers: zod schemas (validated
 * with validateJson's default envelope), and `respond` — run a use case and render its
 * data as `{success,data,timestamp}` (status may depend on the data), or a
 * thrown DomainError as its error envelope.
 */
import type { Context } from "hono";
import { z } from "zod";
import { UuidLikeSchema } from "../../../../shared/validation.js";
import { LIST_ITEM_ENTITY_TYPES } from "../../services/lists/listAccess.js";
import { isDomainError } from "../../domains/errors.js";
import { failFromDomainError, ok } from "../../handlers/shared.js";
import { sendHandlerResult } from "../helpers/routerHelpers.js";

export const CreateListSchema = z.object({
  title: z.string().min(1).max(255),
  isPrivate: z.boolean().default(true),
  companyId: UuidLikeSchema.nullable().optional(),
});

export const UpdateListSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  isPrivate: z.boolean().optional(),
});

export const AddItemSchema = z.object({
  entityType: z.enum(LIST_ITEM_ENTITY_TYPES),
  entityId: UuidLikeSchema,
  notes: z.string().max(2000).optional(),
});

export const WishlistToggleSchema = z.object({
  entityType: z.enum(LIST_ITEM_ENTITY_TYPES),
  entityId: UuidLikeSchema,
});

export async function respond<T>(
  c: Context,
  run: Promise<T>,
  status: number | ((data: T) => number) = 200,
): Promise<Response> {
  try {
    const data = await run;
    return sendHandlerResult(c, ok(data, typeof status === "function" ? status(data) : status));
  } catch (err) {
    if (isDomainError(err)) return sendHandlerResult(c, failFromDomainError(err));
    throw err;
  }
}
