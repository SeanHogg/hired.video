/**
 * People-Ops domain events → activity audit + inbox notifications.
 *
 * Roster mutations (add/promote/remove), 1:1 scheduling, and action-item
 * assignment are the high-signal People-Ops actions. Phase 1 wrote neither an
 * audit trail nor a notification, so an employee never learned their 1:1 was
 * booked and the company had no "who changed the roster" record (gap #1824).
 *
 * This module is the single seam that closes that: the service emits a
 * `PeopleOpsEvent`; the default sink fans it out to BOTH canonical paths —
 *   • `audit.insertActivity(...)`  → the `activity_logs` feed (append-only)
 *   • `emitNotification(...)`       → the unified inbox/bell
 *
 * Both are FIRE-AND-FORGET by contract (per AuditRepository + the warm-intro
 * precedent in services/graph): a failed audit/notify MUST NOT block — or
 * surface from — the mutation that triggered it. `emit()` therefore returns
 * `void` and does all its work (incl. recipient resolution) in a detached
 * task, so the request path never waits on it.
 */

import type { IAuditRepository } from "../../repositories/auditRepository.js";
import type {
  IPeopleEmployeesRepository,
  SegmentScope,
} from "../../repositories/peopleEmployeesRepository.js";
import {
  emitNotification,
  resolveActor,
  type NotificationServiceDeps,
} from "../../services/notifications/notificationService.js";

/** Scope + actor every People-Ops event is emitted under. `actorUserId` is the
 *  CHRO user performing the action (null only when emitted by the system). */
export interface PeopleOpsEventContext {
  actorUserId?: string | null;
  scope: SegmentScope;
  companyId: string;
}

/**
 * Discriminated union of the auditable/notifiable People-Ops mutations.
 *
 * Employee-row events carry a pre-snapshotted `recipientUserId` (the service
 * holds the row at emit time — free, and required for `removed` since the row
 * is already gone by the time the detached task runs). 1:1 / action-item
 * events carry employee ids the sink resolves to user ids against the live
 * (still-existing) rows.
 */
export type PeopleOpsEvent =
  | {
      kind: "employee_added";
      employeeId: string;
      recipientUserId: string | null;
      employeeName: string;
    }
  | {
      kind: "employee_promoted";
      employeeId: string;
      recipientUserId: string | null;
      employeeName: string;
      /** Human-readable changed fields, e.g. ["position", "manager"]. */
      changes: string[];
    }
  | {
      kind: "employee_removed";
      employeeId: string;
      employeeName: string;
    }
  | {
      kind: "one_on_one_scheduled";
      oneOnOneId: string;
      supervisorEmployeeId: string;
      participantEmployeeId: string;
      scheduledDate: string;
    }
  | {
      kind: "action_items_assigned";
      oneOnOneId: string;
      assigneeEmployeeIds: string[];
      count: number;
    };

/** The seam the service depends on. `emit` never throws and never blocks. */
export interface PeopleOpsEventSink {
  emit(ctx: PeopleOpsEventContext, event: PeopleOpsEvent): void;
}

/** Used in tests and whenever no audit/notify wiring is supplied. */
export const noopPeopleOpsEventSink: PeopleOpsEventSink = { emit() {} };

export interface PeopleOpsEventSinkDeps {
  audit: IAuditRepository;
  /** `repos.users` + `repos.notifications` for the notification path. */
  notify: NotificationServiceDeps;
  /** Resolves roster employee ids → linked platform user ids (segment-scoped). */
  employees: IPeopleEmployeesRepository;
  /** Detaches the work from the request path; overridable for deterministic tests. */
  runDetached?: (task: () => Promise<void>) => void;
}

/** Map each event kind to its audit `action` + the inbox `type`. Kept short:
 *  `activity_logs.action` is varchar(100). */
const AUDIT_ACTION: Record<PeopleOpsEvent["kind"], string> = {
  employee_added: "people_employee_added",
  employee_promoted: "people_employee_promoted",
  employee_removed: "people_employee_removed",
  one_on_one_scheduled: "people_one_on_one_scheduled",
  action_items_assigned: "people_action_items_assigned",
};

function defaultRunDetached(task: () => Promise<void>): void {
  void task().catch((err) => console.error("[people-ops:events] sink failed:", err));
}

/**
 * Default sink: audit + notify, both off the request path. Resolution of
 * 1:1 / action-item recipients reads the (live) roster rows lazily inside the
 * detached task, so nothing is read synchronously on the mutation path.
 */
export function createPeopleOpsEventSink(deps: PeopleOpsEventSinkDeps): PeopleOpsEventSink {
  const run = deps.runDetached ?? defaultRunDetached;

  /** Resolve roster employee ids → distinct linked user ids (skips placeholders). */
  const resolveUserIds = async (
    scope: SegmentScope,
    employeeIds: string[],
  ): Promise<string[]> => {
    const distinct = [...new Set(employeeIds.filter(Boolean))];
    // ONE inArray lookup (was a findById per employee). Preserve the input
    // order of `distinct` so recipient ordering is unchanged.
    const rows = await deps.employees.findManyByIds(scope, distinct);
    const userIdByEmployee = new Map(rows.map((r) => [r.id, r.userId]));
    return [
      ...new Set(
        distinct.map((id) => userIdByEmployee.get(id)).filter((id): id is string => !!id),
      ),
    ];
  };

  return {
    emit(ctx, event) {
      run(async () => {
        // (a) Audit — always, for every kind.
        const { recipientUserIds, metadata, entityId } = await plan(event, ctx, resolveUserIds);
        await deps.audit.insertActivity({
          userId: ctx.actorUserId ?? null,
          action: AUDIT_ACTION[event.kind],
          entityType: event.kind === "employee_added" ||
            event.kind === "employee_promoted" ||
            event.kind === "employee_removed"
            ? "people_employee"
            : "people_one_on_one",
          entityId,
          metadata: { ...metadata, companyId: ctx.companyId, segmentId: ctx.scope.segmentId },
        });

        // (b) Notify — only when there's someone to tell.
        if (recipientUserIds.length === 0) return;
        const { actor } = ctx.actorUserId
          ? await resolveActor(deps.notify, ctx.actorUserId)
          : { actor: null };
        const n = notificationFor(event);
        await emitNotification(deps.notify, {
          recipientIds: recipientUserIds,
          type: n.type,
          actor,
          title: n.title,
          message: n.message,
          target: n.target,
          extraData: { companyId: ctx.companyId },
        });
      });
    },
  };
}

/** Per-event audit metadata + entity id + resolved notification recipients. */
async function plan(
  event: PeopleOpsEvent,
  ctx: PeopleOpsEventContext,
  resolveUserIds: (scope: SegmentScope, ids: string[]) => Promise<string[]>,
): Promise<{ recipientUserIds: string[]; metadata: Record<string, unknown>; entityId: string }> {
  switch (event.kind) {
    case "employee_added":
      return {
        entityId: event.employeeId,
        metadata: { employeeName: event.employeeName },
        recipientUserIds: event.recipientUserId ? [event.recipientUserId] : [],
      };
    case "employee_promoted":
      return {
        entityId: event.employeeId,
        metadata: { employeeName: event.employeeName, changes: event.changes },
        recipientUserIds: event.recipientUserId ? [event.recipientUserId] : [],
      };
    case "employee_removed":
      // Removal is audited but not notified (telling someone they were removed
      // is poor UX; the audit trail is the record that matters).
      return {
        entityId: event.employeeId,
        metadata: { employeeName: event.employeeName },
        recipientUserIds: [],
      };
    case "one_on_one_scheduled":
      return {
        entityId: event.oneOnOneId,
        metadata: { scheduledDate: event.scheduledDate },
        recipientUserIds: await resolveUserIds(ctx.scope, [
          event.participantEmployeeId,
          event.supervisorEmployeeId,
        ]),
      };
    case "action_items_assigned":
      return {
        entityId: event.oneOnOneId,
        metadata: { count: event.count },
        recipientUserIds: await resolveUserIds(ctx.scope, event.assigneeEmployeeIds),
      };
  }
}

/** Inbox copy per event kind. Title is recipient-facing. */
function notificationFor(event: PeopleOpsEvent): {
  type: string;
  title: string;
  message: string;
  target: { id: string; type: string };
} {
  switch (event.kind) {
    case "employee_added":
      return {
        type: "people_roster_added",
        title: "You were added to the team roster",
        message: "An admin added you to your company's People Ops roster.",
        target: { id: event.employeeId, type: "people_employee" },
      };
    case "employee_promoted":
      return {
        type: "people_role_changed",
        title: "Your role was updated",
        message: `An admin updated your ${formatChanges(event.changes)}.`,
        target: { id: event.employeeId, type: "people_employee" },
      };
    case "one_on_one_scheduled":
      return {
        type: "people_one_on_one_scheduled",
        title: "A 1:1 was scheduled with you",
        message: "A new 1:1 session has been booked. Check your People Ops calendar.",
        target: { id: event.oneOnOneId, type: "people_one_on_one" },
      };
    case "action_items_assigned":
      return {
        type: "people_action_item_assigned",
        title:
          event.count === 1
            ? "You were assigned an action item"
            : `You were assigned ${event.count} action items`,
        message: "New action items from a 1:1 are waiting in your queue.",
        target: { id: event.oneOnOneId, type: "people_one_on_one" },
      };
    case "employee_removed":
      // Never notified (see plan()); copy is unreachable but keeps the union total.
      return {
        type: "people_roster_removed",
        title: "Roster updated",
        message: "Your roster membership changed.",
        target: { id: event.employeeId, type: "people_employee" },
      };
  }
}

function formatChanges(changes: string[]): string {
  if (changes.length === 0) return "role";
  if (changes.length === 1) return changes[0];
  return `${changes.slice(0, -1).join(", ")} and ${changes[changes.length - 1]}`;
}
