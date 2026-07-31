export { PartnerBatchMintedV1 } from "./partner.batch.minted.v1.js";
export { FindCreatedV1 } from "./find.created.v1.js";
export { FindAcknowledgedV1 } from "./find.acknowledged.v1.js";
export { FindExpiredV1 } from "./find.expired.v1.js";
export { FindResolvedV1 } from "./find.resolved.v1.js";
export { FindFalsePositiveV1 } from "./find.false_positive.v1.js";
export { CaregiverExportedDataV1 } from "./caregiver.exported_data.v1.js";
export { CaregiverDeletedAccountV1 } from "./caregiver.deleted_account.v1.js";

export const AuditKinds = {
  partnerBatchMinted: "partner.batch.minted",
  partnerBatchCsvDownloaded: "partner.batch.csv_downloaded",
  partnerApiKeyCreated: "partner.api_key.created",
  partnerApiKeyRevoked: "partner.api_key.revoked",
  findCreated: "find.created",
  findAcknowledged: "find.acknowledged",
  findExpired: "find.expired",
  findResolved: "find.resolved",
  findFalsePositive: "find.false_positive",
  tagActivated: "tag.activated",
  tagRegistered: "tag.registered",
  caregiverSignup: "caregiver.signup",
  caregiverPersonCreated: "caregiver.person.created",
  caregiverContactCreated: "caregiver.contact.created",
  caregiverContactUpdated: "caregiver.contact.updated",
  caregiverContactDeleted: "caregiver.contact.deleted",
  caregiverExportedData: "caregiver.exported_data",
  caregiverDeletedAccount: "caregiver.deleted_account",
} as const;

export type AuditKind = (typeof AuditKinds)[keyof typeof AuditKinds];
