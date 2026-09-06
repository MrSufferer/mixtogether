import { expect } from "chai";
import {
  encodeFundingMode,
  validateSmokeConfig,
  FUNDING_MODE_DEPOSIT,
  FUNDING_MODE_PRIZE,
} from "../scripts/smoke-sepolia";

describe("smoke-sepolia helpers", function () {
  it("encodes funding mode 1 (DEPOSIT) as abi-encoded uint8", function () {
    const encoded = encodeFundingMode(FUNDING_MODE_DEPOSIT);
    expect(encoded).to.equal(
      "0x0000000000000000000000000000000000000000000000000000000000000001",
    );
  });

  it("encodes funding mode 2 (PRIZE) as abi-encoded uint8", function () {
    const encoded = encodeFundingMode(FUNDING_MODE_PRIZE);
    expect(encoded).to.equal(
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    );
  });

  it("fails closed when POOL_ADDRESS is missing", function () {
    expect(() =>
      validateSmokeConfig({
        DEPLOYER_PRIVATE_KEY:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      }),
    ).to.throw("POOL_ADDRESS is required");
  });

  it("fails closed when DEPLOYER_PRIVATE_KEY is missing", function () {
    expect(() =>
      validateSmokeConfig({
        POOL_ADDRESS: "0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97",
      }),
    ).to.throw("DEPLOYER_PRIVATE_KEY is required");
  });

  it("resolves valid smoke configuration", function () {
    const config = validateSmokeConfig({
      POOL_ADDRESS: "0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97",
      DEPLOYER_PRIVATE_KEY:
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      SEPOLIA_RPC_URL: "https://custom.rpc",
    });
    expect(config.poolAddress).to.equal(
      "0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97",
    );
    expect(config.deployerKey).to.equal(
      "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    );
    expect(config.rpcUrl).to.equal("https://custom.rpc");
  });
});
