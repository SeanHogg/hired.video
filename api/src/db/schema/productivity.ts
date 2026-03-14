import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  jsonb,
  integer,
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

export const tasks = pgTable("tasks", {
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
