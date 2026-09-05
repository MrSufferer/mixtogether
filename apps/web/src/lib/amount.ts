const TOKEN_DECIMALS = 6;
const TOKEN_SCALE = 10n ** BigInt(TOKEN_DECIMALS);

export function parseTokenAmount(input: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(input)) {
    throw new Error("Enter a positive amount with at most six decimal places.");
  }
  const [whole, fraction = ""] = input.split(".");
  const amount = BigInt(whole) * TOKEN_SCALE + BigInt(fraction.padEnd(TOKEN_DECIMALS, "0"));
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");
  return amount;
}

export function formatTokenAmount(amount: bigint): string {
  const whole = amount / TOKEN_SCALE;
  const fraction = (amount % TOKEN_SCALE).toString().padStart(TOKEN_DECIMALS, "0");
  const meaningfulFraction = fraction.replace(/0+$/, "");
  return meaningfulFraction ? `${whole}.${meaningfulFraction}` : whole.toString();
}

export function formatPublicCompact(amount: bigint): string {
  const numeric = Number(amount) / Number(TOKEN_SCALE);
  return new Intl.NumberFormat(undefined, {
    notation: numeric >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 2,
  }).format(numeric);
}
