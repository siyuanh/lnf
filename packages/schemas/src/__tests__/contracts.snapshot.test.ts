import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  FindSubmitRequest,
  FindSubmitResponse,
  MintBatchRequest,
  MintBatchResponse,
  PartnerBatchMintedV1,
  ChannelKind,
  FindStatus,
  CaregiverFindSummary,
  FindAcknowledgedV1,
  FindExpiredV1,
} from "../index.js";
import { FindCreatedV1 } from "../audit/find.created.v1.js";

describe("contracts (privacy boundaries)", () => {
  it("MintBatchRequest", () => {
    expect(zodToJsonSchema(MintBatchRequest)).toMatchSnapshot();
  });
  it("MintBatchResponse", () => {
    expect(zodToJsonSchema(MintBatchResponse)).toMatchSnapshot();
  });
  it("PartnerBatchMintedV1", () => {
    expect(zodToJsonSchema(PartnerBatchMintedV1)).toMatchSnapshot();
  });
  it("FindSubmitRequest", () => {
    expect(zodToJsonSchema(FindSubmitRequest)).toMatchSnapshot();
  });
  it("FindSubmitResponse", () => {
    expect(zodToJsonSchema(FindSubmitResponse)).toMatchSnapshot();
  });
  it("FindCreatedV1", () => {
    expect(zodToJsonSchema(FindCreatedV1)).toMatchSnapshot();
  });
  it("ChannelKind", () => {
    expect(zodToJsonSchema(ChannelKind)).toMatchSnapshot();
  });
  it("FindStatus", () => {
    expect(zodToJsonSchema(FindStatus)).toMatchSnapshot();
  });
  it("CaregiverFindSummary", () => {
    expect(zodToJsonSchema(CaregiverFindSummary)).toMatchSnapshot();
  });
  it("FindAcknowledgedV1", () => {
    expect(zodToJsonSchema(FindAcknowledgedV1)).toMatchSnapshot();
  });
  it("FindExpiredV1", () => {
    expect(zodToJsonSchema(FindExpiredV1)).toMatchSnapshot();
  });
});
