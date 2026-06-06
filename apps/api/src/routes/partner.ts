import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { asc, eq } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { MintBatchRequest } from "@app/schemas";
import type { Db } from "../db/client.js";
import { tag, tagBatch } from "../db/schema.js";
import { generateCodes } from "../codes/generate.js";
import { mintCsvToken, splitCsvToken, hashCsvSecret } from "../codes/csv-token.js";
import { logAuditEvent } from "../audit/log.js";
import { makeApiKeyMiddleware } from "../auth/api-key.js";

const CHUNK_SIZE = 1000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface PartnerRouterOpts {
  db: Db;
  pepper: string;
}

export function partnerRouter(opts: PartnerRouterOpts) {
  const router = new Hono().use("*", makeApiKeyMiddleware({ db: opts.db, pepper: opts.pepper }));

  router.post(
    "/batches",
    zValidator("json", MintBatchRequest),
    async (c) => {
      const partnerId = c.get("partnerId");
      const { size, label } = c.req.valid("json");
      const codes = generateCodes(size);
      const result = await opts.db.transaction(async (tx) => {
        const [batch] = await tx
          .insert(tagBatch)
          .values({ partnerId, size, label: label ?? null })
          .returning();
        for (let i = 0; i < codes.length; i += CHUNK_SIZE) {
          const chunk = codes.slice(i, i + CHUNK_SIZE).map((code) => ({
            code,
            partnerId,
            batchId: batch!.id,
          }));
          await tx.insert(tag).values(chunk);
        }
        const minted = mintCsvToken(batch!.id);
        const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
        await tx
          .update(tagBatch)
          .set({ csvTokenHash: minted.hash, csvTokenExpiresAt: expiresAt })
          .where(eq(tagBatch.id, batch!.id));
        await logAuditEvent(tx, {
          kind: "partner.batch.minted",
          partnerId,
          payload: { v: 1, batchId: batch!.id, partnerId, size, label: label ?? null },
        });
        return { batchId: batch!.id, token: minted.token, expiresAt };
      });
      return c.json(
        {
          batchId: result.batchId,
          size,
          downloadUrl: `/partner/batches/${result.batchId}/codes.csv?token=${result.token}`,
          expiresAt: result.expiresAt.toISOString(),
        },
        201,
      );
    },
  );

  router.get("/batches/:id/codes.csv", async (c) => {
    const partnerId = c.get("partnerId");
    const batchId = c.req.param("id");
    const tokenStr = c.req.query("token");
    if (!tokenStr) return c.json({ error: "missing_token" }, 401);
    const split = splitCsvToken(tokenStr);
    if (!split || split.batchId !== batchId) return c.json({ error: "bad_token" }, 401);

    const consumed = await opts.db.transaction(async (tx) => {
      const rows = await tx.select().from(tagBatch).where(eq(tagBatch.id, batchId)).limit(1);
      const batch = rows[0];
      if (!batch || batch.partnerId !== partnerId) return { status: 404 as const };
      if (!batch.csvTokenHash || !batch.csvTokenExpiresAt) return { status: 410 as const };
      if (batch.csvTokenExpiresAt.getTime() < Date.now()) return { status: 410 as const };
      const expected = Buffer.from(batch.csvTokenHash, "hex");
      const got = Buffer.from(hashCsvSecret(split.secret), "hex");
      if (expected.length !== got.length || !timingSafeEqual(expected, got)) {
        return { status: 401 as const };
      }
      await tx
        .update(tagBatch)
        .set({ csvTokenHash: null, csvDownloadedAt: new Date() })
        .where(eq(tagBatch.id, batchId));
      await logAuditEvent(tx, {
        kind: "partner.batch.csv_downloaded",
        partnerId,
        payload: { v: 1, batchId, partnerId },
      });
      return { status: 200 as const };
    });

    if (consumed.status !== 200) return c.json({ error: "unavailable" }, consumed.status);

    const codes = await opts.db
      .select({ code: tag.code })
      .from(tag)
      .where(eq(tag.batchId, batchId))
      .orderBy(asc(tag.code));

    const body = codes.map((r) => r.code).join("\n") + "\n";
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="batch-${batchId}.csv"`,
      },
    });
  });

  return router;
}
