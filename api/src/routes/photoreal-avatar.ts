/**
 * /api/photoreal-avatar — provider-agnostic photorealistic talking-head
 * render seam (#1560). The actual provider call (D-ID / HeyGen /
 * Synthesia / open-source Wav2Lip-WASM) is dispatched behind a
 * `PhotorealAvatarProvider` interface so picking a provider is a one-
 * file edit.
 *
 *   POST /renders         queue a render
 *   GET  /renders/:id     poll status
 *   GET  /renders         list caller's renders (newest first)
 */

import { Hono } from "hono";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { AppEnv } from "../types/index.js";
import { success, error } from "../types/index.js";
import { getDb, schema } from "../db/index.js";

const { photorealAvatarRenders } = schema;

export const photorealAvatarRoutes = new Hono<AppEnv>();

function uid(c: any): string | null {
  return (c.var.user?.sub as string | undefined) ?? null;
}

interface PhotorealAvatarProvider {
  readonly name: string;
  queue(input: {
    portraitMediaId?: string | null;
    voiceCloneId?: string | null;
    scriptText?: string | null;
    audioUrl?: string | null;
  }): Promise<{
    providerJobId: string;
    status: "queued" | "rendering" | "completed" | "failed";
    outputVideoUrl?: string | null;
  }>;
}

// Provider stub — returns a queued status so the route surface is
// usable today. Real provider implementations slot in here.
class NullPhotorealAvatarProvider implements PhotorealAvatarProvider {
  readonly name = "null";
  async queue() {
    return {
      providerJobId: `null:${Date.now()}`,
      status: "queued" as const,
      outputVideoUrl: null,
    };
  }
}

function getActiveProvider(): PhotorealAvatarProvider {
  const choice = (process.env.PHOTOREAL_AVATAR_PROVIDER ?? "null").toLowerCase();
  switch (choice) {
    default:
      return new NullPhotorealAvatarProvider();
  }
}

const QueueSchema = z.object({
  portraitMediaId: z.string().uuid().optional(),
  voiceCloneId: z.string().uuid().optional(),
  scriptText: z.string().max(20_000).optional(),
  audioUrl: z.string().url().optional(),
});

photorealAvatarRoutes.post("/renders", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const parsed = QueueSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json(error("VALIDATION_ERROR", "Invalid render payload", parsed.error.flatten()), 400);
  }
  const provider = getActiveProvider();
  const result = await provider.queue(parsed.data);
  const db = getDb();
  const [row] = await db
    .insert(photorealAvatarRenders)
    .values({
      ownerUserId: u,
      provider: provider.name,
      portraitMediaId: parsed.data.portraitMediaId ?? null,
      voiceCloneId: parsed.data.voiceCloneId ?? null,
      scriptText: parsed.data.scriptText ?? null,
      audioUrl: parsed.data.audioUrl ?? null,
      providerJobId: result.providerJobId,
      status: result.status,
      outputVideoUrl: result.outputVideoUrl ?? null,
    })
    .returning();
  return c.json(success({ render: row }), 201);
});

photorealAvatarRoutes.get("/renders", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const rows = await db
    .select()
    .from(photorealAvatarRenders)
    .where(eq(photorealAvatarRenders.ownerUserId, u))
    .orderBy(desc(photorealAvatarRenders.createdAt))
    .limit(100);
  return c.json(success({ items: rows }), 200);
});

photorealAvatarRoutes.get("/renders/:id", async (c) => {
  const u = uid(c);
  if (!u) return c.json(error("UNAUTHORIZED", "Authentication required"), 401);
  const db = getDb();
  const [row] = await db
    .select()
    .from(photorealAvatarRenders)
    .where(
      and(
        eq(photorealAvatarRenders.id, c.req.param("id")),
        eq(photorealAvatarRenders.ownerUserId, u),
      ),
    )
    .limit(1);
  if (!row) return c.json(error("NOT_FOUND", "Render not found"), 404);
  return c.json(success({ render: row }), 200);
});

photorealAvatarRoutes.all("*", (c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Photoreal avatar route not found" } }, 404),
);
