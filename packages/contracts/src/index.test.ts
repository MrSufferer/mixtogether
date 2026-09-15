import { describe, expect, test } from "vitest";
import { COMPACT_PROFILE, CONTRACT_COMPONENTS } from "./index";

describe("Shroudly Compact release profile", () => {
  test("contains exactly the four native contract components", () => {
    expect(CONTRACT_COMPONENTS).toEqual([
      "TmixAsset",
      "RandomnessThreshold",
      "YieldAdapter",
      "PrizePool",
    ]);
  });

  test("pins the reviewed Preprod compatibility set", () => {
    expect(COMPACT_PROFILE).toMatchObject({
      language: "0.5.1",
      compiler: "0.31.1",
      runtime: "0.16.0",
      midnightJs: "4.1.1",
      walletSdk: "1.2.0",
      dappConnector: "4.0.1",
      node: "1.0.2",
      indexer: "4.3.3-hotfix",
      proofServer: "8.1.0",
    });
  });
});
