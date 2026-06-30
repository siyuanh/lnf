import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  FindSubmitRequest,
  FindSubmitResponse,
  MintBatchRequest,
  MintBatchResponse,
  PartnerBatchMintedV1,
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
});
