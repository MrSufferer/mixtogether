import type { AccountNote } from "./account";
import { accountNoteCommitment, claimNullifier, createAccountNote, deriveOwnerCommitment, twabAt, updateAccount } from "./account";
import { PROGRAM_CONSTANTS } from "./constants";
import { domain, hashToBigInt, hashWords, type Hex } from "./hashing";
import { ThresholdRandomness, contributorCommit, deriveContributorReveal } from "./randomness";
import { ParticipantError, type PublicDrawSnapshot } from "./types";
import { TmixAssetLedger } from "./asset";
import { SimulatedYieldAdapter } from "./yield";

export type PauseScope = "contributions" | "withdrawals" | "settlement";
export type PoolAccountSnapshot = Readonly<{ principalMicroUnits: bigint; twabSeconds: bigint; noteCommitment: Hex }>;
/**
 * Public pool state deliberately redacts aggregate balances until the current
 * draw has reached the Disclosure Cohort.  A `null` value is not a zero
 * balance; it means the aggregate is not disclosed at this point in the
 * protocol.
 */
export type PoolSnapshot = Readonly<{ principalReserveMicroUnits: bigint | null; prizeReserveMicroUnits: bigint | null; totalShareTwab: bigint | null; participantCount: number; disclosureCohortMet: boolean; paused: readonly PauseScope[]; deployerActive: boolean; submissionLocked: boolean; draw: PublicDrawSnapshot }>;

type InternalDraw = { id: bigint; opensAt: bigint; closesAt: bigint; finalizedAt?: bigint; randomness: ThresholdRandomness; winningCommitment?: Hex; winnerOwner?: string; prizeMicroUnits: bigint; rolloverMicroUnits: bigint; claimNullifier?: Hex };

/** Deterministic reference ledger used by tests and the local participant adapter. */
export class PrizePoolLedger {
  public readonly asset: TmixAssetLedger;
  public readonly yield: SimulatedYieldAdapter;
  private readonly accounts = new Map<string, AccountNote>();
  private readonly unclaimed = new Map<string, bigint>();
  private readonly unclaimedAssetAccounts = new Map<string, string>();
  private readonly claimed = new Set<Hex>();
  private readonly pausedScopes = new Set<PauseScope>();
  private principalReserveMicroUnits = 0n;
  private draw: InternalDraw;
  private deployerActive = true;
  private submissionLocked = false;
  private readonly deployerDeadlineAt: bigint;
  private readonly governanceApprovals = new Map<PauseScope, Set<string>>();

  public constructor(
    public readonly environment: "preprod" = "preprod",
    public readonly deploymentId = "shroudly-preprod-local",
    startTime = 0n,
    asset = new TmixAssetLedger(),
    yieldAdapter?: SimulatedYieldAdapter,
  ) {
    if (startTime < 0n) throw new ParticipantError("INVALID_COMMAND", "time cannot be negative");
    this.asset = asset;
    this.yield = yieldAdapter ?? new SimulatedYieldAdapter(startTime, (amount) => this.asset.issuePrizeYield(amount));
    this.deployerDeadlineAt = startTime + BigInt(PROGRAM_CONSTANTS.deployerDeadlineSeconds);
    this.draw = this.newDraw(1n, startTime);
  }

  public faucetClaim(ownerSecret: Hex, salt: Hex, now: bigint): bigint {
    this.assertSubmissionOpen(now);
    const owner = this.owner(ownerSecret, salt);
    return this.asset.faucetClaim(owner as Hex, now);
  }

  public contribute(ownerSecret: Hex, salt: Hex, amountMicroUnits: bigint, now: bigint): PoolAccountSnapshot {
    this.assertSubmissionOpen(now);
    this.assertNotPaused("contributions", now);
    if (amountMicroUnits < PROGRAM_CONSTANTS.contributionMinMicroUnits || amountMicroUnits > PROGRAM_CONSTANTS.contributionMaxMicroUnits) throw new ParticipantError("INVALID_COMMAND", "contribution must be between 1 and 1,000 tMIX");
    const owner = this.owner(ownerSecret, salt);
    this.asset.transfer(owner, "principal-reserve", amountMicroUnits);
    const existing = this.accounts.get(owner);
    const note = existing ? updateAccount(existing, now, existing.principalShares + amountMicroUnits).note : createAccountNote(owner as Hex, amountMicroUnits, now, 0n, salt);
    this.accounts.set(owner, note);
    this.principalReserveMicroUnits += amountMicroUnits;
    this.assertSolvent();
    return this.accountSnapshot(owner, now);
  }

  public withdraw(ownerSecret: Hex, salt: Hex, amountMicroUnits: bigint, now: bigint): PoolAccountSnapshot {
    this.assertSubmissionOpen(now);
    this.assertNotPaused("withdrawals", now);
    const owner = this.owner(ownerSecret, salt);
    const note = this.accounts.get(owner);
    if (!note || amountMicroUnits <= 0n || amountMicroUnits > note.principalShares) throw new ParticipantError("INVALID_COMMAND", "withdrawal exceeds principal");
    const updated = updateAccount(note, now, note.principalShares - amountMicroUnits).note;
    this.accounts.set(owner, updated);
    this.principalReserveMicroUnits -= amountMicroUnits;
    this.asset.transfer("principal-reserve", owner, amountMicroUnits);
    this.assertSolvent();
    return this.accountSnapshot(owner, now);
  }

  public commitRandomness(contributor: string, commitment: Hex, now: bigint): void { this.assertSubmissionOpen(now); this.draw.randomness.commit(contributor, commitment, now); }
  public revealRandomness(contributor: string, reveal: Hex, now: bigint): void { this.assertSubmissionOpen(now); this.draw.randomness.reveal(contributor, reveal, now); }

  public deriveReveal(seed: Hex): Hex { return deriveContributorReveal(seed, this.environment, this.deploymentId, this.draw.id); }
  public commitForReveal(reveal: Hex, contributor: string): Hex { return contributorCommit(reveal, contributor, this.draw.id); }

  public checkpointYield(now: bigint): bigint {
    this.assertSubmissionOpen(now);
    if (now >= this.draw.closesAt) this.yield.markDrawCompleted(this.draw.id);
    return this.yield.checkpoint(now);
  }

  public finalizeDraw(now: bigint): PublicDrawSnapshot {
    // Finalization is a permissionless settlement action and remains
    // available after a missed deployer-removal deadline.  The deadline lock
    // applies to new participant/randomness submissions, not safe settlement.
    this.observeSubmissionState(now);
    this.assertNotPaused("settlement", now);
    if (this.draw.finalizedAt) throw new ParticipantError("INVALID_COMMAND", "draw has already been finalized");
    if (now < this.draw.randomness.revealCutoff) throw new ParticipantError("INVALID_COMMAND", "draw finalization is not yet permissionless");
    if (this.activeParticipants(this.draw.closesAt).length < PROGRAM_CONSTANTS.disclosureCohort) throw new ParticipantError("THRESHOLD_NOT_MET", "Disclosure Cohort of five participants is required");
    const aggregate = this.draw.randomness.finalize(now);
    const cutoff = this.draw.closesAt;
    const candidates = [...this.accounts.entries()].map(([owner, note]) => ({ owner, weight: this.safeTwabAt(note, cutoff) })).filter((candidate) => candidate.weight > 0n).sort((a, b) => a.owner.localeCompare(b.owner));
    const total = candidates.reduce((sum, candidate) => sum + candidate.weight, 0n);
    if (total === 0n) throw new ParticipantError("INVALID_COMMAND", "no eligible principal at draw cutoff");
    let selection = hashToBigInt(hashWords(domain("selection/v1"), aggregate)) % total;
    const winner = candidates.find((candidate) => { if (selection < candidate.weight) return true; selection -= candidate.weight; return false; }) ?? candidates[candidates.length - 1];
    const winningCommitment = hashWords(domain("winning-commitment/v1"), winner.owner as Hex, this.draw.id.toString());
    const payout = this.yield.settle(1n);
    this.draw.winningCommitment = winningCommitment;
    this.draw.winnerOwner = winner.owner;
    this.draw.prizeMicroUnits = payout.unitPayout;
    this.draw.rolloverMicroUnits = payout.rollover;
    this.draw.finalizedAt = now;
    this.unclaimed.set(winner.owner, payout.unitPayout);
    if (payout.unitPayout > 0n) {
      const liabilityAccount = `unclaimed-prize:${this.draw.id.toString()}:${winner.owner}`;
      this.asset.transfer("prize-reserve", liabilityAccount, payout.unitPayout);
      this.unclaimedAssetAccounts.set(winner.owner, liabilityAccount);
    }
    this.assertSolvent();
    return this.drawSnapshot();
  }

  public claimPrize(ownerSecret: Hex, salt: Hex, now: bigint): bigint {
    this.observeSubmissionState(now);
    this.assertNotPaused("settlement", now);
    if (!this.draw.finalizedAt || !this.draw.winningCommitment || !this.draw.winnerOwner) throw new ParticipantError("INVALID_COMMAND", "draw has not been finalized");
    if (now > this.draw.finalizedAt + BigInt(PROGRAM_CONSTANTS.claimWindowSeconds)) throw new ParticipantError("CLAIM_EXPIRED", "claim window has expired");
    const owner = this.owner(ownerSecret, salt);
    const expected = hashWords(domain("winning-commitment/v1"), owner as Hex, this.draw.id.toString());
    if (expected.toLowerCase() !== this.draw.winningCommitment.toLowerCase() || owner !== this.draw.winnerOwner) throw new ParticipantError("AUTHORIZATION_REJECTED", "private ownership proof did not select this wallet");
    const nullifier = claimNullifier(owner as Hex, this.draw.id, this.draw.winningCommitment);
    if (this.claimed.has(nullifier)) throw new ParticipantError("ALREADY_CLAIMED", "claim nullifier has already been consumed");
    const amount = this.unclaimed.get(owner) ?? 0n;
    if (amount === 0n) throw new ParticipantError("ALREADY_CLAIMED", "no unclaimed prize");
    this.claimed.add(nullifier);
    this.draw.claimNullifier = nullifier;
    this.unclaimed.delete(owner);
    const liabilityAccount = this.unclaimedAssetAccounts.get(owner);
    if (!liabilityAccount) throw new ParticipantError("SOLVENCY_BREACH", "claimable prize custody is missing");
    this.unclaimedAssetAccounts.delete(owner);
    this.asset.transfer(liabilityAccount, owner, amount);
    this.assertSolvent();
    // A claimed draw is complete. Advance the schedule so the next
    // permissionless draw cannot be blocked by the previous winner
    // commitment; the yield adapter remains responsible for funding its next
    // reserve before settlement.
    this.draw = this.newDraw(this.draw.id + 1n, now);
    return amount;
  }

  public rolloverExpired(now: bigint): bigint {
    this.observeSubmissionState(now);
    if (!this.draw.finalizedAt || now <= this.draw.finalizedAt + BigInt(PROGRAM_CONSTANTS.claimWindowSeconds)) return 0n;
    const amount = this.draw.prizeMicroUnits;
    if (this.draw.winnerOwner) {
      this.unclaimed.delete(this.draw.winnerOwner);
      const liabilityAccount = this.unclaimedAssetAccounts.get(this.draw.winnerOwner);
      if (liabilityAccount && amount > 0n) this.asset.transfer(liabilityAccount, "prize-reserve", amount);
      this.unclaimedAssetAccounts.delete(this.draw.winnerOwner);
    }
    this.yield.addRollover(amount);
    this.draw = this.newDraw(this.draw.id + 1n, now);
    this.assertSolvent();
    return amount;
  }

  public pause(scope: PauseScope, approvals: readonly string[], now: bigint): void {
    const unique = [...new Set(approvals)];
    this.assertGovernance(unique);
    if (scope === "settlement" && now > this.draw.closesAt + BigInt(PROGRAM_CONSTANTS.fullSettlementPauseMaxSeconds)) throw new ParticipantError("INVALID_COMMAND", "full settlement pause cannot exceed 24 hours");
    this.governanceApprovals.set(scope, new Set(unique.slice(0, 3)));
    this.pausedScopes.add(scope);
    if (scope === "settlement") this.settlementPauseUntil = now + BigInt(PROGRAM_CONSTANTS.fullSettlementPauseMaxSeconds);
  }

  public unpause(scope: PauseScope, approvals: readonly string[] = []): void {
    this.assertGovernance(approvals);
    this.pausedScopes.delete(scope);
    this.governanceApprovals.delete(scope);
    if (scope === "settlement") this.settlementPauseUntil = null;
  }

  public removeDeployer(now: bigint): void {
    if (now < this.deployerDeadlineAt) throw new ParticipantError("INVALID_COMMAND", "deployer removal deadline has not elapsed");
    if (now > this.deployerDeadlineAt) this.submissionLocked = true;
    this.deployerActive = false;
  }

  public account(ownerSecret: Hex, salt: Hex, now: bigint): PoolAccountSnapshot {
    if (now < 0n) throw new ParticipantError("INVALID_COMMAND", "time cannot be negative");
    return this.accountSnapshot(this.owner(ownerSecret, salt), now);
  }

  public unclaimedPrize(ownerSecret: Hex, salt: Hex): bigint {
    return this.unclaimed.get(this.owner(ownerSecret, salt)) ?? 0n;
  }

  public snapshot(now: bigint): PoolSnapshot {
    this.observeSubmissionState(now);
    const yieldSnapshot = this.yield.snapshot();
    const active = this.activeParticipants(now);
    const disclosureCohortMet = this.activeParticipants(this.draw.closesAt).length >= PROGRAM_CONSTANTS.disclosureCohort;
    const aggregate = disclosureCohortMet ? { principalReserveMicroUnits: this.principalReserveMicroUnits, prizeReserveMicroUnits: yieldSnapshot.prizeReserveMicroUnits, totalShareTwab: this.totalShareTwab(now) } : { principalReserveMicroUnits: null, prizeReserveMicroUnits: null, totalShareTwab: null };
    return Object.freeze({ ...aggregate, participantCount: active.length, disclosureCohortMet, paused: [...this.pausedScopes], deployerActive: this.deployerActive, submissionLocked: this.submissionLocked, draw: this.drawSnapshot(now) });
  }

  public assertSolvent(): void {
    if (this.principalReserveMicroUnits !== [...this.accounts.values()].reduce((sum, note) => sum + note.principalShares, 0n)) throw new ParticipantError("SOLVENCY_BREACH", "principal reserve does not equal notes");
    const yieldSnapshot = this.yield.snapshot();
    const custodyPrize = this.asset.balanceOf("prize-reserve") + [...this.unclaimedAssetAccounts.values()].reduce((sum, account) => sum + this.asset.balanceOf(account), 0n);
    const outstandingClaims = [...this.unclaimed.values()].reduce((sum, amount) => sum + amount, 0n);
    const expectedPrize = yieldSnapshot.prizeReserveMicroUnits + yieldSnapshot.rolloverMicroUnits + outstandingClaims;
    if (this.principalReserveMicroUnits < 0n || yieldSnapshot.prizeReserveMicroUnits < 0n || custodyPrize !== expectedPrize) throw new ParticipantError("SOLVENCY_BREACH", "Prize Reserve custody does not cover settlement liabilities");
  }

  private newDraw(id: bigint, opensAt: bigint): InternalDraw {
    const closesAt = opensAt + BigInt(PROGRAM_CONSTANTS.simulatedYieldIntervalSeconds);
    const commitCutoff = closesAt - BigInt(PROGRAM_CONSTANTS.randomnessCommitLeadSeconds);
    const revealOpensAt = closesAt;
    const revealCutoff = revealOpensAt + BigInt(PROGRAM_CONSTANTS.randomnessRevealSeconds);
    return { id, opensAt, closesAt, randomness: new ThresholdRandomness(id, this.environment, this.deploymentId, undefined, opensAt, { commitCutoff, revealOpensAt, revealCutoff }), prizeMicroUnits: 0n, rolloverMicroUnits: 0n };
  }
  private owner(secret: Hex, salt: Hex): string { return deriveOwnerCommitment(secret, salt); }
  private accountSnapshot(owner: string, now: bigint): PoolAccountSnapshot { const note = this.accounts.get(owner); if (!note) return { principalMicroUnits: 0n, twabSeconds: 0n, noteCommitment: hashWords(domain("empty-note/v1"), owner as Hex) }; return { principalMicroUnits: note.principalShares, twabSeconds: this.safeTwabAt(note, now), noteCommitment: accountNoteCommitment(note) }; }
  private totalShareTwab(now: bigint): bigint { return [...this.accounts.values()].reduce((sum, note) => sum + this.safeTwabAt(note, now), 0n); }
  private safeTwabAt(note: AccountNote, now: bigint): bigint { return note.lastUpdate > now ? 0n : twabAt(note, now); }
  private drawSnapshot(now = this.draw.opensAt): PublicDrawSnapshot {
    this.observeSubmissionState(now);
    if (this.settlementPauseUntil !== null && now >= this.settlementPauseUntil) { this.pausedScopes.delete("settlement"); this.settlementPauseUntil = null; }
    const phase = this.draw.finalizedAt ? "finalized" : now < this.draw.closesAt ? "open" : now < this.draw.randomness.revealOpensAt ? "closed" : now <= this.draw.randomness.revealCutoff ? "revealing" : "closed";
    const eligible = this.activeParticipants(this.draw.closesAt).length;
    return { drawId: this.draw.id, phase, opensAt: this.draw.opensAt, closesAt: this.draw.closesAt, commitCutoff: this.draw.randomness.commitCutoff, revealOpensAt: this.draw.randomness.revealOpensAt, revealClosesAt: this.draw.randomness.revealCutoff, eligibleCommitments: eligible, disclosureCohortMet: eligible >= PROGRAM_CONSTANTS.disclosureCohort, ...(this.draw.winningCommitment ? { winningCommitment: this.draw.winningCommitment } : {}), prizeMicroUnits: this.draw.prizeMicroUnits, rolloverMicroUnits: this.draw.rolloverMicroUnits };
  }
  private activeParticipants(effectiveTime: bigint): readonly [string, AccountNote][] {
    return [...this.accounts.entries()].filter(([, note]) => note.lastUpdate <= effectiveTime && this.safeTwabAt(note, effectiveTime) > 0n);
  }
  private assertSubmissionOpen(now: bigint): void {
    this.observeSubmissionState(now);
    if (this.submissionLocked) throw new ParticipantError("OUTAGE", "submissions are locked pending deployer removal incident review", true);
  }
  private observeSubmissionState(now: bigint): void {
    if (now < 0n) throw new ParticipantError("INVALID_COMMAND", "time cannot be negative");
    if (this.deployerActive && now > this.deployerDeadlineAt) this.submissionLocked = true;
  }
  private assertNotPaused(scope: PauseScope, now?: bigint): void {
    if (scope === "settlement" && this.settlementPauseUntil !== null && now !== undefined && now >= this.settlementPauseUntil) { this.pausedScopes.delete(scope); this.settlementPauseUntil = null; }
    if (this.pausedScopes.has(scope)) throw new ParticipantError("OUTAGE", `${scope} are paused`, true);
  }
  private assertGovernance(approvals: readonly string[]): void {
    const unique = [...new Set(approvals)];
    if (unique.length < 2 || unique.length > 3) throw new ParticipantError("AUTHORIZATION_REJECTED", "two-of-three governance approval is required");
    if (unique.some((authority) => !(this.governanceAuthorities as readonly string[]).includes(authority))) throw new ParticipantError("AUTHORIZATION_REJECTED", "unknown governance authority");
  }

  private readonly governanceAuthorities = ["governance-1", "governance-2", "governance-3"] as const;
  private settlementPauseUntil: bigint | null = null;
}
