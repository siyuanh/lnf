import { describe, it, expect } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { MintBatchRequest, MintBatchResponse, PartnerBatchMintedV1 } from "../index.js";

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
});
