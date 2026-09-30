import type { Hex } from "./types";
import { bytes32, domain, hashToBigInt, hashWords, word } from "./hashing";
import { type AccountNote, twabAt } from "./account";

export type Reduction = Readonly<{
  accepted: boolean;
  reducedValue: bigint;
  quotient: bigint;
  rejectionBoundary: bigint;
}>;

export type Payout = Readonly<{
  unitPayout: bigint;
  liability: bigint;
  rollover: bigint;
}>;

export type WinningPredicate = Readonly<{
  privateTwab: bigint;
  winningZone: bigint;
  randomValue: bigint;
  reduction: Reduction;
  win: boolean;
}>;

export function boundedWinningZone(
  privateTwab: bigint,
  totalShareTwab: bigint,
  expectedWinnerCount: bigint,
  selectionDomain: bigint,
): bigint {
  for (const [name, value] of [
    ["privateTwab", privateTwab],
    ["totalShareTwab", totalShareTwab],
    ["expectedWinnerCount", expectedWinnerCount],
    ["selectionDomain", selectionDomain],
  ] as const) {
    if (value < 0n) throw new Error(`${name} cannot be negative`);
  }

  if (
    privateTwab === 0n ||
    totalShareTwab === 0n ||
    expectedWinnerCount === 0n ||
    selectionDomain === 0n
  ) {
    return 0n;
  }

  // The public selection domain is the modulus used by the unbiased reduction.
  // Scale the account's share into that domain before flooring; omitting
  // `selectionDomain` would make a fully weighted account own only one
  // whenever the domain is larger than the expected winner count.
  const quotient =
    (privateTwab * selectionDomain * expectedWinnerCount) / totalShareTwab;
  return quotient > selectionDomain ? selectionDomain : quotient;
}

export function unbiasedReduce(
  randomValue: bigint,
  modulus: bigint,
  bitWidth = 256,
): Reduction {
  if (modulus <= 0n) throw new Error("modulus must be positive");
  if (bitWidth <= 0 || !Number.isInteger(bitWidth)) {
    throw new Error("bitWidth must be a positive integer");
  }

  const domainSize = 1n << BigInt(bitWidth);
  if (randomValue < 0n || randomValue >= domainSize) {
    throw new Error("random value does not fit in the selected domain");
  }

  const rejectionBoundary = domainSize - (domainSize % modulus);
  const accepted = randomValue < rejectionBoundary;

  return {
    accepted,
    reducedValue: randomValue % modulus,
    quotient: randomValue / modulus,
    rejectionBoundary,
  };
}

export function payoutForBudget(
  harvestedYieldBudget: bigint,
  winnerCount: bigint,
): Payout {
  if (harvestedYieldBudget < 0n || winnerCount < 0n) {
    throw new Error("payout inputs cannot be negative");
  }
  if (winnerCount === 0n) {
    return { unitPayout: 0n, liability: 0n, rollover: harvestedYieldBudget };
  }

  const unitPayout = harvestedYieldBudget / winnerCount;
  const liability = unitPayout * winnerCount;
  return {
    unitPayout,
    liability,
    rollover: harvestedYieldBudget - liability,
  };
}

export function privateRandomness(
  randomness: Hex,
  drawId: bigint,
  ownerSecret: Hex,
  selectionSalt: Hex,
): bigint {
  return hashToBigInt(
    hashWords(
      domain("prn/v1"),
      bytes32(randomness),
      word(drawId),
      bytes32(ownerSecret),
      bytes32(selectionSalt),
    ),
  );
}

export function evaluateWinningPredicate(input: {
  note: AccountNote;
  cutoffTime: bigint;
  totalShareTwab: bigint;
  expectedWinnerCount: bigint;
  selectionDomain: bigint;
  randomness: Hex;
  drawId: bigint;
  ownerSecret: Hex;
  selectionSalt: Hex;
}): WinningPredicate {
  const privateTwab = twabAt(input.note, input.cutoffTime);
  const winningZone = boundedWinningZone(
    privateTwab,
    input.totalShareTwab,
    input.expectedWinnerCount,
    input.selectionDomain,
  );
  const randomValue = privateRandomness(
    input.randomness,
    input.drawId,
    input.ownerSecret,
    input.selectionSalt,
  );
  // A zero selection domain has no eligible participant and is a valid,
  // non-winning
  // predicate rather than an exceptional provider failure.
  const reduction = input.selectionDomain === 0n
    ? { accepted: false, reducedValue: 0n, quotient: 0n, rejectionBoundary: 0n }
    : unbiasedReduce(randomValue, input.selectionDomain);

  return {
    privateTwab,
    winningZone,
    randomValue,
    reduction,
    win:
      reduction.accepted &&
      reduction.reducedValue < winningZone &&
      winningZone > 0n,
  };
}
