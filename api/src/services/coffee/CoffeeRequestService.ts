/**
 * CoffeeRequestService — "Grab a coffee" lifecycle.
 *
 *   1. create()   → coffee_requests row, status='pending'. Notifies recipient.
 *   2. respond()  → 'accepted' creates scheduled_events row (type='coffee'),
 *                   two event_attendees rows (requester + recipient),
 *                   one tasks row owned by requester with source_event_id,
 *                   one shared_task_participants row for recipient.
 *                   'declined' just sets status + responseMessage.
 *   3. cancel()   → requester can cancel a pending request.
 *
 * On acceptance both users see the meetup on their Tasks/Events tab as
 * shared accountability (per project_studio_workspaces.md pattern for
 * multi-actor transactional writes).
 *
 * Visibility gating (open-to-coffee profile section) is enforced at the
 * route layer, not here — the service handles the write contract; route
 * decides whether the requester is even allowed to ask.
 */
import type { ApiDeps } from "../apiDeps.js";
import type {
  CreateCoffeeRequestInput,
  RespondCoffeeRequestInput,
} from "../../../../shared/coffee.js";
import { defaultCoffeeTaskTitle } from "../../../../shared/coffee.js";
import type {
  CoffeeRequestRow,
} from "../../repositories/coffeeRequestsRepository.js";
import { schema } from "../../db/index.js";
import { emitNotification, resolveActor } from "../notifications/notificationService.js";
import { and, eq } from "drizzle-orm";

export type CoffeeDeps = Pick<ApiDeps, "repos" | "now"> & {
  /** Direct db handle for the "ensure default board exists" lookup —
   *  the BoardsRepository hasn't been extracted yet, so we go straight
   *  to schema. Keep this seam tight; extract a real repo if a second
   *  caller appears. */
  db?: any;
};

export interface CoffeeAcceptResult {
  request: CoffeeRequestRow;
  eventId: string;
  taskId: string;
}

export class CoffeeRequestService {
  constructor(private readonly deps: CoffeeDeps) {}

  async create(
    requesterUserId: string,
    input: CreateCoffeeRequestInput,
  ): Promise<CoffeeRequestRow | { error: "self" | "duplicate" }> {
    if (requesterUserId === input.recipientUserId) return { error: "self" };

    const existing = await this.deps.repos.coffeeRequests.findPendingBetween(
      requesterUserId,
      input.recipientUserId,
    );
    if (existing) return { error: "duplicate" };

    const expiresAt = new Date(this.deps.now().getTime() + input.expiresInDays * 24 * 60 * 60 * 1000);

    const row = await this.deps.repos.coffeeRequests.insert({
      requesterUserId,
      recipientUserId: input.recipientUserId,
      message: input.message ?? null,
      proposedAt: input.proposedAt ? new Date(input.proposedAt) : null,
      proposedLocation: input.proposedLocation ?? null,
      proposedFormat: input.proposedFormat,
      expiresAt,
      status: "pending",
    });

    const requester = await this.deps.repos.users.findById(requesterUserId);
    const requesterName = this.displayName(requester) ?? "Someone";
    const { actor } = await resolveActor(this.deps, requesterUserId);
    await emitNotification(this.deps, {
      recipientIds: [input.recipientUserId],
      type: "coffee_request_received",
      actor,
      title: `${requesterName} wants to grab coffee`,
      message: input.message?.slice(0, 240) ?? `${requesterName} sent you a coffee invite.`,
      target: { id: row.id, type: "coffee_request" },
      extraData: { coffeeRequestId: row.id, requesterUserId },
    });

    return row;
  }

  async respond(
    requestId: string,
    actingUserId: string,
    input: RespondCoffeeRequestInput,
  ): Promise<CoffeeAcceptResult | { error: "not_found" | "forbidden" | "already_responded" } | null> {
    const req = await this.deps.repos.coffeeRequests.findById(requestId);
    if (!req) return { error: "not_found" };
    if (req.recipientUserId !== actingUserId) return { error: "forbidden" };
    if (req.status !== "pending") return { error: "already_responded" };

    if (input.action === "decline") {
      const updated = await this.deps.repos.coffeeRequests.update(requestId, {
        status: "declined",
        respondedAt: this.deps.now(),
        responseMessage: input.responseMessage ?? null,
      });

      const { actor } = await resolveActor(this.deps, actingUserId);
      await emitNotification(this.deps, {
        recipientIds: [req.requesterUserId],
        type: "coffee_request_declined",
        actor,
        title: "Coffee invite declined",
        message: input.responseMessage?.slice(0, 240) ?? "Your coffee invite was declined.",
        target: { id: requestId, type: "coffee_request" },
        extraData: { coffeeRequestId: requestId },
      });

      return { request: updated!, eventId: "", taskId: "" };
    }

    // ─── Accept: writes (a) scheduled_events, (b) attendees x2, (c) task,
    //               (d) shared_task_participants, (e) coffee_requests update.
    // Coordinated as a sequence; Drizzle on neon-http does not expose
    // long-lived transactions to user code today. Failure between writes
    // leaves the most recent write committed — the unique-pair index on
    // coffee_requests prevents re-accept, and the slug+attendee uniqueness
    // prevent double inserts when the route is retried.

    const finalAt = input.confirmedAt ? new Date(input.confirmedAt) : req.proposedAt ?? null;
    if (!finalAt) {
      return { error: "not_found" }; // treat as 400; route translates the shape
    }
    const finalLocation = input.confirmedLocation ?? req.proposedLocation ?? null;
    const finalFormat = (input.confirmedFormat ?? req.proposedFormat) as "in_person" | "remote";

    const requester = await this.deps.repos.users.findById(req.requesterUserId);
    const recipient = await this.deps.repos.users.findById(req.recipientUserId);
    const requesterName = this.displayName(requester);
    const recipientName = this.displayName(recipient);

    // 30-minute default block for the meetup.
    const startAt = finalAt;
    const endAt = new Date(startAt.getTime() + 30 * 60 * 1000);

    const event = await this.deps.repos.events.insert({
      userId: req.requesterUserId,
      hostUserId: req.requesterUserId,
      title: `Coffee with ${recipientName ?? "your match"}`,
      description: req.message ?? null,
      startAt,
      endAt,
      type: "coffee",
      visibility: "private",
      eventFormat: finalFormat === "remote" ? "remote" : "in_person",
      location: finalLocation,
      category: "coffee",
      capacity: 2,
      allowsPlusOnes: false,
      requiresApproval: false,
      matchmakingEnabled: false,
      attendees: [],
      syncedToCalendar: false,
      status: "confirmed",
    });

    await this.deps.repos.events.upsertAttendee({
      eventId: event.id,
      userId: req.requesterUserId,
      rsvpStatus: "going",
      approvalStatus: "approved",
    });
    await this.deps.repos.events.upsertAttendee({
      eventId: event.id,
      userId: req.recipientUserId,
      rsvpStatus: "going",
      approvalStatus: "approved",
    });
    await this.deps.repos.events.bumpAttendeeCount(event.id, +2);

    // Shared accountability task owned by the requester, with the
    // recipient added as a participant — both see it on their tab.
    const boardId = await this.ensureDefaultBoard(req.requesterUserId);
    const task = await this.deps.repos.coffeeRequests.insertTask({
      boardId,
      userId: req.requesterUserId,
      title: defaultCoffeeTaskTitle(requesterName, recipientName),
      description: finalLocation
        ? `Meetup at ${finalLocation}`
        : `Coffee meetup with ${recipientName ?? "your match"}`,
      status: "todo",
      priority: "medium",
      dueDate: startAt,
      sourceEventId: event.id,
      metadata: { coffeeRequestId: requestId, eventId: event.id } as any,
    });

    await this.deps.repos.coffeeRequests.insertParticipant({
      taskId: task.id,
      userId: req.recipientUserId,
      role: "participant",
      addedBy: req.requesterUserId,
      acceptedAt: this.deps.now(),
    });

    const updated = await this.deps.repos.coffeeRequests.update(requestId, {
      status: "accepted",
      respondedAt: this.deps.now(),
      responseMessage: input.responseMessage ?? null,
      acceptedEventId: event.id,
    });

    const { actor: recipientActor } = await resolveActor(this.deps, req.recipientUserId);
    await emitNotification(this.deps, {
      recipientIds: [req.requesterUserId],
      type: "coffee_request_accepted",
      actor: recipientActor,
      title: `${recipientName ?? "Your match"} accepted your coffee invite`,
      message: finalLocation
        ? `${startAt.toLocaleString()} at ${finalLocation}.`
        : startAt.toLocaleString(),
      target: { id: requestId, type: "coffee_request" },
      extraData: { coffeeRequestId: requestId, eventId: event.id, taskId: task.id },
    });

    return { request: updated!, eventId: event.id, taskId: task.id };
  }

  async cancel(requestId: string, actingUserId: string): Promise<boolean> {
    const req = await this.deps.repos.coffeeRequests.findById(requestId);
    if (!req) return false;
    if (req.requesterUserId !== actingUserId) return false;
    if (req.status !== "pending") return false;

    await this.deps.repos.coffeeRequests.update(requestId, {
      status: "cancelled",
      respondedAt: this.deps.now(),
    });
    return true;
  }

  // ─── Helpers ───────────────────────────────────────────────────────

  /** First-touch board creation. Tasks.tsx + routes/task.ts use the same
   *  "default board" convention (one per user, lazily created on first
   *  task). Mirror it here so the coffee-accept task lands on the right
   *  board even if the user has never opened Tasks. */
  private async ensureDefaultBoard(userId: string): Promise<string> {
    const { boards } = schema;
    const db = this.deps.db;
    if (!db) {
      throw new Error(
        "CoffeeRequestService requires `db` in its deps to ensure a default board. Wire CoffeeService({ ...buildApiDeps(env), db: getDb() }).",
      );
    }
    const [existing] = await db
      .select({ id: boards.id })
      .from(boards)
      .where(and(eq(boards.userId, userId), eq(boards.isArchived, false)))
      .limit(1);
    if (existing) return (existing as any).id;
    const [row] = await db
      .insert(boards)
      .values({ userId, name: "Tasks", description: null, isArchived: false } as any)
      .returning();
    return (row as any).id;
  }

  private displayName(user: any): string | null {
    if (!user) return null;
    return (
      user?.profile?.displayName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.email ||
      null
    );
  }
}
