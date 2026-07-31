import { z } from "zod";

export const CaregiverDeletedAccountV1 = z.object({
  v: z.literal(1),
  caregiverId: z.string().uuid(),
});
export type CaregiverDeletedAccountV1 = z.infer<typeof CaregiverDeletedAccountV1>;
