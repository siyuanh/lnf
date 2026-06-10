import { z } from "zod";

export const MAX_BATCH_SIZE = 10_000;

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
  // Codes are only inlined on the partner-portal session endpoint (the portal
  // renders QR previews + a client-side zip from this list). The headless
  // /api/partner-api flow omits them — partners using curl should fetch the
  // single-use CSV via downloadUrl.
  codes: z.array(z.string()).optional(),
});
export type MintBatchResponse = z.infer<typeof MintBatchResponse>;
