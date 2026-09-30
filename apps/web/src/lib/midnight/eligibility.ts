import type { Hex } from "./types";
import { type AccountNote } from "./account";
import { evaluateWinningPredicate, type WinningPredicate } from "./win";

export type PublicDraw = Readonly<{
  drawId: bigint;
  cutoffTime: bigint;
  totalShareTwab: bigint;
  expectedWinnerCount: bigint;
  selectionDomain: bigint;
  randomness: Hex;
}>;

export type OfflineEligibility = Readonly<{
  availableOffline: true;
  drawId: bigint;
  predicate: WinningPredicate;
}>;

export function evaluateOfflineEligibility(input: {
  draw: PublicDraw;
  note: AccountNote;
  ownerSecret: Hex;
  selectionSalt: Hex;
}): OfflineEligibility {
  return {
    availableOffline: true,
    drawId: input.draw.drawId,
    predicate: evaluateWinningPredicate({
      note: input.note,
      cutoffTime: input.draw.cutoffTime,
      totalShareTwab: input.draw.totalShareTwab,
      expectedWinnerCount: input.draw.expectedWinnerCount,
      selectionDomain: input.draw.selectionDomain,
      randomness: input.draw.randomness,
      drawId: input.draw.drawId,
      ownerSecret: input.ownerSecret,
      selectionSalt: input.selectionSalt,
    }),
  };
}
