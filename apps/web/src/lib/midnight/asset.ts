import { hashWords, domain, word, type Hex } from "./hashing";
import { PROGRAM_CONSTANTS } from "./constants";
import { ParticipantError } from "./types";

export type TmixLedgerSnapshot = Readonly<{ totalIssuedMicroUnits: bigint; capMicroUnits: bigint; balances: Readonly<Record<string, bigint>>; faucetEpoch: bigint; automationAllocated: boolean }>;

/** Shielded tMIX accounting model. Balances are keyed by private owner commitments. */
export class TmixAssetLedger {
  private readonly balances = new Map<string, bigint>();
  private readonly faucetNullifiers = new Set<Hex>();
  private totalIssuedMicroUnits = 0n;
  private automationAllocated = false;
  private faucetEpoch = 0n;

  public constructor(private readonly epochSeconds = PROGRAM_CONSTANTS.faucetEpochSeconds) {
    if (epochSeconds <= 0n) throw new ParticipantError("INVALID_COMMAND", "faucet epoch must be positive");
    this.mint("prize-reserve", PROGRAM_CONSTANTS.initialPrizeReserveMicroUnits);
  }

  public setEpoch(nowSeconds: bigint): bigint {
    if (nowSeconds < 0n) throw new ParticipantError("INVALID_COMMAND", "time cannot be negative");
    const nextEpoch = nowSeconds / BigInt(this.epochSeconds);
    if (nextEpoch < this.faucetEpoch) throw new ParticipantError("INVALID_COMMAND", "faucet epoch moved backwards");
    this.faucetEpoch = nextEpoch;
    return this.faucetEpoch;
  }

  public faucetClaim(ownerCommitment: Hex, nowSeconds: bigint): bigint {
    const epoch = this.setEpoch(nowSeconds);
    const claimNullifier = hashWords(domain("faucet/nullifier/v1"), ownerCommitment, word(epoch));
    if (this.faucetNullifiers.has(claimNullifier)) throw new ParticipantError("INVALID_COMMAND", "faucet already claimed for this epoch");
    this.mint(ownerCommitment, PROGRAM_CONSTANTS.faucetAmountMicroUnits);
    this.faucetNullifiers.add(claimNullifier);
    return PROGRAM_CONSTANTS.faucetAmountMicroUnits;
  }

  public allocateAutomation(fixtureId: string): bigint {
    if (fixtureId !== "evidence-fixture") throw new ParticipantError("AUTHORIZATION_REJECTED", "automation allocation is isolated to the evidence fixture");
    if (this.automationAllocated) throw new ParticipantError("INVALID_COMMAND", "automation allocation already issued");
    this.mint(fixtureId, PROGRAM_CONSTANTS.automationAllocationMicroUnits);
    this.automationAllocated = true;
    return PROGRAM_CONSTANTS.automationAllocationMicroUnits;
  }

  public transfer(from: string, to: string, amountMicroUnits: bigint): void {
    if (amountMicroUnits <= 0n) throw new ParticipantError("INVALID_COMMAND", "transfer amount must be positive");
    const source = this.balanceOf(from);
    if (source < amountMicroUnits) throw new ParticipantError("INVALID_COMMAND", "insufficient tMIX balance");
    this.balances.set(from, source - amountMicroUnits);
    this.balances.set(to, this.balanceOf(to) + amountMicroUnits);
  }

  /** Issue deterministic Preprod yield through the shared supply cap. */
  public issuePrizeYield(amountMicroUnits: bigint): void {
    this.mint("prize-reserve", amountMicroUnits);
  }

  public balanceOf(owner: string): bigint { return this.balances.get(owner) ?? 0n; }
  public totalIssued(): bigint { return this.totalIssuedMicroUnits; }

  public snapshot(): TmixLedgerSnapshot {
    return Object.freeze({ totalIssuedMicroUnits: this.totalIssuedMicroUnits, capMicroUnits: PROGRAM_CONSTANTS.supplyCapMicroUnits, balances: Object.freeze(Object.fromEntries(this.balances)), faucetEpoch: this.faucetEpoch, automationAllocated: this.automationAllocated });
  }

  private mint(to: string, amountMicroUnits: bigint): void {
    if (amountMicroUnits <= 0n) throw new ParticipantError("INVALID_COMMAND", "mint amount must be positive");
    if (this.totalIssuedMicroUnits + amountMicroUnits > PROGRAM_CONSTANTS.supplyCapMicroUnits) throw new ParticipantError("SOLVENCY_BREACH", "tMIX supply cap exceeded");
    this.totalIssuedMicroUnits += amountMicroUnits;
    this.balances.set(to, this.balanceOf(to) + amountMicroUnits);
  }
}
