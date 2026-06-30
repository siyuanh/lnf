import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";

export const partnerStatus = pgEnum("partner_status", ["active", "suspended"]);
export const partnerUserRole = pgEnum("partner_user_role", ["admin", "member"]);
// Lifecycle: inactive (minted, not yet seen) → active (manufacturer scan flipped
// it on the finder URL) → registered (caregiver paired the tag in the app) →
// deprecated (retired). registered/deprecated transitions are stubbed — UI
// surfaces them but no flow writes them yet.
export const tagState = pgEnum("tag_state", ["inactive", "active", "registered", "deprecated"]);
export const findLocationKind = pgEnum("find_location_kind", ["gps", "address"]);

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
  (t) => [unique("partner_user_email_unique").on(t.email)],
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
  (t) => [
    // UNIQUE not just INDEX: the middleware does a single-row lookup by prefix
    // and constant-time-compares the secret hash. With 40 bits of prefix space,
    // collisions are improbable but not impossible — without UNIQUE, a colliding
    // mint would silently render one of the two keys unfindable. UNIQUE makes
    // the rare collision a loud insert error so the mint can retry.
    unique("partner_api_key_prefix_unique").on(t.keyPrefix),
  ],
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

export const caregiver = pgTable("caregiver", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .unique("caregiver_user_id_unique")
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const protectedPerson = pgTable(
  "protected_person",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caregiverId: uuid("caregiver_id").notNull().references(() => caregiver.id),
    nickname: text("nickname").notNull(),
    publicNote: text("public_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [index("protected_person_caregiver_idx").on(t.caregiverId)],
);

export const tag = pgTable(
  "tag",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull(),
    partnerId: uuid("partner_id").notNull().references(() => partner.id),
    batchId: uuid("batch_id").notNull().references(() => tagBatch.id),
    state: tagState("state").notNull().default("inactive"),
    protectedPersonId: uuid("protected_person_id").references(() => protectedPerson.id),
    caregiverId: uuid("caregiver_id").references(() => caregiver.id),
    label: text("label"),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    deprecatedAt: timestamp("deprecated_at", { withTimezone: true }),
  },
  (t) => [
    unique("tag_code_unique").on(t.code),
    index("tag_partner_batch_state_idx").on(t.partnerId, t.batchId, t.state),
  ],
);

// find: a stranger's report on a registered tag. Created unauthenticated from
// /f/<code>; per requirements §5.4 the finder may submit either GPS or a typed
// address (never both). Personal contact + message are optional and free-form.
export const find = pgTable(
  "find",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tagId: uuid("tag_id").notNull().references(() => tag.id),
    locationKind: findLocationKind("location_kind").notNull(),
    // GPS path: latitude/longitude are stored as text to avoid precision drift
    // and to keep ourselves free of PostGIS for v1; accuracy in meters.
    lat: text("lat"),
    lon: text("lon"),
    accuracyM: integer("accuracy_m"),
    // Address path: free text typed by the finder.
    addressText: text("address_text"),
    finderMessage: text("finder_message"),
    finderContact: text("finder_contact"),
    // SHA-256 of finder IP + a server-side salt; used by §5.7 false-positive
    // throttling. Stored opaque so nothing reverses to an IP.
    finderFingerprint: text("finder_fingerprint"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("find_tag_idx").on(t.tagId, t.createdAt)],
);

/**
 * audit_event is intentionally a flat log with NO foreign keys on caregiver_id /
 * partner_id / find_id. Audit must outlive subject deletion: under LGPD an
 * account-deletion request cascades the user's records, but the audit trail of
 * what happened (mint counts, downloads, key rotations) must remain. Adding FKs
 * here would either break account-deletion or force CASCADE — both wrong.
 *
 * payload is jsonb so future kinds can be queried via `payload->'v'` etc.;
 * every payload object carries a top-level `v: <integer>` per spec S1-5,
 * and per-kind shapes live in packages/schemas/src/audit/*.v<N>.ts.
 */
export const auditEvent = pgTable("audit_event", {
  id: uuid("id").primaryKey().defaultRandom(),
  caregiverId: uuid("caregiver_id"),
  partnerId: uuid("partner_id"),
  findId: uuid("find_id"),
  kind: text("kind").notNull(),
  payload: jsonb("payload").notNull().default({}),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
});

// Better-Auth managed tables — Better-Auth owns rows; partner_user joins via email.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  name: text("name"),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  providerId: text("provider_id").notNull(),
  accountId: text("account_id").notNull(),
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  scope: text("scope"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schema = {
  partner,
  partnerUser,
  partnerApiKey,
  tagBatch,
  tag,
  caregiver,
  protectedPerson,
  find,
  auditEvent,
  user,
  account,
  session,
  verification,
};

export const enablePostgis = sql`CREATE EXTENSION IF NOT EXISTS postgis;`;
