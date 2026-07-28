import { z } from "zod";

export const ChannelKind = z.enum(["push", "email", "sms", "voice"]);
export type ChannelKind = z.infer<typeof ChannelKind>;

export const FindStatus = z.enum([
  "reported",
  "acknowledged",
  "claimed",
  "resolved",
  "false_positive",
  "expired",
]);
export type FindStatus = z.infer<typeof FindStatus>;

// Caregiver-facing find summary (GET /api/caregiver/finds).
export const CaregiverFindSummary = z.object({
  id: z.string().uuid(),
  tagCode: z.string(),
  status: FindStatus,
  locationKind: z.enum(["gps", "address"]),
  lat: z.string().nullable(),
  lon: z.string().nullable(),
  addressText: z.string().nullable(),
  finderMessage: z.string().nullable(),
  finderContact: z.string().nullable(),
  createdAt: z.string(), // ISO
  collapsedCount: z.number().int().nonnegative(),
});
export type CaregiverFindSummary = z.infer<typeof CaregiverFindSummary>;
