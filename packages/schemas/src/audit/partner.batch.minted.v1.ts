import { z } from "zod";

export const PartnerBatchMintedV1 = z.object({
  v: z.literal(1),
  batchId: z.string().uuid(),
  partnerId: z.string().uuid(),
  size: z.number().int().positive(),
  label: z.string().nullable(),
});

export type PartnerBatchMintedV1 = z.infer<typeof PartnerBatchMintedV1>;
