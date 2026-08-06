import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  ContactCreateRequest,
  ContactUpdateRequest,
  PersonCreateRequest,
  TagPairRequest,
} from "@app/schemas";
import type { Db } from "../db/client.js";
import {
  caregiverContact,
  device,
  find,
  notificationAttempt,
  notificationChannel,
  protectedPerson,
  spendLedger,
  tag,
  user,
} from "../db/schema.js";
import { logAuditEvent } from "../audit/log.js";
import { ensureDefaultChannels } from "../notify/channels.js";
import { makeCaregiverSessionMiddleware } from "../auth/caregiver-session.js";
import type { Auth } from "../auth/better-auth.js";

export interface CaregiverRouterOpts {
  db: Db;
  auth: Auth;
}

// Maps a raw snake_case find+tag row (GET /finds) into the shared
// CaregiverFindSummary contract shape (camelCase, ISO createdAt).
// §5.6: the finder's contact is revealed to the caregiver only after
// acknowledgement — pre-ack rows (reported/expired/false_positive) null it out.
const CONTACT_VISIBLE: ReadonlySet<string> = new Set(["acknowledged", "claimed", "resolved"]);

function toCaregiverFindSummary(r: Record<string, unknown>) {
  const createdAt = r["created_at"];
  const status = r["status"] as "reported" | "acknowledged" | "claimed" | "resolved" | "false_positive" | "expired";
  return {
    id: r["id"] as string,
    tagCode: r["tag_code"] as string,
    status,
    locationKind: r["location_kind"] as "gps" | "address",
    lat: (r["lat"] as string | null) ?? null,
    lon: (r["lon"] as string | null) ?? null,
    addressText: (r["address_text"] as string | null) ?? null,
    finderMessage: (r["finder_message"] as string | null) ?? null,
    finderContact: CONTACT_VISIBLE.has(status) ? ((r["finder_contact"] as string | null) ?? null) : null,
    createdAt: createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
    collapsedCount: r["collapsed_count"] as number,
  };
}

export function caregiverSessionRouter(opts: CaregiverRouterOpts) {
  const r = new Hono().use("*", makeCaregiverSessionMiddleware({ db: opts.db, auth: opts.auth }));

  r.get("/me", (c) =>
    c.json({
      caregiverId: c.get("caregiverId"),
      email: c.get("caregiverEmail"),
    }),
  );

  // §5.6 LGPD: full-fidelity export of everything stored about this caregiver.
  // All rows are the data subject's own — nothing is redacted. Soft-deleted
  // contacts are included with their deletedAt marker for fidelity.
  r.get("/export", async (c) => {
    const caregiverId = c.get("caregiverId");
    const userId = c.get("caregiverUserId");
    const [account] = await opts.db
      .select({ email: user.email, name: user.name, phone: user.phone, createdAt: user.createdAt })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    const contacts = await opts.db.select().from(caregiverContact).where(eq(caregiverContact.caregiverId, caregiverId));
    const people = await opts.db.select().from(protectedPerson).where(eq(protectedPerson.caregiverId, caregiverId));
    const tags = await opts.db.select().from(tag).where(eq(tag.caregiverId, caregiverId));
    const tagIds = tags.map((t) => t.id);
    const finds =
      tagIds.length === 0 ? [] : await opts.db.select().from(find).where(inArray(find.tagId, tagIds));
    const channels = await opts.db.select().from(notificationChannel).where(eq(notificationChannel.caregiverId, caregiverId));
    const devices = await opts.db.select().from(device).where(eq(device.caregiverId, caregiverId));
    const spend = await opts.db.select().from(spendLedger).where(eq(spendLedger.caregiverId, caregiverId));

    await opts.db.transaction(async (tx) => {
      await logAuditEvent(tx, {
        kind: "caregiver.exported_data",
        caregiverId,
        payload: { v: 1, caregiverId },
      });
    });

    const body = {
      v: 1 as const,
      exportedAt: new Date().toISOString(),
      account: account ?? null,
      contacts,
      protectedPersons: people,
      tags,
      finds,
      notificationChannels: channels,
      devices,
      spendLedger: spend,
    };
    return new Response(JSON.stringify(body, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="lnf-export-${body.exportedAt.slice(0, 10)}.json"`,
      },
    });
  });

  // §5.6 LGPD: irreversible account deletion. Password confirmation gates
  // intent; the audit row is written BEFORE the cascade and survives it
  // (audit_event has no FKs by design — the trail outlives the subject).
  r.post(
    "/account/delete",
    zValidator("json", z.object({ password: z.string().min(1) })),
    async (c) => {
      const caregiverId = c.get("caregiverId");
      const userId = c.get("caregiverUserId");
      const email = c.get("caregiverEmail");
      const { password } = c.req.valid("json");

      try {
        await opts.auth.api.signInEmail({ body: { email, password } });
      } catch {
        return c.json({ error: "password_incorrect" }, 403);
      }

      await opts.db.transaction(async (tx) => {
        await logAuditEvent(tx, {
          kind: "caregiver.deleted_account",
          caregiverId,
          payload: { v: 1, caregiverId },
        });
        const tagRows = await tx.select({ id: tag.id }).from(tag).where(eq(tag.caregiverId, caregiverId));
        const tagIds = tagRows.map((t) => t.id);
        if (tagIds.length > 0) {
          const findRows = await tx.select({ id: find.id }).from(find).where(inArray(find.tagId, tagIds));
          const findIds = findRows.map((f) => f.id);
          if (findIds.length > 0) {
            await tx.delete(notificationAttempt).where(inArray(notificationAttempt.findId, findIds));
          }
          await tx.delete(find).where(inArray(find.tagId, tagIds));
        }
        await tx.delete(notificationChannel).where(eq(notificationChannel.caregiverId, caregiverId));
        await tx.delete(spendLedger).where(eq(spendLedger.caregiverId, caregiverId));
        await tx.delete(device).where(eq(device.caregiverId, caregiverId));
        await tx.delete(tag).where(eq(tag.caregiverId, caregiverId));
        // Person before contacts: protected_person.primary/secondary_contact_id
        // FK to caregiver_contact.
        await tx.delete(protectedPerson).where(eq(protectedPerson.caregiverId, caregiverId));
        await tx.delete(caregiverContact).where(eq(caregiverContact.caregiverId, caregiverId));
        // Deleting the Better-Auth user cascades to caregiver, account and
        // session rows — the request's own session dies with it.
        await tx.delete(user).where(eq(user.id, userId));
      });
      return c.json({ ok: true });
    },
  );

  r.get("/people", async (c) => {
    const caregiverId = c.get("caregiverId");
    const rows = await opts.db
      .select()
      .from(protectedPerson)
      .where(and(eq(protectedPerson.caregiverId, caregiverId), isNull(protectedPerson.deletedAt)))
      .orderBy(sql`${protectedPerson.createdAt} desc`);

    // Embed the emergency contacts in one extra query rather than joining per row.
    const contactIds = rows.flatMap((p) =>
      [p.primaryContactId, p.secondaryContactId].filter((x): x is string => x !== null),
    );
    const contactRows = contactIds.length
      ? await opts.db
          .select()
          .from(caregiverContact)
          .where(
            and(
              inArray(caregiverContact.id, contactIds),
              eq(caregiverContact.caregiverId, caregiverId),
              isNull(caregiverContact.deletedAt),
            ),
          )
      : [];
    const contactById = new Map(contactRows.map((r) => [r.id, r]));
    const ref = (id: string | null) => {
      const row = id ? contactById.get(id) : undefined;
      return row
        ? { id: row.id, kind: row.kind, label: row.label, relationship: row.relationship, value: row.value }
        : null;
    };

    return c.json({
      people: rows.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        publicNote: p.publicNote,
        fullName: p.fullName,
        bloodType: p.bloodType,
        medicalConditions: p.medicalConditions,
        allergies: p.allergies,
        medications: p.medications,
        primaryContact: ref(p.primaryContactId),
        secondaryContact: ref(p.secondaryContactId),
        createdAt: p.createdAt.toISOString(),
      })),
    });
  });

  r.post("/people", zValidator("json", PersonCreateRequest), async (c) => {
    const caregiverId = c.get("caregiverId");
    const input = c.req.valid("json");

    // Emergency contacts must be the caregiver's own live contacts.
    const wantedIds = [input.primaryContactId, input.secondaryContactId].filter(
      (x): x is string => x !== undefined,
    );
    if (wantedIds.length > 0) {
      const owned = await opts.db
        .select({ id: caregiverContact.id })
        .from(caregiverContact)
        .where(
          and(
            inArray(caregiverContact.id, wantedIds),
            eq(caregiverContact.caregiverId, caregiverId),
            isNull(caregiverContact.deletedAt),
          ),
        );
      if (owned.length !== new Set(wantedIds).size) {
        return c.json({ error: "contact_not_found" }, 404);
      }
    }

    const inserted = await opts.db.transaction(async (tx) => {
      const rows = await tx
        .insert(protectedPerson)
        .values({
          caregiverId,
          nickname: input.nickname,
          publicNote: input.publicNote ?? null,
          fullName: input.fullName ?? null,
          bloodType: input.bloodType ?? null,
          medicalConditions: input.medicalConditions ?? null,
          allergies: input.allergies ?? null,
          medications: input.medications ?? null,
          primaryContactId: input.primaryContactId ?? null,
          secondaryContactId: input.secondaryContactId ?? null,
        })
        .returning();
      const person = rows[0]!;
      await logAuditEvent(tx, {
        kind: "caregiver.person.created",
        caregiverId,
        payload: { v: 1, caregiverId, protectedPersonId: person.id },
      });
      return person;
    });
    return c.json({ id: inserted.id }, 201);
  });

  // Pair a tag (inactive | active → registered) to one of the caregiver's
  // contacts. Atomic CAS on tag.state so concurrent attempts don't
  // double-register: only the row whose state is still in the allowed set
  // gets updated. Ownership of the contact is enforced up-front — a stolen
  // contactId won't survive the pre-check.
  r.post("/tags/:code/pair", zValidator("json", TagPairRequest), async (c) => {
    const caregiverId = c.get("caregiverId");
    const code = c.req.param("code");
    const input = c.req.valid("json");

    const contactRows = await opts.db
      .select({ id: caregiverContact.id })
      .from(caregiverContact)
      .where(
        and(
          eq(caregiverContact.id, input.contactId),
          eq(caregiverContact.caregiverId, caregiverId),
          isNull(caregiverContact.deletedAt),
        ),
      )
      .limit(1);
    if (!contactRows[0]) return c.json({ error: "contact_not_found" }, 404);

    // Linking a protected person is optional; when present it must be the
    // caregiver's own live person row.
    if (input.protectedPersonId !== undefined) {
      const personRows = await opts.db
        .select({ id: protectedPerson.id })
        .from(protectedPerson)
        .where(
          and(
            eq(protectedPerson.id, input.protectedPersonId),
            eq(protectedPerson.caregiverId, caregiverId),
            isNull(protectedPerson.deletedAt),
          ),
        )
        .limit(1);
      if (!personRows[0]) return c.json({ error: "person_not_found" }, 404);
    }

    const updated = await opts.db
      .update(tag)
      .set({
        state: "registered",
        caregiverId,
        contactId: input.contactId,
        label: input.label ?? null,
        personName: input.personName ?? null,
        personDetails: input.personDetails ?? null,
        protectedPersonId: input.protectedPersonId ?? null,
      })
      .where(and(eq(tag.code, code), inArray(tag.state, ["inactive", "active"])))
      .returning({
        code: tag.code,
        state: tag.state,
        contactId: tag.contactId,
        label: tag.label,
        partnerId: tag.partnerId,
      });

    if (updated.length === 0) {
      const existing = await opts.db
        .select({ state: tag.state })
        .from(tag)
        .where(eq(tag.code, code))
        .limit(1);
      if (!existing[0]) return c.json({ error: "not_found" }, 404);
      return c.json({ error: "conflict", state: existing[0].state }, 409);
    }

    const row = updated[0]!;
    await opts.db.transaction(async (tx) => {
      await logAuditEvent(tx, {
        kind: "tag.registered",
        caregiverId,
        partnerId: row.partnerId,
        payload: {
          v: 1,
          code,
          caregiverId,
          contactId: row.contactId,
          label: row.label,
        },
      });
      // First pair bootstraps the default escalation chain (email → sms → voice)
      // from the account email + first phone contact; idempotent thereafter.
      await ensureDefaultChannels(tx, caregiverId, c.get("caregiverEmail"));
    });

    return c.json({
      code: row.code,
      state: row.state,
      contactId: row.contactId!,
      label: row.label,
    });
  });

  // UC-6: retire a garment. CAS registered → deprecated so a retry or
  // double-click is idempotent; an already-deprecated owned tag returns 200
  // with the current state. The update is scoped by caregiverId, so a tag
  // owned by someone else (or never paired) misses both the update and the
  // fallback lookup → 404, no cross-account existence leak. From here on the
  // public route rejects finds against the tag (409) and the finder page
  // shows the "no longer active" copy — no further notifications.
  r.post("/tags/:code/revoke", async (c) => {
    const caregiverId = c.get("caregiverId");
    const code = c.req.param("code");

    const updated = await opts.db
      .update(tag)
      .set({ state: "deprecated", deprecatedAt: new Date() })
      .where(
        and(eq(tag.code, code), eq(tag.caregiverId, caregiverId), eq(tag.state, "registered")),
      )
      .returning({ code: tag.code, partnerId: tag.partnerId });

    if (updated.length === 0) {
      const existing = await opts.db
        .select({ state: tag.state })
        .from(tag)
        .where(and(eq(tag.code, code), eq(tag.caregiverId, caregiverId)))
        .limit(1);
      if (!existing[0]) return c.json({ error: "not_found" }, 404);
      if (existing[0].state === "deprecated") {
        return c.json({ code, state: "deprecated" as const });
      }
      return c.json({ error: "conflict", state: existing[0].state }, 409);
    }

    await opts.db.transaction(async (tx) => {
      await logAuditEvent(tx, {
        kind: "tag.deprecated",
        caregiverId,
        partnerId: updated[0]!.partnerId,
        payload: { v: 1, code, caregiverId },
      });
    });

    return c.json({ code, state: "deprecated" as const });
  });

  // Open finds for this caregiver's tags, newest first, with collapse counts.
  // ?tag=<code> scopes the history to one tag — in the current model the
  // protected person is tag-scoped (personName on tag), so "history per
  // protected person" (§5.7) maps to a per-tag filter.
  r.get("/finds", async (c) => {
    const caregiverId = c.get("caregiverId");
    const tagCode = c.req.query("tag");
    const rows = await opts.db.execute(
      sql`select f.id, t.code as tag_code, f.status, f.location_kind, f.lat, f.lon,
                 f.address_text, f.finder_message, f.finder_contact, f.created_at,
                 (select count(*)::int from find c2 where c2.is_collapsed_into = f.id) as collapsed_count
          from find f join tag t on t.id = f.tag_id
          where t.caregiver_id = ${caregiverId} and f.is_collapsed_into is null
            ${tagCode ? sql`and t.code = ${tagCode}` : sql``}
          order by f.created_at desc limit 100`,
    );
    return c.json({ finds: rows.map(toCaregiverFindSummary) });
  });

  r.post("/finds/:id/ack", async (c) => {
    const caregiverId = c.get("caregiverId");
    const findId = c.req.param("id");
    // Ownership first (404, not 403, so existence doesn't leak); only a find
    // still `reported` transitions — a repeat ack of an own find is an
    // idempotent ok, never a 404 (plan self-review #2).
    const owned = await opts.db
      .select({ id: find.id, status: find.status })
      .from(find)
      .innerJoin(tag, eq(find.tagId, tag.id))
      .where(and(eq(find.id, findId), eq(tag.caregiverId, caregiverId)))
      .limit(1);
    if (owned.length === 0) return c.json({ error: "not_found" }, 404);
    if (owned[0]!.status === "reported") {
      await opts.db.transaction(async (tx) => {
        await tx
          .update(find)
          .set({ status: "acknowledged", acknowledgedAt: new Date() })
          .where(and(eq(find.id, findId), eq(find.status, "reported")));
        await logAuditEvent(tx, {
          kind: "find.acknowledged",
          caregiverId,
          findId,
          payload: { v: 1, findId, channelKind: "app", attemptId: null },
        });
      });
    }
    return c.json({ ok: true });
  });

  // §5.7 terminal caregiver marks. resolve = person recovered; false-positive =
  // test/malicious scan (its fingerprint is throttled on the public route).
  // Both are terminal-from-anything transitions (an expired find can still be
  // closed by the caregiver) and idempotent: re-marking a closed find is ok.
  // resolved_at doubles as the "caregiver closed at" timestamp for both.
  for (const mark of ["resolve", "false-positive"] as const) {
    r.post(`/finds/:id/${mark}`, async (c) => {
      const caregiverId = c.get("caregiverId");
      const findId = c.req.param("id");
      const owned = await opts.db
        .select({ id: find.id, status: find.status })
        .from(find)
        .innerJoin(tag, eq(find.tagId, tag.id))
        .where(and(eq(find.id, findId), eq(tag.caregiverId, caregiverId)))
        .limit(1);
      if (owned.length === 0) return c.json({ error: "not_found" }, 404);
      const CLOSABLE = ["reported", "acknowledged", "claimed", "expired"];
      if (CLOSABLE.includes(owned[0]!.status)) {
        const resolved = mark === "resolve";
        await opts.db.transaction(async (tx) => {
          await tx
            .update(find)
            .set({ status: resolved ? "resolved" : "false_positive", resolvedAt: new Date() })
            .where(eq(find.id, findId));
          await logAuditEvent(tx, {
            kind: resolved ? "find.resolved" : "find.false_positive",
            caregiverId,
            findId,
            payload: { v: 1, findId },
          });
        });
      }
      return c.json({ ok: true });
    });
  }

  // List the tags this caregiver has registered. Left-joins the linked contact
  // so the list renders in one round trip. Scoped to caregiverId — a caregiver
  // only ever sees tags they own.
  r.get("/tags", async (c) => {
    const caregiverId = c.get("caregiverId");
    const rows = await opts.db
      .select({
        code: tag.code,
        label: tag.label,
        state: tag.state,
        personName: tag.personName,
        activatedAt: tag.activatedAt,
        contactId: caregiverContact.id,
        contactKind: caregiverContact.kind,
        contactLabel: caregiverContact.label,
        contactValue: caregiverContact.value,
      })
      .from(tag)
      .leftJoin(caregiverContact, eq(tag.contactId, caregiverContact.id))
      .where(and(eq(tag.caregiverId, caregiverId), eq(tag.state, "registered")))
      .orderBy(sql`${tag.activatedAt} desc nulls last`);
    return c.json({
      tags: rows.map((t) => ({
        code: t.code,
        label: t.label,
        state: t.state,
        personName: t.personName,
        registeredAt: t.activatedAt ? t.activatedAt.toISOString() : null,
        contact: t.contactId
          ? {
              id: t.contactId,
              kind: t.contactKind!,
              label: t.contactLabel,
              value: t.contactValue!,
            }
          : null,
      })),
    });
  });

  // Detail for one registered tag the caregiver owns. Returns the tag plus its
  // full linked contact. 404 (not 403) when the tag isn't owned by the caller,
  // so tag existence isn't leaked across caregivers.
  r.get("/tags/:code", async (c) => {
    const caregiverId = c.get("caregiverId");
    const code = c.req.param("code");
    const rows = await opts.db
      .select({
        code: tag.code,
        label: tag.label,
        state: tag.state,
        personName: tag.personName,
        personDetails: tag.personDetails,
        activatedAt: tag.activatedAt,
        contactId: caregiverContact.id,
        contactKind: caregiverContact.kind,
        contactLabel: caregiverContact.label,
        contactValue: caregiverContact.value,
        contactCreatedAt: caregiverContact.createdAt,
        contactUpdatedAt: caregiverContact.updatedAt,
      })
      .from(tag)
      .leftJoin(caregiverContact, eq(tag.contactId, caregiverContact.id))
      .where(and(eq(tag.code, code), eq(tag.caregiverId, caregiverId)))
      .limit(1);
    const row = rows[0];
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json({
      code: row.code,
      label: row.label,
      state: row.state,
      personName: row.personName,
      personDetails: row.personDetails,
      registeredAt: row.activatedAt ? row.activatedAt.toISOString() : null,
      contact: row.contactId
        ? {
            id: row.contactId,
            kind: row.contactKind!,
            label: row.contactLabel,
            value: row.contactValue!,
            createdAt: row.contactCreatedAt!.toISOString(),
            updatedAt: row.contactUpdatedAt!.toISOString(),
          }
        : null,
    });
  });

  // Contacts CRUD. Every request is scoped to the caller's caregiver_id — a
  // contact is never addressable across caregivers, so an id lookup that
  // doesn't match caregiverId returns 404 without leaking existence.
  r.get("/contacts", async (c) => {
    const caregiverId = c.get("caregiverId");
    const rows = await opts.db
      .select({
        id: caregiverContact.id,
        kind: caregiverContact.kind,
        label: caregiverContact.label,
        relationship: caregiverContact.relationship,
        value: caregiverContact.value,
        createdAt: caregiverContact.createdAt,
        updatedAt: caregiverContact.updatedAt,
      })
      .from(caregiverContact)
      .where(
        and(
          eq(caregiverContact.caregiverId, caregiverId),
          isNull(caregiverContact.deletedAt),
        ),
      )
      .orderBy(sql`${caregiverContact.createdAt} desc`);
    return c.json({
      contacts: rows.map((r) => ({
        id: r.id,
        kind: r.kind,
        label: r.label,
        relationship: r.relationship,
        value: r.value,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  });

  r.post("/contacts", zValidator("json", ContactCreateRequest), async (c) => {
    const caregiverId = c.get("caregiverId");
    const input = c.req.valid("json");
    const row = await opts.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(caregiverContact)
        .values({
          caregiverId,
          kind: input.kind,
          label: input.label ?? null,
          relationship: input.relationship ?? null,
          value: input.value,
        })
        .returning();
      const c0 = inserted[0]!;
      await logAuditEvent(tx, {
        kind: "caregiver.contact.created",
        caregiverId,
        payload: { v: 1, caregiverId, contactId: c0.id, contactKind: c0.kind },
      });
      return c0;
    });
    return c.json(
      {
        id: row.id,
        kind: row.kind,
        label: row.label,
        relationship: row.relationship,
        value: row.value,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
      201,
    );
  });

  r.patch("/contacts/:id", zValidator("json", ContactUpdateRequest), async (c) => {
    const caregiverId = c.get("caregiverId");
    const id = c.req.param("id");
    const input = c.req.valid("json");
    if (input.label === undefined && input.value === undefined && input.relationship === undefined) {
      return c.json({ error: "no_changes" }, 400);
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.label !== undefined) patch.label = input.label;
    if (input.relationship !== undefined) patch.relationship = input.relationship;
    if (input.value !== undefined) patch.value = input.value;

    const updated = await opts.db.transaction(async (tx) => {
      const rows = await tx
        .update(caregiverContact)
        .set(patch)
        .where(
          and(
            eq(caregiverContact.id, id),
            eq(caregiverContact.caregiverId, caregiverId),
            isNull(caregiverContact.deletedAt),
          ),
        )
        .returning();
      if (rows.length === 0) return null;
      const c0 = rows[0]!;
      await logAuditEvent(tx, {
        kind: "caregiver.contact.updated",
        caregiverId,
        payload: { v: 1, caregiverId, contactId: c0.id },
      });
      return c0;
    });
    if (!updated) return c.json({ error: "not_found" }, 404);
    return c.json({
      id: updated.id,
      kind: updated.kind,
      label: updated.label,
      relationship: updated.relationship,
      value: updated.value,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  });

  r.delete("/contacts/:id", async (c) => {
    const caregiverId = c.get("caregiverId");
    const id = c.req.param("id");
    const deleted = await opts.db.transaction(async (tx) => {
      const rows = await tx
        .update(caregiverContact)
        .set({ deletedAt: new Date() })
        .where(
          and(
            eq(caregiverContact.id, id),
            eq(caregiverContact.caregiverId, caregiverId),
            isNull(caregiverContact.deletedAt),
          ),
        )
        .returning({ id: caregiverContact.id });
      if (rows.length === 0) return null;
      await logAuditEvent(tx, {
        kind: "caregiver.contact.deleted",
        caregiverId,
        payload: { v: 1, caregiverId, contactId: id },
      });
      return rows[0]!;
    });
    if (!deleted) return c.json({ error: "not_found" }, 404);
    return c.body(null, 204);
  });

  return r;
}
