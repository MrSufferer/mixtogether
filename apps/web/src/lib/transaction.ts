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
  return message.split("\n")[0].slice(0, 180);
}
