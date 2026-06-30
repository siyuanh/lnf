import { z } from "zod";

// Free-text contact slot — the requirement is "phone or email", but we don't
// enforce shape here. Just bound length and trim; partner-side normalization
// can come later.
const FinderContact = z.string().min(1).max(120).optional();
const FinderMessage = z.string().max(200).optional();

// GPS: stored as strings to keep DB representation stable, but validated as
// numbers at the boundary. accuracyM is whatever navigator.geolocation gave.
const GpsLocation = z.object({
  kind: z.literal("gps"),
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
  accuracyM: z.number().nonnegative().optional(),
});

const AddressLocation = z.object({
  kind: z.literal("address"),
  text: z.string().min(1).max(200),
});

export const FindSubmitRequest = z.object({
  location: z.discriminatedUnion("kind", [GpsLocation, AddressLocation]),
  message: FinderMessage,
  contact: FinderContact,
});
export type FindSubmitRequest = z.infer<typeof FindSubmitRequest>;

export const FindSubmitResponse = z.object({
  findId: z.string().uuid(),
});
export type FindSubmitResponse = z.infer<typeof FindSubmitResponse>;
