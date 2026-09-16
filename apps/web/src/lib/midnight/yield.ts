import { PROGRAM_CONSTANTS } from "./constants";
import { ParticipantError } from "./types";
import { payoutForBudget, type Payout } from "./win";

export type YieldSnapshot = Readonly<{ prizeReserveMicroUnits: bigint; accruedYieldMicroUnits: bigint; lastCheckpoint: bigint; completedDraws: bigint; pendingReplenishmentMicroUnits: bigint; replenishmentAvailableAt: bigint; rolloverMicroUnits: bigint }>;

/** Deterministic Preprod yield boundary. It never pretends to be a production strategy. */
export class SimulatedYieldAdapter {
  private prizeReserveMicroUnits = PROGRAM_CONSTANTS.initialPrizeReserveMicroUnits;
  private accruedYieldMicroUnits = 0n;
  private lastCheckpoint: bigint;
  private completedDraws = 0n;
  private pendingReplenishmentMicroUnits = 0n;
  private replenishmentAvailableAt = 0n;
  private rolloverMicroUnits = 0n;

  public constructor(startTime = 0n, private readonly onReserveIncrease: (amountMicroUnits: bigint) => void = () => undefined) { this.lastCheckpoint = startTime; }

  public markDrawCompleted(drawId: bigint): void {
    if (drawId <= this.completedDraws) return;
    this.completedDraws = drawId;
  }

  public checkpoint(now: bigint): bigint {
    if (now < this.lastCheckpoint) throw new ParticipantError("INVALID_COMMAND", "yield checkpoint moved backwards");
    const intervals = (now - this.lastCheckpoint) / BigInt(PROGRAM_CONSTANTS.simulatedYieldIntervalSeconds);
    if (intervals === 0n) return 0n;
    const completed = this.completedDraws;
    const capacity = completed * PROGRAM_CONSTANTS.simulatedYieldPerDrawMicroUnits;
    const newYield = capacity > this.accruedYieldMicroUnits ? capacity - this.accruedYieldMicroUnits : 0n;
    const bounded = newYield > intervals * PROGRAM_CONSTANTS.simulatedYieldPerDrawMicroUnits ? intervals * PROGRAM_CONSTANTS.simulatedYieldPerDrawMicroUnits : newYield;
    if (bounded > 0n) this.onReserveIncrease(bounded);
    this.accruedYieldMicroUnits += bounded;
    this.prizeReserveMicroUnits += bounded;
    this.lastCheckpoint += intervals * BigInt(PROGRAM_CONSTANTS.simulatedYieldIntervalSeconds);
    return bounded;
  }

  public requestReplenishment(amountMicroUnits: bigint, now: bigint): void {
    if (amountMicroUnits <= 0n || amountMicroUnits > PROGRAM_CONSTANTS.prizeReplenishmentMaxMicroUnits) throw new ParticipantError("INVALID_COMMAND", "replenishment exceeds the one-hour bounded action");
    if (this.pendingReplenishmentMicroUnits !== 0n) throw new ParticipantError("INVALID_COMMAND", "a replenishment is already timelocked");
    // The reserve already includes accrued yield; subtracting it twice would
    // understate the remaining cap and make valid replenishment impossible.
    const remaining = PROGRAM_CONSTANTS.supplyCapMicroUnits - this.prizeReserveMicroUnits;
    if (amountMicroUnits > remaining) throw new ParticipantError("SOLVENCY_BREACH", "replenishment exceeds remaining supply");
    this.pendingReplenishmentMicroUnits = amountMicroUnits;
    this.replenishmentAvailableAt = now + BigInt(PROGRAM_CONSTANTS.prizeReplenishmentTimelockSeconds);
  }

  public executeReplenishment(now: bigint): bigint {
    if (this.pendingReplenishmentMicroUnits === 0n) return 0n;
    if (now < this.replenishmentAvailableAt) throw new ParticipantError("INVALID_COMMAND", "replenishment timelock has not elapsed");
    const amount = this.pendingReplenishmentMicroUnits;
    this.onReserveIncrease(amount);
    this.prizeReserveMicroUnits += amount;
    this.pendingReplenishmentMicroUnits = 0n;
    this.replenishmentAvailableAt = 0n;
    return amount;
  }

  public settle(winnerCount: bigint): Payout {
    const budget = this.prizeReserveMicroUnits + this.rolloverMicroUnits;
    const payout = payoutForBudget(budget, winnerCount);
    // The settlement consumes the entire available budget.  Any indivisible
    // remainder is explicitly carried as Prize Rollover; it must not be
    // subtracted from the fresh reserve a second time on the next draw.
    this.prizeReserveMicroUnits = 0n;
    this.rolloverMicroUnits = payout.rollover;
    return payout;
  }

  public addRollover(amountMicroUnits: bigint): void {
    if (amountMicroUnits < 0n) throw new ParticipantError("INVALID_COMMAND", "rollover cannot be negative");
    this.rolloverMicroUnits += amountMicroUnits;
  }

  public snapshot(): YieldSnapshot { return Object.freeze({ prizeReserveMicroUnits: this.prizeReserveMicroUnits, accruedYieldMicroUnits: this.accruedYieldMicroUnits, lastCheckpoint: this.lastCheckpoint, completedDraws: this.completedDraws, pendingReplenishmentMicroUnits: this.pendingReplenishmentMicroUnits, replenishmentAvailableAt: this.replenishmentAvailableAt, rolloverMicroUnits: this.rolloverMicroUnits }); }
}
