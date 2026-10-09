import { fromMicroUnits, toMicroUnits, TOKEN_DECIMALS } from "./midnight/constants";

export function parseTokenAmount(input: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(input)) throw new Error(`Enter a positive amount with at most ${TOKEN_DECIMALS} decimal places.`);
  const amount = toMicroUnits(input);
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");
  return amount;
}

export function formatTokenAmount(amount: bigint): string { return fromMicroUnits(amount); }
export function formatPublicCompact(amount: bigint): string {
  const numeric = Number(amount) / 1_000_000;
  return new Intl.NumberFormat(undefined, { notation: numeric >= 10_000 ? "compact" : "standard", maximumFractionDigits: 2 }).format(numeric);
}
