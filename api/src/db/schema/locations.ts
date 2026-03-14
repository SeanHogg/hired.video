import {
  pgTable,
  uuid,
  text,
  varchar,
  boolean,
  timestamp,
  serial,
  char,
} from "drizzle-orm/pg-core";

export const countries = pgTable("countries", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  iso2: char("iso2", { length: 2 }).notNull().unique(),
  iso3: char("iso3", { length: 3 }).unique(),
  phoneCode: varchar("phone_code", { length: 20 }),
  currency: varchar("currency", { length: 10 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Country = typeof countries.$inferSelect;
export type NewCountry = typeof countries.$inferInsert;

export const stateProvinces = pgTable("state_provinces", {
  id: uuid("id").primaryKey().defaultRandom(),
  countryId: serial("country_id").notNull().references(() => countries.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  code: varchar("code", { length: 10 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StateProvince = typeof stateProvinces.$inferSelect;
export type NewStateProvince = typeof stateProvinces.$inferInsert;

export const cities = pgTable("cities", {
  id: uuid("id").primaryKey().defaultRandom(),
  stateId: uuid("state_id").notNull().references(() => stateProvinces.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  latitude: varchar("latitude", { length: 20 }),
  longitude: varchar("longitude", { length: 20 }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type City = typeof cities.$inferSelect;
export type NewCity = typeof cities.$inferInsert;

export const postalZipCodes = pgTable("postal_zip_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  cityId: uuid("city_id").references(() => cities.id, { onDelete: "set null" }),
  code: varchar("code", { length: 20 }).notNull(),
  latitude: varchar("latitude", { length: 20 }),
  longitude: varchar("longitude", { length: 20 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type PostalZipCode = typeof postalZipCodes.$inferSelect;
export type NewPostalZipCode = typeof postalZipCodes.$inferInsert;
