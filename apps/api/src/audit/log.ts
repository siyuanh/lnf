import type { DbExecutor } from "../db/client.js";
import type { AuditKind } from "@app/schemas";
import { auditEvent } from "../db/schema.js";

export interface AuditEventInput {
  kind: AuditKind;
  caregiverId?: string | null;
  partnerId?: string | null;
  findId?: string | null;
  payload: { v: number } & Record<string, unknown>;
}

export async function logAuditEvent(db: DbExecutor, evt: AuditEventInput): Promise<void> {
  await db.insert(auditEvent).values({
    kind: evt.kind,
    caregiverId: evt.caregiverId ?? null,
    partnerId: evt.partnerId ?? null,
    findId: evt.findId ?? null,
    payload: evt.payload,
  });
}
