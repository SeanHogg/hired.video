/**
 * Per-placement notification subscriptions (#230).
 *
 * The `placement_notification_subscriptions` table (one row per
 * placementId × event × userId) shipped with no service wiring. This is
 * that wiring: subscribe/unsubscribe/list management + `notifyEvent`,
 * which fans a placement stage event out to its subscribers through the
 * unified notification dispatcher (in-app bell + opt-in, pref-gated
 * email — `emitNotification` from notificationService.ts).
 *
 * Stage events:
 *   • `signed`            — fired synchronously when a placement is created.
 *   • `guarantee_met`     — fired when the recruiter marks the guarantee met.
 *   • `started` / `first_day` / `guarantee_expires` — DATE-based; these
 *     need a daily sweep cron that calls `notifyEvent` when startDate /
 *     guaranteeEndDate is reached. The delivery path is complete; the
 *     scheduler is tracked as a follow-up (see register).
 *
 * Repo is an interface so the service is unit-testable with a plain fake
 * (no Drizzle), per the DI convention.
 */

import { and, eq, gte, lte, isNotNull } from "drizzle-orm";
import { schema } from "../../db/index.js";
import { buildRepos } from "../../repositories/index.js";
import { emitNotification } from "./notificationService.js";

const { placementNotificationSubscriptions, placements, placementNotificationLog } = schema;

export const PLACEMENT_EVENTS = [
  "signed",
  "started",
  "first_day",
  "guarantee_expires",
  "guarantee_met",
] as const;
export type PlacementEvent = (typeof PLACEMENT_EVENTS)[number];

export function isPlacementEvent(v: unknown): v is PlacementEvent {
  return typeof v === "string" && (PLACEMENT_EVENTS as readonly string[]).includes(v);
}

/** Minimal placement shape the notification copy needs. */
export interface PlacementSummary {
  id: string;
  recruiterId: string;
  candidateName: string | null;
  jobTitle: string | null;
  companyName: string | null;
}

export interface PlacementSubscriptionRow {
  id: string;
  placementId: string;
  userId: string;
  event: string;
}

export interface IPlacementNotificationRepository {
  subscribe(placementId: string, userId: string, event: PlacementEvent): Promise<void>;
  unsubscribe(placementId: string, userId: string, event: PlacementEvent): Promise<void>;
  listForPlacement(placementId: string): Promise<PlacementSubscriptionRow[]>;
  findSubscriberIds(placementId: string, event: PlacementEvent): Promise<string[]>;
  getPlacement(placementId: string): Promise<PlacementSummary | null>;
  /** Placements whose startDate has been reached and are still active. */
  findStartedPlacements(now: Date): Promise<PlacementSummary[]>;
  /** Active placements whose guaranteeEndDate falls within [now, now+days]. */
  findGuaranteeExpiringPlacements(now: Date, withinDays: number): Promise<PlacementSummary[]>;
  /** Record a fired (placement,event); returns true only when newly inserted
   *  (idempotency — false means it already fired and must be skipped). */
  markEventFired(placementId: string, event: PlacementEvent): Promise<boolean>;
}

/** Drizzle-backed repo. */
export class PlacementNotificationRepository implements IPlacementNotificationRepository {
  constructor(private readonly db: any) {}

  async subscribe(placementId: string, userId: string, event: PlacementEvent): Promise<void> {
    // Idempotent: a duplicate (placement,user,event) is a no-op.
    const existing = await this.db
      .select({ id: placementNotificationSubscriptions.id })
      .from(placementNotificationSubscriptions)
      .where(
        and(
          eq(placementNotificationSubscriptions.placementId, placementId),
          eq(placementNotificationSubscriptions.userId, userId),
          eq(placementNotificationSubscriptions.event, event),
        ),
      )
      .limit(1);
    if (existing.length > 0) return;
    await this.db
      .insert(placementNotificationSubscriptions)
      .values({ placementId, userId, event } as any);
  }

  async unsubscribe(placementId: string, userId: string, event: PlacementEvent): Promise<void> {
    await this.db
      .delete(placementNotificationSubscriptions)
      .where(
        and(
          eq(placementNotificationSubscriptions.placementId, placementId),
          eq(placementNotificationSubscriptions.userId, userId),
          eq(placementNotificationSubscriptions.event, event),
        ),
      );
  }

  async listForPlacement(placementId: string): Promise<PlacementSubscriptionRow[]> {
    return (await this.db
      .select()
      .from(placementNotificationSubscriptions)
      .where(eq(placementNotificationSubscriptions.placementId, placementId))) as PlacementSubscriptionRow[];
  }

  async findSubscriberIds(placementId: string, event: PlacementEvent): Promise<string[]> {
    const rows = await this.db
      .select({ userId: placementNotificationSubscriptions.userId })
      .from(placementNotificationSubscriptions)
      .where(
        and(
          eq(placementNotificationSubscriptions.placementId, placementId),
          eq(placementNotificationSubscriptions.event, event),
        ),
      );
    return rows.map((r: { userId: string }) => r.userId);
  }

  async getPlacement(placementId: string): Promise<PlacementSummary | null> {
    const [row] = await this.db
      .select({
        id: placements.id,
        recruiterId: placements.recruiterId,
        candidateName: placements.candidateName,
        jobTitle: placements.jobTitle,
        companyName: placements.companyName,
      })
      .from(placements)
      .where(eq(placements.id, placementId))
      .limit(1);
    return row ?? null;
  }

  private readonly summaryCols = {
    id: placements.id,
    recruiterId: placements.recruiterId,
    candidateName: placements.candidateName,
    jobTitle: placements.jobTitle,
    companyName: placements.companyName,
  };

  async findStartedPlacements(now: Date): Promise<PlacementSummary[]> {
    return (await this.db
      .select(this.summaryCols)
      .from(placements)
      .where(
        and(
          isNotNull(placements.startDate),
          lte(placements.startDate, now),
          eq(placements.status, "active"),
        ),
      )) as PlacementSummary[];
  }

  async findGuaranteeExpiringPlacements(now: Date, withinDays: number): Promise<PlacementSummary[]> {
    const horizon = new Date(now.getTime() + withinDays * 86_400_000);
    return (await this.db
      .select(this.summaryCols)
      .from(placements)
      .where(
        and(
          isNotNull(placements.guaranteeEndDate),
          gte(placements.guaranteeEndDate, now),
          lte(placements.guaranteeEndDate, horizon),
          eq(placements.status, "active"),
        ),
      )) as PlacementSummary[];
  }

  async markEventFired(placementId: string, event: PlacementEvent): Promise<boolean> {
    const inserted = await this.db
      .insert(placementNotificationLog)
      .values({ placementId, event } as any)
      .onConflictDoNothing({
        target: [placementNotificationLog.placementId, placementNotificationLog.event],
      })
      .returning({ id: placementNotificationLog.id });
    return Array.isArray(inserted) && inserted.length > 0;
  }
}

/** Human copy per event. Pure — exported for tests. */
export function placementEventCopy(
  event: PlacementEvent,
  p: PlacementSummary,
): { title: string; message: string } {
  const who = p.candidateName?.trim() || "A candidate";
  const role = p.jobTitle ? ` as ${p.jobTitle}` : "";
  const at = p.companyName ? ` at ${p.companyName}` : "";
  switch (event) {
    case "signed":
      return { title: "Placement confirmed", message: `${who} was placed${role}${at}.` };
    case "started":
      return { title: "Placement started", message: `${who}'s placement${at} has started.` };
    case "first_day":
      return { title: "First day today", message: `${who} starts${at} today.` };
    case "guarantee_expires":
      return {
        title: "Guarantee period ending",
        message: `The guarantee period for ${who}'s placement${at} is ending soon.`,
      };
    case "guarantee_met":
      return {
        title: "Guarantee period met",
        message: `${who}'s placement${at} cleared its guarantee period.`,
      };
  }
}

/** Default delivery: the unified dispatcher (bell + opt-in pref-gated email). */
type NotifyFn = typeof emitNotification;

export class PlacementNotificationService {
  constructor(
    private readonly repo: IPlacementNotificationRepository,
    private readonly db: any,
    private readonly notify: NotifyFn = emitNotification,
  ) {}

  subscribe(placementId: string, userId: string, event: PlacementEvent): Promise<void> {
    return this.repo.subscribe(placementId, userId, event);
  }

  unsubscribe(placementId: string, userId: string, event: PlacementEvent): Promise<void> {
    return this.repo.unsubscribe(placementId, userId, event);
  }

  listForPlacement(placementId: string): Promise<PlacementSubscriptionRow[]> {
    return this.repo.listForPlacement(placementId);
  }

  /** Subscribe a user to every event for a placement (used to auto-opt the
   *  owning recruiter in on create so the feature is useful by default). */
  async subscribeAll(placementId: string, userId: string): Promise<void> {
    for (const event of PLACEMENT_EVENTS) {
      await this.repo.subscribe(placementId, userId, event);
    }
  }

  /** Fire a stage event to its subscribers. Best-effort: never throws into
   *  the placement mutation path. */
  async notifyEvent(placementId: string, event: PlacementEvent): Promise<void> {
    const recipientIds = await this.repo.findSubscriberIds(placementId, event);
    if (recipientIds.length === 0) return;
    const placement = await this.repo.getPlacement(placementId);
    if (!placement) return;
    const { title, message } = placementEventCopy(event, placement);
    await this.notify(
      { repos: buildRepos(this.db) },
      {
        recipientIds,
        type: `placement_${event}`,
        actor: null,
        title,
        message,
        url: `/recruiter?tab=placements&placement=${placementId}`,
        email: true,
      },
    );
  }

  /**
   * Daily sweep for the DATE-based stage events. Fires `started` +
   * `first_day` once a placement's startDate is reached and
   * `guarantee_expires` once its guaranteeEndDate is within `withinDays`.
   * Idempotent via the fired-log — safe to run on every /5 cron tick.
   * Returns the count of events actually dispatched.
   */
  async sweepStageEvents(now: Date, withinDays = 7): Promise<number> {
    let fired = 0;
    const fire = async (placementId: string, event: PlacementEvent) => {
      if (await this.repo.markEventFired(placementId, event)) {
        await this.notifyEvent(placementId, event);
        fired += 1;
      }
    };

    for (const p of await this.repo.findStartedPlacements(now)) {
      await fire(p.id, "started");
      await fire(p.id, "first_day");
    }
    for (const p of await this.repo.findGuaranteeExpiringPlacements(now, withinDays)) {
      await fire(p.id, "guarantee_expires");
    }
    return fired;
  }
}

/** Factory for route handlers — builds the Drizzle-backed service. */
export function buildPlacementNotificationService(db: any): PlacementNotificationService {
  return new PlacementNotificationService(new PlacementNotificationRepository(db), db);
}
