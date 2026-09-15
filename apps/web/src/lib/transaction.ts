import type { Hex } from "./midnight/types";

const HASH = /^0x[0-9a-fA-F]{64}$/;
export function transactionHashOf(value: unknown): Hex | undefined {
  if (typeof value === "string" && HASH.test(value)) return value as Hex;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of ["transactionId", "txHash", "hash", "transactionHash"]) { const candidate = record[key]; if (typeof candidate === "string" && HASH.test(candidate)) return candidate as Hex; }
  return transactionHashOf(record.receipt) ?? transactionHashOf(record.transaction);
}

export function assertSuccessfulReceipt(receipt: unknown): void {
  if (!receipt || typeof receipt !== "object") return;
  const status = (receipt as { status?: unknown }).status;
  if (status === "reverted" || status === 0 || status === 0n || status === "0x0") { const error = new Error("The transaction was included but reverted.") as Error & { hash?: Hex }; error.hash = transactionHashOf(receipt); throw error; }
}

export function friendlyWalletError(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("reject") || normalized.includes("denied")) return "Wallet authorization cancelled.";
  if (normalized.includes("proof")) return "The private proof failed. Your funds are unchanged.";
  if (normalized.includes("sponsor") || normalized.includes("dust")) return "Sponsorship is unavailable; retry with wallet-funded DUST.";
  if (normalized.includes("finality") || normalized.includes("indexer")) return "The network has not reached fresh finality yet; refresh before retrying.";
  if (normalized.includes("revert")) return "The transaction reverted. Nothing was transferred; try the current action again.";
  return message.split("\n")[0].slice(0, 180);
}
