import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { MintBatchRequest } from "@app/schemas";
import type { Db } from "../db/client.js";
import { tag, tagBatch } from "../db/schema.js";
import { generateCodes } from "../codes/generate.js";
import { mintCsvToken } from "../codes/csv-token.js";
import { logAuditEvent } from "../audit/log.js";
import { makeApiKeyMiddleware } from "../auth/api-key.js";

const CHUNK_SIZE = 1000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface PartnerRouterOpts {
  db: Db;
  pepper: string;
}

export function partnerRouter(opts: PartnerRouterOpts) {
  return new Hono()
    .use("*", makeApiKeyMiddleware({ db: opts.db, pepper: opts.pepper }))
    .post(
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
}
