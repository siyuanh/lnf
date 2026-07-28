import { z } from "zod";

export const FindExpiredV1 = z.object({
  v: z.literal(1),
  findId: z.string().uuid(),
  attemptsCount: z.number().int().nonnegative(),
});
export type FindExpiredV1 = z.infer<typeof FindExpiredV1>;
