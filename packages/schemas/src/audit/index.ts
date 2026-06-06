export { PartnerBatchMintedV1 } from "./partner.batch.minted.v1.js";

export const AuditKinds = {
  partnerBatchMinted: "partner.batch.minted",
  partnerBatchCsvDownloaded: "partner.batch.csv_downloaded",
  partnerApiKeyCreated: "partner.api_key.created",
  partnerApiKeyRevoked: "partner.api_key.revoked",
} as const;

export type AuditKind = (typeof AuditKinds)[keyof typeof AuditKinds];
