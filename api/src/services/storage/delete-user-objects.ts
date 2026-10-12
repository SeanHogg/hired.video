/**
 * Remove a user's stored objects AND their `uploaded_assets` rows (#733), so
 * the media library never lists a file that is gone. The one delete path for
 * user-owned uploads: explicit deletes, gate discards and replaced avatars.
 * Only keys under the user's own `uploads/<userId>/` prefix are touched.
 */
import { deleteR2Keys } from "./r2-delete.js";
import { forgetAssets } from "./media-library.js";

export interface DeleteUserObjectsDeps {
  deleteObjects: (keys: readonly string[]) => Promise<unknown>;
  forgetRows: (userId: string, keys: readonly string[]) => Promise<void>;
}

const defaultDeps: DeleteUserObjectsDeps = {
  deleteObjects: (keys) => deleteR2Keys(keys),
  forgetRows: (userId, keys) => forgetAssets(userId, keys),
};

export async function deleteUserObjects(
  userId: string,
  keys: ReadonlyArray<string | null | undefined>,
  deps: DeleteUserObjectsDeps = defaultDeps,
): Promise<void> {
  const owned = keys.filter((k): k is string => !!k && k.startsWith(`uploads/${userId}/`));
  if (owned.length === 0) return;
  await deps.deleteObjects(owned);
  await deps.forgetRows(userId, owned);
}
