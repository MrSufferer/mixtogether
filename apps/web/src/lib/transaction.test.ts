import { describe, expect, it } from "vitest";
import { assertSuccessfulReceipt, friendlyWalletError, transactionHashOf } from "./transaction";

const hash = `0x${"ab".repeat(32)}` as const;

describe("transaction feedback", () => {
  it("extracts hashes from direct and receipt-backed results", () => {
    expect(transactionHashOf(hash)).toBe(hash);
    expect(transactionHashOf({ hash })).toBe(hash);
    expect(transactionHashOf({ txHash: hash, hash: `0x${"cd".repeat(32)}` })).toBe(hash);
    expect(transactionHashOf({ txHash: hash, receipt: { transactionHash: `0x${"cd".repeat(32)}` } })).toBe(hash);
    expect(transactionHashOf({ receipt: { transactionHash: hash } })).toBe(hash);
    expect(transactionHashOf({ transaction: { hash } })).toBe(hash);
    expect(transactionHashOf({ txHash: "0x1234", receipt: { transactionHash: hash } })).toBe(hash);
    expect(transactionHashOf({ hash: "0x1234" })).toBeUndefined();
  });

  it("turns expected wallet and draw failures into actionable copy", () => {
    expect(friendlyWalletError("User rejected the request")).toBe(
      "Wallet request cancelled.",
    );
    expect(friendlyWalletError("execution reverted: RegistryFull()")).toContain(
      "64-saver registry",
    );
    expect(friendlyWalletError("execution reverted: WrongPhase(1, 2)")).toContain(
      "draw advanced",
    );
    expect(friendlyWalletError("relayer request failed")).toContain(
      "temporarily unavailable",
    );
    expect(friendlyWalletError("The transaction was included but reverted.")).toContain(
      "reverted onchain",
    );
  });

  it("rejects viem and numeric reverted receipts while allowing success", () => {
    expect(() => assertSuccessfulReceipt({ status: "success", transactionHash: hash })).not.toThrow();
    expect(() => assertSuccessfulReceipt({ status: 1, hash })).not.toThrow();
    expect(() => assertSuccessfulReceipt(undefined)).not.toThrow();
    expect(() => assertSuccessfulReceipt({ status: "reverted", transactionHash: hash })).toThrow(
      /included but reverted/,
    );
    try {
      assertSuccessfulReceipt({ status: 0, transactionHash: hash });
      throw new Error("expected reverted receipt to throw");
    } catch (cause) {
      expect(cause).toBeInstanceOf(Error);
      expect(transactionHashOf(cause)).toBe(hash);
    }
  });
});
