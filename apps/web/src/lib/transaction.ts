import type { Hex } from "viem";

const HASH = /^0x[0-9a-fA-F]{64}$/;

/** Finds a transaction hash in the common viem and Zama SDK result shapes. */
export function transactionHashOf(value: unknown): Hex | undefined {
  if (typeof value === "string" && HASH.test(value)) return value as Hex;
  if (!value || typeof value !== "object") return undefined;

  const record = value as Record<string, unknown>;
  for (const key of ["txHash", "hash", "transactionHash"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && HASH.test(candidate)) {
      return candidate as Hex;
    }
  }
  return transactionHashOf(record.receipt) ?? transactionHashOf(record.transaction);
}

/** viem inclusion is not success; a reverted receipt must not be treated as confirmed. */
export function assertSuccessfulReceipt(receipt: unknown): void {
  if (!receipt || typeof receipt !== "object") return;
  const status = (receipt as { status?: unknown }).status;
  if (status === "reverted" || status === 0 || status === 0n || status === "0x0") {
    const error = new Error("The transaction was included but reverted.");
    (error as Error & { hash?: Hex }).hash = transactionHashOf(receipt);
    throw error;
  }
}

export function friendlyWalletError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("user rejected") || normalized.includes("user denied")) {
    return "Wallet request cancelled.";
  }
  if (normalized.includes("insufficient")) {
    return "The selected balance or gas is insufficient.";
  }
  if (normalized.includes("registryfull") || normalized.includes("registry full")) {
    return "The 64-saver registry is full. Try again after an exited slot is pruned.";
  }
  if (normalized.includes("epochended") || normalized.includes("wrongphase")) {
    return "The draw advanced while this request was open. Refresh and try the current action.";
  }
  if (normalized.includes("allowance") || normalized.includes("approval")) {
    return "Approve the exact public USDC amount before shielding.";
  }
  if (normalized.includes("relayer") || normalized.includes("kms")) {
    return "The confidential network is temporarily unavailable. Your onchain funds are unchanged.";
  }
  if (normalized.includes("reverted") || normalized.includes("included but reverted")) {
    return "The transaction reverted onchain. Nothing was transferred; try the current action again.";
  }
  return message.split("\n")[0].slice(0, 180);
}
