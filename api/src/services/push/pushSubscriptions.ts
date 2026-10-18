/**
 * Browser Web Push registration use cases (the /api/push routes). Delivery
 * itself is `web-push.ts` via the notification dispatcher.
 */
import { getDb } from "../../db/index.js";
import {
  PushSubscriptionsRepository,
  type PushSubscriptionInput,
} from "../../repositories/pushSubscriptionsRepository.js";

function repo(): PushSubscriptionsRepository {
  return new PushSubscriptionsRepository(getDb());
}

/** Register / refresh this browser's endpoint for the user. */
export async function subscribeToPush(input: PushSubscriptionInput): Promise<void> {
  await repo().upsert(input);
}

/** Remove this browser's endpoint (owner-scoped). */
export async function unsubscribeFromPush(userId: string, endpoint: string): Promise<void> {
  await repo().deleteForUser(userId, endpoint);
}
