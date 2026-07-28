import { z } from "zod";

export const FindAcknowledgedV1 = z.object({
  v: z.literal(1),
  findId: z.string().uuid(),
  channelKind: z.enum(["push", "email", "sms", "voice", "app"]),
  attemptId: z.string().uuid().nullable(),
});
export type FindAcknowledgedV1 = z.infer<typeof FindAcknowledgedV1>;
