import { describe, expect, test } from "vitest";
import { PROGRAM_CONSTANTS, toMicroUnits } from "./constants";
import { TmixAssetLedger } from "./asset";
import { ThresholdRandomness, contributorCommit, deriveContributorReveal } from "./randomness";
import { PrizePoolLedger } from "./pool";
import type { Hex } from "./hashing";
import { BackupAccountService, totpCode } from "./backup";
import { exportPrivateState, generateRecoveryKit, parseRecoveryBundle, restorePrivateState, serializeRecoveryBundle, createRecoveryBundle } from "./recovery";
import { createParticipantApplication, DeterministicPreprodAdapter, ParticipantApplicationClient } from "./application";
import { deriveOwnerCommitment } from "./account";
import { domain, hashWords } from "./hashing";
import { boundedWinningZone, evaluateWinningPredicate } from "./win";

const secret = (byte: string): Hex => `0x${byte.padStart(2, "0").repeat(32)}` as Hex;
const OWNER = secret("1");
const SALT = secret("2");

describe("Shroudly Preprod protocol reference", () => {
  test("uses integer micro-units and enforces the shared tMIX cap", () => {
    expect(toMicroUnits("1.234567")).toBe(1_234_567n);
    const asset = new TmixAssetLedger();
    expect(asset.totalIssued()).toBe(PROGRAM_CONSTANTS.initialPrizeReserveMicroUnits);
    expect(asset.faucetClaim(OWNER, 0n)).toBe(PROGRAM_CONSTANTS.faucetAmountMicroUnits);
    expect(() => asset.faucetClaim(OWNER, 1n)).toThrow(/already claimed/);
    expect(asset.faucetClaim(OWNER, PROGRAM_CONSTANTS.faucetEpochSeconds)).toBe(PROGRAM_CONSTANTS.faucetAmountMicroUnits);
    expect(() => asset.allocateAutomation("not-the-evidence-fixture")).toThrow(/isolated/);
    expect(asset.allocateAutomation("evidence-fixture")).toBe(PROGRAM_CONSTANTS.automationAllocationMicroUnits);
  });

  test("requires two unique reveals and canonicalizes the aggregate", () => {
    const randomness = new ThresholdRandomness(1n, "preprod", "deployment-1", ["a", "b", "c"], 0n);
    const reveals = [secret("3"), secret("4")];
    randomness.commit("a", contributorCommit(reveals[0], "a", 1n), 0n);
    randomness.commit("b", contributorCommit(reveals[1], "b", 1n), 0n);
    expect(() => randomness.reveal("a", reveals[0], randomness.commitCutoff)).toThrow(/has not opened/);
    randomness.reveal("a", reveals[0], randomness.commitCutoff + 1n);
    randomness.reveal("b", reveals[1], randomness.revealCutoff);
    expect(randomness.snapshot().phase).toBe("ready");
    expect(randomness.finalize(randomness.revealCutoff)).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(() => randomness.finalize(randomness.revealCutoff)).not.toThrow();
  });

  test("derives contributor reveals from isolated domain inputs", () => {
    const seed = secret("5");
    expect(deriveContributorReveal(seed, "preprod", "deployment-a", 1n)).not.toBe(deriveContributorReveal(seed, "preprod", "deployment-b", 1n));
  });

  test("keeps principal custody, TWAB and claim nullifiers solvent", () => {
    const pool = new PrizePoolLedger("preprod", "test-pool", 0n);
    for (let index = 0; index < PROGRAM_CONSTANTS.disclosureCohort; index += 1) {
      const ownerSecret = secret((index + 10).toString(16).padStart(2, "0"));
      const salt = secret((index + 30).toString(16).padStart(2, "0"));
      pool.faucetClaim(ownerSecret, salt, 0n);
      pool.contribute(ownerSecret, salt, toMicroUnits("10"), 0n);
    }
    const first = pool.account(OWNER, SALT, 60n);
    expect(first.principalMicroUnits).toBe(0n);
    pool.faucetClaim(OWNER, SALT, 0n);
    pool.contribute(OWNER, SALT, toMicroUnits("10"), 0n);
    expect(pool.account(OWNER, SALT, 60n).twabSeconds).toBe(toMicroUnits("10") * 60n);
    pool.withdraw(OWNER, SALT, toMicroUnits("4"), 60n);
    expect(pool.account(OWNER, SALT, 60n).principalMicroUnits).toBe(toMicroUnits("6"));
    pool.assertSolvent();
  });

  test("does not disclose aggregates until the cutoff cohort is met", () => {
    const pool = new PrizePoolLedger("preprod", "disclosure-test", 0n);
    for (let index = 0; index < PROGRAM_CONSTANTS.disclosureCohort - 1; index += 1) {
      const ownerSecret = secret((index + 100).toString(16).padStart(2, "0"));
      const salt = secret((index + 130).toString(16).padStart(2, "0"));
      pool.faucetClaim(ownerSecret, salt, 0n);
      pool.contribute(ownerSecret, salt, toMicroUnits("1"), 0n);
    }
    const redacted = pool.snapshot(0n);
    expect(redacted.disclosureCohortMet).toBe(false);
    expect(redacted.principalReserveMicroUnits).toBeNull();
    expect(redacted.prizeReserveMicroUnits).toBeNull();
    expect(redacted.totalShareTwab).toBeNull();

    const ownerSecret = secret((100 + PROGRAM_CONSTANTS.disclosureCohort - 1).toString(16));
    const salt = secret((130 + PROGRAM_CONSTANTS.disclosureCohort - 1).toString(16));
    pool.faucetClaim(ownerSecret, salt, 0n);
    pool.contribute(ownerSecret, salt, toMicroUnits("1"), 0n);
    const disclosed = pool.snapshot(0n);
    expect(disclosed.disclosureCohortMet).toBe(true);
    expect(disclosed.principalReserveMicroUnits).toBe(toMicroUnits("5"));
    expect(disclosed.prizeReserveMicroUnits).toBe(PROGRAM_CONSTANTS.initialPrizeReserveMicroUnits);
    expect(disclosed.totalShareTwab).toBe(0n);
    expect(() => pool.account(OWNER, SALT, -1n)).toThrow(/time cannot be negative/);
    expect(pool.account(OWNER, SALT, 0n).twabSeconds).toBe(0n);
  });

  test("counts only active cutoff participants and locks late submissions", () => {
    const pool = new PrizePoolLedger("preprod", "deadline-test", 0n);
    pool.faucetClaim(OWNER, SALT, 0n);
    pool.contribute(OWNER, SALT, toMicroUnits("10"), 0n);
    pool.withdraw(OWNER, SALT, toMicroUnits("10"), 0n);
    expect(pool.snapshot(0n)).toMatchObject({ participantCount: 0, disclosureCohortMet: false, submissionLocked: false });

    expect(pool.snapshot(PROGRAM_CONSTANTS.deployerDeadlineSeconds + 1n).submissionLocked).toBe(true);
    expect(() => pool.faucetClaim(OWNER, SALT, PROGRAM_CONSTANTS.deployerDeadlineSeconds + 1n)).toThrow(/submissions are locked/);
    expect(() => pool.removeDeployer(PROGRAM_CONSTANTS.deployerDeadlineSeconds - 1n)).toThrow(/deadline/);
    pool.removeDeployer(PROGRAM_CONSTANTS.deployerDeadlineSeconds + 1n);
    expect(pool.snapshot(PROGRAM_CONSTANTS.deployerDeadlineSeconds + 1n).deployerActive).toBe(false);
  });

  test("requires two-of-three governance for pause and resume", () => {
    const pool = new PrizePoolLedger();
    expect(() => pool.pause("contributions", ["governance-1"], 0n)).toThrow(/two-of-three/);
    pool.pause("contributions", ["governance-1", "governance-2"], 0n);
    expect(() => pool.contribute(OWNER, SALT, toMicroUnits("1"), 0n)).toThrow(/contributions are paused/);
    expect(() => pool.unpause("contributions")).toThrow(/two-of-three/);
    pool.unpause("contributions", ["governance-2", "governance-3"]);
  });

  test("settles one selected private owner and preserves prize custody through claim", () => {
    const pool = new PrizePoolLedger("preprod", "settlement-test", 0n);
    const participants = Array.from({ length: PROGRAM_CONSTANTS.disclosureCohort }, (_, index) => ({
      secret: secret((index + 40).toString(16).padStart(2, "0")),
      salt: secret((index + 70).toString(16).padStart(2, "0")),
    }));
    for (const participant of participants) {
      pool.faucetClaim(participant.secret, participant.salt, 0n);
      pool.contribute(participant.secret, participant.salt, toMicroUnits("10"), 0n);
    }
    const draw = pool.snapshot(0n).draw;
    for (const contributor of ["render", "github-actions", "offline-maintainer"]) {
      const reveal = pool.deriveReveal(secret(contributor === "render" ? "81" : contributor === "github-actions" ? "82" : "83"));
      pool.commitRandomness(contributor, pool.commitForReveal(reveal, contributor), draw.commitCutoff - 1n);
      pool.revealRandomness(contributor, reveal, draw.revealOpensAt);
    }
    expect(pool.checkpointYield(draw.closesAt)).toBe(PROGRAM_CONSTANTS.simulatedYieldPerDrawMicroUnits);
    const finalized = pool.finalizeDraw(draw.revealClosesAt);
    expect(finalized.phase).toBe("finalized");
    expect(finalized.prizeMicroUnits).toBe(PROGRAM_CONSTANTS.initialPrizeReserveMicroUnits + PROGRAM_CONSTANTS.simulatedYieldPerDrawMicroUnits);

    const winner = participants.find(({ secret: ownerSecret, salt }) => {
      const owner = deriveOwnerCommitment(ownerSecret, salt);
      return hashWords(domain("winning-commitment/v1"), owner, finalized.drawId.toString()).toLowerCase() === finalized.winningCommitment?.toLowerCase();
    });
    expect(winner).toBeDefined();
    const claimed = pool.claimPrize(winner!.secret, winner!.salt, finalized.revealClosesAt);
    expect(claimed).toBe(finalized.prizeMicroUnits);
    expect(() => pool.claimPrize(winner!.secret, winner!.salt, finalized.revealClosesAt)).toThrow(/draw has not been finalized/);
    expect(pool.snapshot(finalized.revealClosesAt).draw.drawId).toBe(finalized.drawId + 1n);
    expect(pool.snapshot(finalized.revealClosesAt).draw.winningCommitment).toBeUndefined();
    pool.assertSolvent();
  });

  test("rolls an expired prize into the next draw without making reserve negative", () => {
    const pool = new PrizePoolLedger("preprod", "rollover-test", 0n);
    const participants = Array.from({ length: PROGRAM_CONSTANTS.disclosureCohort }, (_, index) => ({
      secret: secret((index + 90).toString(16).padStart(2, "0")),
      salt: secret((index + 120).toString(16).padStart(2, "0")),
    }));
    for (const participant of participants) {
      pool.faucetClaim(participant.secret, participant.salt, 0n);
      pool.contribute(participant.secret, participant.salt, toMicroUnits("1"), 0n);
    }
    const draw = pool.snapshot(0n).draw;
    for (const contributor of ["render", "github-actions", "offline-maintainer"]) {
      const reveal = pool.deriveReveal(secret(contributor === "render" ? "c1" : contributor === "github-actions" ? "c2" : "c3"));
      pool.commitRandomness(contributor, pool.commitForReveal(reveal, contributor), draw.commitCutoff - 1n);
      pool.revealRandomness(contributor, reveal, draw.revealOpensAt);
    }
    pool.checkpointYield(draw.closesAt);
    const finalized = pool.finalizeDraw(draw.revealClosesAt);
    const expiry = finalized.revealClosesAt + PROGRAM_CONSTANTS.claimWindowSeconds + 1n;
    expect(pool.rolloverExpired(expiry)).toBe(finalized.prizeMicroUnits);
    pool.assertSolvent();
    expect(pool.snapshot(expiry).draw.drawId).toBe(2n);
  });
});

describe("Winning predicate boundaries", () => {
  test("scales weighted zones into the public selection domain", () => {
    expect(boundedWinningZone(10n, 10n, 1n, 100n)).toBe(100n);
    expect(boundedWinningZone(5n, 10n, 1n, 100n)).toBe(50n);
  });

  test("treats an empty public domain as a non-winning predicate", () => {
    const note = { ownerCommitment: OWNER, principalShares: 1n, accumulatedBalanceSeconds: 0n, lastUpdate: 0n, nonce: 0n, salt: SALT } as const;
    const result = evaluateWinningPredicate({ note, cutoffTime: 1n, totalShareTwab: 1n, expectedWinnerCount: 1n, selectionDomain: 0n, randomness: OWNER, drawId: 1n, ownerSecret: OWNER, selectionSalt: SALT });
    expect(result.win).toBe(false);
    expect(result.reduction.accepted).toBe(false);
  });
});

describe("Recovery Kit and Backup Account boundaries", () => {
  test("encrypts state with deployment-bound authenticated data", async () => {
    const key = generateRecoveryKit();
    const backup = await exportPrivateState({ key, environment: "preprod", deploymentId: "dep-a", generation: 1n, state: { note: 4n } });
    await expect(restorePrivateState({ key, backup, activeEnvironment: "preprod", activeDeploymentId: "dep-a" })).resolves.toMatchObject({ generation: 1n, state: { note: 4n } });
    await expect(restorePrivateState({ key, backup, activeEnvironment: "preprod", activeDeploymentId: "dep-b" })).rejects.toThrow(/different deployment/);
  });

  test("exports the participant-held 256-bit Recovery Kit bundle", async () => {
    const key = generateRecoveryKit();
    expect(key).toMatch(/^0x[0-9a-f]{64}$/i);
    const backup = await exportPrivateState({ key, environment: "preprod", deploymentId: "dep-a", generation: 0n, state: { probe: true } });
    const parsed = parseRecoveryBundle(serializeRecoveryBundle(createRecoveryBundle(key, backup)));
    expect(parsed.key).toBe(key);
    await expect(restorePrivateState({ key: parsed.key, backup: parsed.backup, activeEnvironment: "preprod", activeDeploymentId: "dep-a" })).resolves.toMatchObject({ state: { probe: true } });
  });

  test("rejects Recovery Kit backups with missing or mismatched generations", async () => {
    const key = generateRecoveryKit();
    const backup = await exportPrivateState({ key, environment: "preprod", deploymentId: "dep-a", generation: 2n, state: { probe: true } });
    const serialized = serializeRecoveryBundle(createRecoveryBundle(key, backup));
    const missingGeneration = serialized.replace('"generation":"2n"', '"generation":null');
    const mismatchedGeneration = serialized.replace('"generation":"2n"', '"generation":"1n"');
    expect(() => parseRecoveryBundle(missingGeneration)).toThrow(/invalid Recovery Kit bundle/);
    await expect(restorePrivateState({ key, backup: { ...backup, generation: 1n }, activeEnvironment: "preprod", activeDeploymentId: "dep-a" })).rejects.toThrow(/generation binding/);
    const parsedMismatched = JSON.parse(mismatchedGeneration, (_, value) => typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value);
    await expect(restorePrivateState({ key, backup: parsedMismatched.backup, activeEnvironment: "preprod", activeDeploymentId: "dep-a" })).rejects.toThrow(/generation binding/);
  });

  test("enforces verified email, AAL2, one writer and CAS generations", async () => {
    const service = new BackupAccountService();
    service.register("person@example.com", "a sufficiently long password", "totp-secret");
    service.verifyEmail("person@example.com");
    const session = service.authenticate("person@example.com", "a sufficiently long password", totpCode("totp-secret"));
    expect(service.handoff(session, "browser-1", 0n)).toBe(0n);
    const key = generateRecoveryKit();
    const first = await service.write({ session, writerId: "browser-1", expectedGeneration: 0n, key, environment: "preprod", deploymentId: "dep", state: { ok: true } });
    expect(first.generation).toBe(1n);
    await expect(service.write({ session, writerId: "browser-1", expectedGeneration: 0n, key, environment: "preprod", deploymentId: "dep", state: {} })).rejects.toThrow(/stale/);
    expect(() => service.handoff(session, "browser-2", 0n)).toThrow(/stale/);
    expect(service.handoff(session, "browser-2", 1n)).toBe(1n);
    await expect(service.write({ session, writerId: "browser-2", expectedGeneration: 1n, key, environment: "preprod", deploymentId: "other-deployment", state: {} })).rejects.toThrow(/binding is immutable/);
  });

  test("public backup writes establish an explicit writer handoff before CAS", async () => {
    const service = new BackupAccountService();
    service.register("facade@example.com", "a sufficiently long password", "totp-secret");
    service.verifyEmail("facade@example.com");
    const session = service.authenticate("facade@example.com", "a sufficiently long password", totpCode("totp-secret"));
    const application = new ParticipantApplicationClient(new DeterministicPreprodAdapter({ startTime: 0n }), service);
    await application.connect("wallet-backup");
    await expect(application.writeBackup(session, "browser-1")).resolves.toBe(1n);
  });

  test("fails closed when no durable Backup Account store is injected", async () => {
    const application = createParticipantApplication(new DeterministicPreprodAdapter({ startTime: 0n }));
    await application.connect("wallet-no-local-backup");
    await expect(application.writeBackup({ sessionId: "unused", email: "person@example.com", aal: "aal2", expiresAt: Date.now() + 60_000 }, "browser-1")).rejects.toThrow(/durable Supabase/);
  });

  test("rejects a competing backup write after the first CAS commit", async () => {
    const service = new BackupAccountService();
    service.register("race@example.com", "a sufficiently long password", "totp-secret");
    service.verifyEmail("race@example.com");
    const session = service.authenticate("race@example.com", "a sufficiently long password", totpCode("totp-secret"));
    expect(service.handoff(session, "browser-1", 0n)).toBe(0n);
    const key = generateRecoveryKit();
    const results = await Promise.allSettled([
      service.write({ session, writerId: "browser-1", expectedGeneration: 0n, key, environment: "preprod", deploymentId: "dep", state: { winner: 1 } }),
      service.write({ session, writerId: "browser-1", expectedGeneration: 0n, key, environment: "preprod", deploymentId: "dep", state: { winner: 2 } }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(service.delete({ session, writerId: "browser-1", expectedGeneration: 1n })).resolves.toBe(2n);
    await expect(service.write({ session, writerId: "browser-1", expectedGeneration: 1n, key, environment: "preprod", deploymentId: "dep", state: {} })).rejects.toThrow(/stale/);
  });
});

describe("ParticipantApplication public seam", () => {
  test("completes the deterministic connection and faucet journey without raw providers", async () => {
    const application = createParticipantApplication(new DeterministicPreprodAdapter({ startTime: 0n }));
    await expect(application.connect("wallet-test")).resolves.toMatchObject({ network: "preprod", apiVersion: "4.0.1" });
    await expect(application.faucetClaim()).resolves.toMatchObject({ status: "finalized", indexerVisible: true, ledgerConfirmed: true });
    expect(application.snapshot.privateBalanceMicroUnits).toBe(PROGRAM_CONSTANTS.faucetAmountMicroUnits);
  });

  test("requires a participant-driven Recovery Kit export and restore before contribution", async () => {
    const adapter = new DeterministicPreprodAdapter({ startTime: 0n });
    const application = createParticipantApplication(adapter);
    await application.connect("wallet-recovery");
    expect(application.snapshot.recoveryReady).toBe(false);
    await expect(application.runRecoveryReadiness()).resolves.toBe(false);
    await expect(application.contribute("1")).rejects.toMatchObject({ code: "RECOVERY_NOT_READY" });

    const bundle = await application.exportRecoveryBundle();
    expect(application.snapshot.recoveryReady).toBe(false);
    await application.restoreRecovery(serializeRecoveryBundle(bundle));
    expect(application.snapshot.recoveryReady).toBe(true);
    expect(adapter.restoredRecoveryState()).toMatchObject({ walletId: "wallet-recovery" });
    await expect(application.faucetClaim()).resolves.toMatchObject({ status: "finalized" });
    await expect(application.contribute("1")).resolves.toMatchObject({ status: "finalized" });

    await application.disconnect();
    await application.connect("wallet-recovery-next");
    expect(application.snapshot.recoveryReady).toBe(false);
    await expect(application.contribute("1")).rejects.toMatchObject({ code: "RECOVERY_NOT_READY" });
  });

  test("routes an explicit sponsorship choice through the adapter and preserves a wallet fallback", async () => {
    const requests: string[] = [];
    const application = createParticipantApplication(new DeterministicPreprodAdapter({
      startTime: 0n,
      sponsor: async ({ command, wallet }) => { requests.push(`${command}:${wallet.walletId}`); },
    }));
    await application.connect("wallet-sponsored");
    application.setSponsorship("sponsored");
    await expect(application.faucetClaim()).resolves.toMatchObject({ sponsorship: "sponsored" });
    expect(requests).toEqual(["faucetClaim:wallet-sponsored"]);

    const rejected = createParticipantApplication(new DeterministicPreprodAdapter({ startTime: 0n }));
    await rejected.connect("wallet-fallback");
    rejected.setSponsorship("sponsored");
    await expect(rejected.faucetClaim()).rejects.toMatchObject({ code: "SPONSOR_REJECTED", retryable: true });
    rejected.setSponsorship("participant-funded");
    await expect(rejected.faucetClaim()).resolves.toMatchObject({ sponsorship: "participant-funded" });
  });
});
