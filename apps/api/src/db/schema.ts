import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const partnerStatus = pgEnum("partner_status", ["active", "suspended"]);
export const partnerUserRole = pgEnum("partner_user_role", ["admin", "member"]);
export const tagState = pgEnum("tag_state", ["unactivated", "active", "revoked"]);

export const partner = pgTable("partner", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  billingEmail: text("billing_email").notNull(),
  status: partnerStatus("status").notNull().default("active"),
  settings: text("settings").default("{}").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const partnerUser = pgTable(
  "partner_user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id").notNull().references(() => partner.id),
    email: text("email").notNull(),
    role: partnerUserRole("role").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => ({ emailUnique: unique("partner_user_email_unique").on(t.email) }),
);

export const partnerApiKey = pgTable(
  "partner_api_key",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    partnerId: uuid("partner_id").notNull().references(() => partner.id),
    keyPrefix: text("key_prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    label: text("label").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({ keyPrefixIdx: index("partner_api_key_prefix_idx").on(t.keyPrefix) }),
);

export const tagBatch = pgTable("tag_batch", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id").notNull().references(() => partner.id),
  size: integer("size").notNull(),
  label: text("label"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  csvTokenHash: text("csv_token_hash"),
  csvTokenExpiresAt: timestamp("csv_token_expires_at", { withTimezone: true }),
  csvDownloadedAt: timestamp("csv_downloaded_at", { withTimezone: true }),
});

export const tag = pgTable(
  "tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    partnerId: uuid("partner_id").notNull().references(() => partner.id),
    batchId: uuid("batch_id").notNull().references(() => tagBatch.id),
    state: tagState("state").notNull().default("unactivated"),
    protectedPersonId: uuid("protected_person_id"),
    caregiverId: uuid("caregiver_id"),
    label: text("label"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => ({
    codeUnique: unique("tag_code_unique").on(t.code),
    partnerBatchStateIdx: index("tag_partner_batch_state_idx").on(t.partnerId, t.batchId, t.state),
  }),
);

export const auditEvent = pgTable("audit_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  caregiverId: uuid("caregiver_id"),
  partnerId: uuid("partner_id"),
  findId: uuid("find_id"),
  kind: text("kind").notNull(),
  payload: text("payload").notNull().default("{}"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

export const schema = {
  partner,
  partnerUser,
  partnerApiKey,
  tagBatch,
  tag,
  auditEvent,
};

export const enablePostgis = sql`CREATE EXTENSION IF NOT EXISTS postgis;`;
