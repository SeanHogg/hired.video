import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const boards = pgTable("boards", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 50 }),
  isArchived: boolean("is_archived").default(false).notNull(),
  // #1612 — canonical soft-delete timestamp, added in migration 0154.
  // Backfilled from is_archived; reads should prefer this column going
  // forward via the shared `services/db/soft-delete.ts` helper.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Nullable since migration 0186 — CHRO action items (segment-scoped) have
    // no personal board. Personal kanban tasks still always have a board.
    boardId: uuid("board_id").references(() => boards.id, { onDelete: "cascade" }),
    // The OWNER for personal tasks; the CREATOR (host user) for CHRO rows.
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 50 }).default("todo").notNull(),
    priority: varchar("priority", { length: 50 }).default("medium").notNull(),
    position: integer("position").default(0).notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    labels: jsonb("labels").default([]),
    metadata: jsonb("metadata"),
    // Back-reference to the scheduled_event that created this task (coffee
    // acceptance creates one). Cascading SET NULL on event delete so the
    // task survives an event cancellation as a manual follow-up.
    sourceEventId: uuid("source_event_id"),
    // ── CHRO People-Ops action items (migration 0186) ──────────────────────
    // When segmentId IS NOT NULL this row is a segment-scoped CHRO action item,
    // NOT a personal task. Personal-task queries MUST filter `segment_id IS
    // NULL` (and these reads filter on segment) so the two never bleed. FKs to
    // people_* are added in the migration to keep this file decoupled from the
    // people-ops schema.
    tenantId: uuid("tenant_id"),
    segmentId: uuid("segment_id"),
    assigneeEmployeeId: uuid("assignee_employee_id"), // → people_employees.id
    oneOnOneId: uuid("one_on_one_id"), // → people_one_on_ones.id
    // one_on_one | meeting | sync | milestone | review | interview | manual
    sourceType: varchar("source_type", { length: 16 }),
    // ── Gig marketplace work items (migration 0209) ────────────────────────
    // When gigProjectId IS NOT NULL this personal task was materialised from
    // an awarded gig deliverable (gig_milestones row). The task is owned by
    // the winning creator (userId) so it surfaces on their normal Tasks page
    // AND the Content Creator → Gigs board. gigMilestoneId links 1:1 back to
    // the escrow milestone so completing the task advances the gig. The
    // gig poster reads progress by querying tasks on gigProjectId (any owner).
    gigProjectId: uuid("gig_project_id"),
    gigMilestoneId: uuid("gig_milestone_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // "My tasks across all boards" dashboard query.
    index("idx_tasks_user_status").on(t.userId, t.status, t.dueDate),
    // Board kanban view — reads ordered slices per (board, status) column.
    index("idx_tasks_board_status_position").on(t.boardId, t.status, t.position),
    // CHRO action-item inbox per segment.
    index("idx_tasks_segment_status").on(t.segmentId, t.status),
    index("idx_tasks_one_on_one").on(t.oneOnOneId),
    // Gig poster's progress query — all work items for one gig, any owner.
    index("idx_tasks_gig_project").on(t.gigProjectId),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

// Shared task participants — N-user accountability on a task. The task's
// own `userId` is the owner; rows here are additional collaborators.
// Both owner and any 'participant' row may mark the task complete.
// Coffee acceptance writes one row here with role='participant' so the
// recipient sees the meetup on their Tasks tab too.
export const sharedTaskParticipants = pgTable("shared_task_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: uuid("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 16 }).default("participant").notNull(), // participant | viewer
  addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type SharedTaskParticipant = typeof sharedTaskParticipants.$inferSelect;
export type NewSharedTaskParticipant = typeof sharedTaskParticipants.$inferInsert;
