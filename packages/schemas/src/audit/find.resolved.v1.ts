import { z } from "zod";

export const FindResolvedV1 = z.object({
  v: z.literal(1),
  findId: z.string().uuid(),
});
export type FindResolvedV1 = z.infer<typeof FindResolvedV1>;
