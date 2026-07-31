import { z } from "zod";

export const CaregiverExportedDataV1 = z.object({
  v: z.literal(1),
  caregiverId: z.string().uuid(),
});
export type CaregiverExportedDataV1 = z.infer<typeof CaregiverExportedDataV1>;
