import { expect } from "chai";
import {
  validateEightSlotConfig,
  formatSlotReceipt,
  SLOT_DEPOSIT_AMOUNT,
} from "../scripts/smoke-eight-slots";

describe("smoke-eight-slots helpers", function () {
  it("enforces 1 USDC (1_000_000n) constant per test slot", function () {
    expect(SLOT_DEPOSIT_AMOUNT).to.equal(1_000_000n);
  });

  it("fails closed when POOL_ADDRESS is missing", function () {
    expect(() =>
      validateEightSlotConfig({
        DEPLOYER_PRIVATE_KEY:
          "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      }),
    ).to.throw("POOL_ADDRESS is required");
  });

  it("fails closed when DEPLOYER_PRIVATE_KEY is missing", function () {
    expect(() =>
      validateEightSlotConfig({
        POOL_ADDRESS: "0x29713643C62C6743a5BF68e39Ac1De8EAEC0bC97",
      }),
    ).to.throw("DEPLOYER_PRIVATE_KEY is required");
  });

  it("formats batch execution receipts cleanly", function () {
    const formatted = formatSlotReceipt("accrual", {
      drawId: 2n,
      blockNumber: 11644020,
      gasUsed: 850000n,
      hash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    });
    expect(formatted.operation).to.equal("accrual");
    expect(formatted.drawId).to.equal("2");
    expect(formatted.blockNumber).to.equal(11644020);
    expect(formatted.gasUsed).to.equal("850000");
    expect(formatted.hash).to.equal(
      "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
    );
  });
});
