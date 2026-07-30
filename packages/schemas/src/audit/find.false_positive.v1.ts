import { z } from "zod";

export const FindFalsePositiveV1 = z.object({
  v: z.literal(1),
  findId: z.string().uuid(),
});
export type FindFalsePositiveV1 = z.infer<typeof FindFalsePositiveV1>;
