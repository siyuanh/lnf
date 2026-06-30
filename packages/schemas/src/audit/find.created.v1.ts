import { z } from "zod";

// Audit payload for a finder submitting a find on a registered tag (§5.4).
// We deliberately do NOT log lat/lon/address/message/contact in the audit
// trail — that's the operational data on `find` itself. The audit log records
// only that *a* find happened, against which tag, with what kind of location
// signal, so it stays useful after a future LGPD purge of the find rows.
export const FindCreatedV1 = z.object({
  v: z.literal(1),
  findId: z.string().uuid(),
  tagCode: z.string(),
  locationKind: z.enum(["gps", "address"]),
});

export type FindCreatedV1 = z.infer<typeof FindCreatedV1>;
