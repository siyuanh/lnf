import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  ContactCreateRequest,
  ContactUpdateRequest,
  PersonCreateRequest,
  TagPairRequest,
} from "@app/schemas";
import type { Db } from "../db/client.js";
import { caregiverContact, protectedPerson, tag } from "../db/schema.js";
import { logAuditEvent } from "../audit/log.js";
import { makeCaregiverSessionMiddleware } from "../auth/caregiver-session.js";
import type { Auth } from "../auth/better-auth.js";

export interface CaregiverRouterOpts {
  db: Db;
  auth: Auth;
}

export function caregiverSessionRouter(opts: CaregiverRouterOpts) {
  const r = new Hono().use("*", makeCaregiverSessionMiddleware({ db: opts.db, auth: opts.auth }));

  r.get("/me", (c) =>
    c.json({
      caregiverId: c.get("caregiverId"),
      email: c.get("caregiverEmail"),
    }),
  );

  r.get("/people", async (c) => {
    const caregiverId = c.get("caregiverId");
    const rows = await opts.db
      .select({
        id: protectedPerson.id,
        nickname: protectedPerson.nickname,
        publicNote: protectedPerson.publicNote,
        createdAt: protectedPerson.createdAt,
      })
      .from(protectedPerson)
      .where(and(eq(protectedPerson.caregiverId, caregiverId), isNull(protectedPerson.deletedAt)))
      .orderBy(sql`${protectedPerson.createdAt} desc`);
    return c.json({
      people: rows.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        publicNote: p.publicNote,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  });

  r.post("/people", zValidator("json", PersonCreateRequest), async (c) => {
    const caregiverId = c.get("caregiverId");
    const input = c.req.valid("json");
    const inserted = await opts.db.transaction(async (tx) => {
      const rows = await tx
        .insert(protectedPerson)
        .values({
          caregiverId,
          nickname: input.nickname,
          publicNote: input.publicNote ?? null,
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
    return c.json(
      {
        id: inserted.id,
        nickname: inserted.nickname,
        publicNote: inserted.publicNote,
        createdAt: inserted.createdAt.toISOString(),
      },
      201,
    );
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

    const updated = await opts.db
      .update(tag)
      .set({
        state: "registered",
        caregiverId,
        contactId: input.contactId,
        label: input.label ?? null,
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
    });

    return c.json({
      code: row.code,
      state: row.state,
      contactId: row.contactId!,
      label: row.label,
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
    if (input.label === undefined && input.value === undefined) {
      return c.json({ error: "no_changes" }, 400);
    }
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (input.label !== undefined) patch.label = input.label;
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
