import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { asc, eq, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { MintBatchRequest } from "@app/schemas";
import type { Db } from "../db/client.js";
import { tag, tagBatch } from "../db/schema.js";
import { generateCodes } from "../codes/generate.js";
import { mintCsvToken, splitCsvToken, hashCsvSecret } from "../codes/csv-token.js";
import { logAuditEvent } from "../audit/log.js";
import { makeApiKeyMiddleware } from "../auth/api-key.js";
import { makePartnerSessionMiddleware } from "../auth/session.js";
import type { Auth } from "../auth/better-auth.js";

const CHUNK_SIZE = 1000;
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export interface PartnerRouterOpts {
  db: Db;
  pepper: string;
}

export interface PartnerSessionRouterOpts extends PartnerRouterOpts {
  auth: Auth;
}

interface MintResult {
  batchId: string;
  token: string;
  expiresAt: Date;
}

interface MintInput {
  size: number;
  label?: string;
}

async function mintBatch(opts: PartnerRouterOpts, partnerId: string, input: MintInput): Promise<MintResult> {
  const codes = generateCodes(input.size);
  return opts.db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(tagBatch)
      .values({ partnerId, size: input.size, label: input.label ?? null })
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
      payload: { v: 1, batchId: batch!.id, partnerId, size: input.size, label: input.label ?? null },
    });
    return { batchId: batch!.id, token: minted.token, expiresAt };
  });
}

function toMintResponse(result: MintResult, size: number, urlPrefix: string) {
  return {
    batchId: result.batchId,
    size,
    downloadUrl: `${urlPrefix}/batches/${result.batchId}/codes.csv?token=${result.token}`,
    expiresAt: result.expiresAt.toISOString(),
  };
}

async function consumeCsvToken(opts: PartnerRouterOpts, partnerId: string, batchId: string, secret: string) {
  return opts.db.transaction(async (tx) => {
    const rows = await tx.select().from(tagBatch).where(eq(tagBatch.id, batchId)).limit(1);
    const batch = rows[0];
    if (!batch || batch.partnerId !== partnerId) return { status: 404 as const };
    if (!batch.csvTokenHash || !batch.csvTokenExpiresAt) return { status: 410 as const };
    if (batch.csvTokenExpiresAt.getTime() < Date.now()) return { status: 410 as const };
    const expected = Buffer.from(batch.csvTokenHash, "hex");
    const got = Buffer.from(hashCsvSecret(secret), "hex");
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
}

async function streamBatchCsv(opts: PartnerRouterOpts, batchId: string): Promise<Response> {
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
}

export function partnerApiRouter(opts: PartnerRouterOpts) {
  const r = new Hono().use("*", makeApiKeyMiddleware({ db: opts.db, pepper: opts.pepper }));

  r.post("/batches", zValidator("json", MintBatchRequest), async (c) => {
    const partnerId = c.get("partnerId");
    const input = c.req.valid("json");
    const result = await mintBatch(opts, partnerId, input);
    return c.json(toMintResponse(result, input.size, "/partner-api"), 201);
  });

  r.get("/batches/:id/codes.csv", async (c) => {
    const partnerId = c.get("partnerId");
    const batchId = c.req.param("id");
    const tokenStr = c.req.query("token");
    if (!tokenStr) return c.json({ error: "missing_token" }, 401);
    const split = splitCsvToken(tokenStr);
    if (!split || split.batchId !== batchId) return c.json({ error: "bad_token" }, 401);
    const consumed = await consumeCsvToken(opts, partnerId, batchId, split.secret);
    if (consumed.status !== 200) return c.json({ error: "unavailable" }, consumed.status);
    return streamBatchCsv(opts, batchId);
  });

  return r;
}

export function partnerSessionRouter(opts: PartnerSessionRouterOpts) {
  const r = new Hono().use("*", makePartnerSessionMiddleware({ db: opts.db, auth: opts.auth }));

  r.get("/me", (c) => c.json({ partnerId: c.get("partnerId"), partnerUserId: c.get("partnerUserId") }));

  r.get("/batches", async (c) => {
    const partnerId = c.get("partnerId");
    const rows = await opts.db
      .select({
        id: tagBatch.id,
        size: tagBatch.size,
        label: tagBatch.label,
        createdAt: tagBatch.createdAt,
        csvDownloadedAt: tagBatch.csvDownloadedAt,
      })
      .from(tagBatch)
      .where(eq(tagBatch.partnerId, partnerId))
      .orderBy(sql`${tagBatch.createdAt} desc`);
    return c.json({ batches: rows });
  });

  r.post("/batches", zValidator("json", MintBatchRequest), async (c) => {
    const partnerId = c.get("partnerId");
    const input = c.req.valid("json");
    const result = await mintBatch(opts, partnerId, input);
    return c.json(toMintResponse(result, input.size, "/partner"), 201);
  });

  r.get("/batches/:id/codes.csv", async (c) => {
    const partnerId = c.get("partnerId");
    const batchId = c.req.param("id");
    const tokenStr = c.req.query("token");
    if (!tokenStr) return c.json({ error: "missing_token" }, 401);
    const split = splitCsvToken(tokenStr);
    if (!split || split.batchId !== batchId) return c.json({ error: "bad_token" }, 401);
    const consumed = await consumeCsvToken(opts, partnerId, batchId, split.secret);
    if (consumed.status !== 200) return c.json({ error: "unavailable" }, consumed.status);
    return streamBatchCsv(opts, batchId);
  });

  return r;
}
