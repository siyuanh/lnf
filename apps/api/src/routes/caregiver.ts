import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { PersonCreateRequest, TagPairRequest } from "@app/schemas";
import type { Db } from "../db/client.js";
import { protectedPerson, tag } from "../db/schema.js";
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

  // Pair a tag (inactive | active → registered). Atomic CAS so concurrent
  // attempts don't double-register: only the row whose state is still in the
  // allowed set gets updated.
  r.post("/tags/:code/pair", zValidator("json", TagPairRequest), async (c) => {
    const caregiverId = c.get("caregiverId");
    const code = c.req.param("code");
    const input = c.req.valid("json");

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

    const updated = await opts.db
      .update(tag)
      .set({
        state: "registered",
        caregiverId,
        protectedPersonId: input.protectedPersonId,
        label: input.label ?? null,
      })
      .where(and(eq(tag.code, code), inArray(tag.state, ["inactive", "active"])))
      .returning({
        code: tag.code,
        state: tag.state,
        protectedPersonId: tag.protectedPersonId,
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
          protectedPersonId: row.protectedPersonId,
          label: row.label,
        },
      });
    });

    return c.json({
      code: row.code,
      state: row.state,
      protectedPersonId: row.protectedPersonId!,
      label: row.label,
    });
  });

  return r;
}
