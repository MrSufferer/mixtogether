/** All amounts cross the public interface as integer six-decimal micro-units. */
export const TOKEN_DECIMALS = 6;
export const MICRO_UNITS = 1_000_000n;

export const PROGRAM_CONSTANTS = Object.freeze({
  token: "tMIX",
  tokenDecimals: TOKEN_DECIMALS,
  supplyCap: 10_000_000n * MICRO_UNITS,
  faucetAllocation: 1_000n * MICRO_UNITS,
  faucetEpochSeconds: 24n * 60n * 60n,
  automationAllocation: 25_000n * MICRO_UNITS,
  initialPrizeReserve: 1_000_000n * MICRO_UNITS,
  simulatedYieldPerDraw: 100n * MICRO_UNITS,
  drawIntervalSeconds: 15n * 60n,
  contributionMinimum: 1n * MICRO_UNITS,
  contributionMaximum: 1_000n * MICRO_UNITS,
  prizeReplenishmentMaximum: 1_000_000n * MICRO_UNITS,
  prizeReplenishmentTimelockSeconds: 60n * 60n,
  disclosureCohort: 5,
  randomnessContributors: 3,
  randomnessThreshold: 2,
  randomnessCommitLeadSeconds: 3n * 60n,
  randomnessRevealSeconds: 5n * 60n,
  claimWindowSeconds: 60n * 60n,
  fullSettlementPauseMaximumSeconds: 24n * 60n * 60n,
  sponsorTimeoutMilliseconds: 8_000,
  sponsoredActionsPerAccountPer24h: 20,
  sponsoredActionsGlobalPerUtcDay: 500,
  sponsorDustCapNumerator: 125n,
  sponsorDustCapDenominator: 100n,
  sponsorHotBalanceDays: 7,
  deployerDeadlineSeconds: 24n * 60n * 60n,
  // Explicit micro-unit names are the public configuration seam.
  supplyCapMicroUnits: 10_000_000n * MICRO_UNITS,
  faucetAmountMicroUnits: 1_000n * MICRO_UNITS,
  automationAllocationMicroUnits: 25_000n * MICRO_UNITS,
  initialPrizeReserveMicroUnits: 1_000_000n * MICRO_UNITS,
  simulatedYieldPerDrawMicroUnits: 100n * MICRO_UNITS,
  simulatedYieldIntervalSeconds: 15n * 60n,
  contributionMinMicroUnits: 1n * MICRO_UNITS,
  contributionMaxMicroUnits: 1_000n * MICRO_UNITS,
  prizeReplenishmentMaxMicroUnits: 1_000_000n * MICRO_UNITS,
  fullSettlementPauseMaxSeconds: 24n * 60n * 60n,
});

export type ProgramConstants = typeof PROGRAM_CONSTANTS;

export const MAINNET_INTERFACE = Object.freeze({
  drawIntervalSeconds: 7n * 24n * 60n * 60n,
  randomnessCommitLeadSeconds: 24n * 60n * 60n,
  randomnessRevealSeconds: 24n * 60n * 60n,
  claimWindowSeconds: 30n * 24n * 60n * 60n,
  mainnetTransactionsEnabled: false as const,
  principalAsset: null,
  productionYieldStrategy: null,
});

export function toMicroUnits(wholeOrDecimal: string | number | bigint): bigint {
  if (typeof wholeOrDecimal === "bigint") return wholeOrDecimal * MICRO_UNITS;
  const text = String(wholeOrDecimal);
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(text)) {
    throw new Error("amount must be a non-negative decimal with at most six places");
  }
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * MICRO_UNITS + BigInt(fraction.padEnd(TOKEN_DECIMALS, "0"));
}

export function fromMicroUnits(amount: bigint): string {
  if (amount < 0n) throw new Error("amount cannot be negative");
  const whole = amount / MICRO_UNITS;
  const fraction = (amount % MICRO_UNITS).toString().padStart(TOKEN_DECIMALS, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
