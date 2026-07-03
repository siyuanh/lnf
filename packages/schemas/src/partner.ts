import { z } from "zod";

export const MAX_BATCH_SIZE = 10_000;

export const TagState = z.enum(["inactive", "active", "registered", "deprecated"]);
export type TagState = z.infer<typeof TagState>;

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

export const TagSummary = z.object({
  code: z.string(),
  state: TagState,
  activatedAt: z.string().datetime().nullable(),
  deprecatedAt: z.string().datetime().nullable(),
});
export type TagSummary = z.infer<typeof TagSummary>;

export const BatchDetailResponse = z.object({
  batch: z.object({
    id: z.string().uuid(),
    size: z.number().int().nonnegative(),
    label: z.string().nullable(),
    createdAt: z.string().datetime(),
    csvDownloadedAt: z.string().datetime().nullable(),
  }),
  tags: z.array(TagSummary),
  nextCursor: z.string().nullable(),
});
export type BatchDetailResponse = z.infer<typeof BatchDetailResponse>;

export const PublicTagStateResponse = z.object({
  state: TagState,
  // Finder-visible details of the person wearing the tag. Only populated for
  // `registered` tags; null otherwise (and never leaks the caregiver's own
  // contact info — finders submit a report, they don't get the phone number).
  personName: z.string().nullable().optional(),
  personDetails: z.string().nullable().optional(),
});
export type PublicTagStateResponse = z.infer<typeof PublicTagStateResponse>;
