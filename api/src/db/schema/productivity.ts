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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Board = typeof boards.$inferSelect;
export type NewBoard = typeof boards.$inferInsert;

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    boardId: uuid("board_id").notNull().references(() => boards.id, { onDelete: "cascade" }),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // "My tasks across all boards" dashboard query.
    index("idx_tasks_user_status").on(t.userId, t.status, t.dueDate),
    // Board kanban view — reads ordered slices per (board, status) column.
    index("idx_tasks_board_status_position").on(t.boardId, t.status, t.position),
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
