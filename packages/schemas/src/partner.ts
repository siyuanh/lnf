import { z } from "zod";

export const MAX_BATCH_SIZE = 100_000;

export const MintBatchRequest = z.object({
  size: z.number().int().positive().max(MAX_BATCH_SIZE),
  label: z.string().max(120).optional(),
});
export type MintBatchRequest = z.infer<typeof MintBatchRequest>;

export const MintBatchResponse = z.object({
  batchId: z.string().uuid(),
  size: z.number().int().positive(),
  downloadUrl: z.string(),
  expiresAt: z.string().datetime(),
});
export type MintBatchResponse = z.infer<typeof MintBatchResponse>;
