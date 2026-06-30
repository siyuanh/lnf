export { PartnerBatchMintedV1 } from "./partner.batch.minted.v1.js";
export { FindCreatedV1 } from "./find.created.v1.js";

export const AuditKinds = {
  partnerBatchMinted: "partner.batch.minted",
  partnerBatchCsvDownloaded: "partner.batch.csv_downloaded",
  partnerApiKeyCreated: "partner.api_key.created",
  partnerApiKeyRevoked: "partner.api_key.revoked",
  findCreated: "find.created",
} as const;

export type AuditKind = (typeof AuditKinds)[keyof typeof AuditKinds];
