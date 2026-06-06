import type { Db } from "../db/client.js";
import { auditEvent } from "../db/schema.js";

export interface AuditEventInput {
  kind: string;
  caregiverId?: string | null;
  partnerId?: string | null;
  findId?: string | null;
  payload: { v: number } & Record<string, unknown>;
}

export async function logAuditEvent(db: Db, evt: AuditEventInput): Promise<void> {
  await db.insert(auditEvent).values({
    kind: evt.kind,
    caregiverId: evt.caregiverId ?? null,
    partnerId: evt.partnerId ?? null,
    findId: evt.findId ?? null,
    payload: JSON.stringify(evt.payload),
  });
}
