import type { Hex } from "./types";
import { type AccountNote } from "./account";
import { evaluateWinningPredicate, type WinningPredicate } from "./win";

export type PublicDraw = Readonly<{
  drawId: bigint;
  cutoffTime: bigint;
  totalShareTwab: bigint;
  expectedWinnerCount: bigint;
  publicSupply: bigint;
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
  ticketSalt: Hex;
}): OfflineEligibility {
  return {
    availableOffline: true,
    drawId: input.draw.drawId,
    predicate: evaluateWinningPredicate({
      note: input.note,
      cutoffTime: input.draw.cutoffTime,
      totalShareTwab: input.draw.totalShareTwab,
      expectedWinnerCount: input.draw.expectedWinnerCount,
      publicSupply: input.draw.publicSupply,
      randomness: input.draw.randomness,
      drawId: input.draw.drawId,
      ownerSecret: input.ownerSecret,
      ticketSalt: input.ticketSalt,
    }),
  };
}
