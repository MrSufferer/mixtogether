import type { Hex, NetworkId } from "./types";
import { ParticipantError } from "./types";
import { bytes32, domain, hashWords, word, ZERO_BYTES32 } from "./hashing";
import { PROGRAM_CONSTANTS } from "./constants";

export type RandomnessPhase = "commit" | "reveal" | "ready" | "finalized";
export type RandomnessSnapshot = Readonly<{ drawId: bigint; phase: RandomnessPhase; commitCutoff: bigint; revealOpensAt: bigint; revealCutoff: bigint; commits: readonly string[]; reveals: readonly string[]; aggregate?: Hex }>;

export function deriveContributorReveal(seed: Hex, environment: NetworkId, deploymentId: string, drawId: bigint): Hex {
  return hashWords(domain("randomness/contributor-reveal/v1"), bytes32(seed), bytes32(environment), bytes32(deploymentId), word(drawId));
}

export function contributorCommit(reveal: Hex, contributor: string, drawId: bigint): Hex {
  return hashWords(domain("randomness/commit/v1"), bytes32(reveal), bytes32(contributor), word(drawId));
}

export class ThresholdRandomness {
  private readonly commits = new Map<string, Hex>();
  private readonly reveals = new Map<string, Hex>();
  private aggregate: Hex | undefined;

  public constructor(
    public readonly drawId: bigint,
    public readonly environment: NetworkId,
    public readonly deploymentId: string,
    public readonly contributors: readonly string[] = ["render", "github-actions", "offline-maintainer"],
    public readonly openedAt = 0n,
    private readonly schedule: { commitCutoff?: bigint; revealOpensAt?: bigint; revealCutoff?: bigint } = {},
  ) {
    if (contributors.length !== PROGRAM_CONSTANTS.randomnessContributors || new Set(contributors).size !== contributors.length) throw new Error("exactly three unique randomness contributors are required");
    if (contributors.some((contributor) => !contributor.trim())) throw new Error("randomness contributor ids cannot be empty");
    if (drawId < 0n) throw new Error("draw id cannot be negative");
    if (this.commitCutoff < openedAt || this.revealOpensAt < this.commitCutoff || this.revealCutoff < this.revealOpensAt) throw new Error("randomness deadlines must be monotonic");
  }

  public get commitCutoff(): bigint { return this.schedule.commitCutoff ?? this.openedAt + BigInt(PROGRAM_CONSTANTS.randomnessCommitLeadSeconds); }
  // The standalone reference starts reveals on the first second after the
  // commit cutoff. Pool deployments pass an explicit weighting-close boundary.
  public get revealOpensAt(): bigint { return this.schedule.revealOpensAt ?? this.commitCutoff + 1n; }
  public get revealCutoff(): bigint { return this.schedule.revealCutoff ?? this.revealOpensAt + BigInt(PROGRAM_CONSTANTS.randomnessRevealSeconds); }
  public get phase(): RandomnessPhase {
    if (this.aggregate) return "finalized";
    if (this.reveals.size >= PROGRAM_CONSTANTS.randomnessThreshold) return "ready";
    if (this.commits.size === this.contributors.length) return "reveal";
    return "commit";
  }

  public commit(contributor: string, commitment: Hex, now: bigint): void {
    this.assertContributor(contributor);
    if (now < this.openedAt) throw new ParticipantError("INVALID_COMMAND", "randomness commit phase has not opened");
    if (now > this.commitCutoff) throw new ParticipantError("INVALID_COMMAND", "randomness commit deadline passed");
    if (this.commits.has(contributor)) throw new ParticipantError("INVALID_COMMAND", "duplicate randomness commit");
    if (this.commits.size === this.contributors.length) throw new ParticipantError("INVALID_COMMAND", "all randomness commits are registered");
    const normalized = bytes32(commitment);
    if ([...this.commits.values()].some((value) => value.toLowerCase() === normalized.toLowerCase())) throw new ParticipantError("INVALID_COMMAND", "randomness commitments must be unique");
    this.commits.set(contributor, normalized);
  }

  public reveal(contributor: string, reveal: Hex, now: bigint): void {
    this.assertContributor(contributor);
    if (now < this.revealOpensAt) throw new ParticipantError("INVALID_COMMAND", "reveal phase has not opened");
    if (now > this.revealCutoff) throw new ParticipantError("INVALID_COMMAND", "randomness reveal deadline passed");
    if (this.reveals.has(contributor)) throw new ParticipantError("INVALID_COMMAND", "duplicate randomness reveal");
    const expected = this.commits.get(contributor);
    if (!expected) throw new ParticipantError("INVALID_COMMAND", "contributor has no committed value");
    if (contributorCommit(reveal, contributor, this.drawId).toLowerCase() !== expected.toLowerCase()) throw new ParticipantError("PROOF_FAILURE", "reveal does not match committed value");
    if ([...this.reveals.values()].some((value) => value.toLowerCase() === reveal.toLowerCase())) throw new ParticipantError("INVALID_COMMAND", "reveal values must be unique");
    this.reveals.set(contributor, bytes32(reveal));
  }

  public finalize(now: bigint): Hex {
    if (this.aggregate) return this.aggregate;
    if (now < this.revealCutoff) throw new ParticipantError("INVALID_COMMAND", "reveal deadline has not passed");
    if (this.reveals.size < PROGRAM_CONSTANTS.randomnessThreshold) throw new ParticipantError("THRESHOLD_NOT_MET", "two distinct randomness reveals are required; no fallback is available");
    const ordered = this.contributors.filter((id) => this.reveals.has(id)).sort().map((id) => this.reveals.get(id) as Hex);
    this.aggregate = hashWords(domain("randomness/aggregate/v1"), word(this.drawId), ...ordered);
    return this.aggregate;
  }

  public get aggregateRandomness(): Hex { return this.aggregate ?? ZERO_BYTES32; }
  public snapshot(): RandomnessSnapshot { return Object.freeze({ drawId: this.drawId, phase: this.phase, commitCutoff: this.commitCutoff, revealOpensAt: this.revealOpensAt, revealCutoff: this.revealCutoff, commits: [...this.commits.keys()].sort(), reveals: [...this.reveals.keys()].sort(), ...(this.aggregate ? { aggregate: this.aggregate } : {}) }); }
  private assertContributor(contributor: string): void { if (!this.contributors.includes(contributor)) throw new ParticipantError("AUTHORIZATION_REJECTED", "unknown randomness contributor"); }
}
