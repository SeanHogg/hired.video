/**
 * Photorealistic talking-head renders (#1560) — the provider seam and the
 * render use cases behind /api/photoreal-avatar. The provider call (D-ID /
 * HeyGen / Synthesia / open-source Wav2Lip-WASM) is dispatched behind
 * `PhotorealAvatarProvider` so picking a provider is a one-file edit. SQL
 * lives in repositories/photorealAvatarRendersRepository.ts.
 */
import { getDb } from "../../db/index.js";
import { DomainError } from "../../domains/errors.js";
import {
  findOwnedPhotorealAvatarRender,
  insertPhotorealAvatarRender,
  listPhotorealAvatarRendersByOwner,
  type PhotorealAvatarRenderRow,
} from "../../repositories/photorealAvatarRendersRepository.js";

export interface PhotorealAvatarRenderInput {
  portraitMediaId?: string | null;
  voiceCloneId?: string | null;
  scriptText?: string | null;
  audioUrl?: string | null;
}

interface PhotorealAvatarProvider {
  readonly name: string;
  queue(input: PhotorealAvatarRenderInput): Promise<{
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

/** Queue a render with the active provider and record the job. */
export async function queuePhotorealAvatarRender(
  ownerUserId: string,
  input: PhotorealAvatarRenderInput,
): Promise<PhotorealAvatarRenderRow> {
  const provider = getActiveProvider();
  const result = await provider.queue(input);
  return insertPhotorealAvatarRender(getDb(), {
    ownerUserId,
    provider: provider.name,
    portraitMediaId: input.portraitMediaId ?? null,
    voiceCloneId: input.voiceCloneId ?? null,
    scriptText: input.scriptText ?? null,
    audioUrl: input.audioUrl ?? null,
    providerJobId: result.providerJobId,
    status: result.status,
    outputVideoUrl: result.outputVideoUrl ?? null,
  });
}

/** The caller's renders, newest first (latest 100). */
export function listPhotorealAvatarRenders(ownerUserId: string): Promise<PhotorealAvatarRenderRow[]> {
  return listPhotorealAvatarRendersByOwner(getDb(), ownerUserId, 100);
}

/** One of the caller's renders; 404 when it is not theirs or does not exist. */
export async function getPhotorealAvatarRender(ownerUserId: string, id: string): Promise<PhotorealAvatarRenderRow> {
  const row = await findOwnedPhotorealAvatarRender(getDb(), id, ownerUserId);
  if (!row) throw new DomainError(404, "NOT_FOUND", "Render not found");
  return row;
}
