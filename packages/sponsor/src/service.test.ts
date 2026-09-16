import { generateKeyPairSync, sign as signBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { SponsorService, sponsorAuthorizationMessage, type FinalizedSponsorSubmission, type SponsorRequest, type SponsorServiceOptions } from "./service";
import { InMemorySponsorStateStore } from "./state";

const NOW = 1_800_000_000_000;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const participantPublicKey = publicKey.export({ type: "spki", format: "pem" }).toString();
type RequestOverrides = Omit<Partial<SponsorRequest>, "binding"> & { binding?: Partial<SponsorRequest["binding"]> };

function request(overrides: RequestOverrides = {}): SponsorRequest {
  const { binding: bindingOverrides, signature: requestedSignature, ...requestOverrides } = overrides;
  const unsigned = {
    idempotencyKey: "action-1",
    operation: "submit",
    transaction: JSON.stringify({ action: "submit", value: 0, valueBalanced: true, networkId: "preprod", deploymentId: "dep", contractId: "pool-contract", circuitId: "submit", accountId: "account-1", qualificationCost: "100", expiresAt: NOW + 60_000 }),
    participantProof: "proof",
    valueBalanced: true,
    signature: "",
    participantPublicKey,
    qualificationCost: 100n,
    ...requestOverrides,
    binding: { environment: "preprod", networkId: "preprod", deploymentId: "dep", contractId: "pool-contract", circuitId: "submit", accountId: "account-1", qualificationCost: 100n, expiresAt: NOW + 60_000, ...bindingOverrides },
  } as SponsorRequest;
  return { ...unsigned, signature: requestedSignature ?? signBytes(null, Buffer.from(sponsorAuthorizationMessage(unsigned)), privateKey).toString("base64") };
}

function serviceOptions(overrides: SponsorServiceOptions = {}): SponsorServiceOptions {
  return {
    deploymentId: "dep",
    allowedContractIds: ["pool-contract"],
    allowedCircuitIds: ["submit"],
    now: () => NOW,
    authenticate: async (token) => token === "token" ? { accountId: "account-1" } : null,
    submit: async () => ({ transactionId: `0x${"a".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }),
    ...overrides,
  };
}

describe("DUST sponsor policy boundary", () => {
  test("requires Backup Account authentication and preserves the participant fallback", async () => {
    const service = new SponsorService();
    await expect(service.handle(undefined, request())).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED", fallback: "participant-funded-dust" });
  });

  test("allows only balanced, proved, idempotent actions", async () => {
    const service = new SponsorService(serviceOptions());
    const first = await service.handle("token", request());
    expect(first).toMatchObject({ ok: true, transaction: { operation: "submit", networkFinalized: true, indexerVisible: true, ledgerConfirmed: true } });
    if (!first.ok) throw new Error("expected first sponsorship to succeed");
    const repeat = await service.handle("token", request());
    if (!repeat.ok) throw new Error("expected idempotent sponsorship to succeed");
    expect(repeat.transaction).toEqual(first.transaction);
    await expect(service.handle("token", request({ idempotencyKey: "action-2", valueBalanced: false }))).resolves.toMatchObject({ ok: false, code: "POLICY_REJECTED" });
    await expect(service.handle("token", request({ idempotencyKey: "action-3", qualificationCost: 126n }))).resolves.toMatchObject({ ok: false, code: "POLICY_REJECTED" });
  });

  test("enforces account and global quotas and exposes redacted logs", async () => {
    const service = new SponsorService(serviceOptions({ accountQuota: 1, globalQuota: 1 }));
    const first = await service.handle("token", request());
    expect(service.redactedLog(first)).not.toHaveProperty("participantProof");
    await expect(service.handle("token", request({ idempotencyKey: "action-2" }))).resolves.toMatchObject({ ok: false, code: "QUOTA_EXCEEDED" });
  });

  test("does not retry an unresolved timed-out submission", async () => {
    let submissions = 0;
    let aborted = false;
    let resolveSubmission!: (result: FinalizedSponsorSubmission) => void;
    const submission = new Promise<FinalizedSponsorSubmission>((resolve) => { resolveSubmission = resolve; });
    const service = new SponsorService(serviceOptions({ timeoutMs: 5, submit: async (_request, _dustCap, signal) => { submissions += 1; signal?.addEventListener("abort", () => { aborted = true; }); return submission; } }));
    await expect(service.handle("token", request())).resolves.toMatchObject({ ok: false, code: "TIMEOUT", retryable: false, fallback: "participant-funded-dust" });
    expect(aborted).toBe(true);
    await expect(service.handle("token", request())).resolves.toMatchObject({ ok: false, code: "TIMEOUT", retryable: false });
    expect(submissions).toBe(1);

    resolveSubmission({ transactionId: `0x${"d".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(service.handle("token", request())).resolves.toMatchObject({ ok: true, transaction: { transactionId: `0x${"d".repeat(64)}` } });
    expect(submissions).toBe(1);
  });

  test("keeps a local reconciliation marker when a timed-out provider later rejects", async () => {
    let submissions = 0;
    let rejectSubmission!: (reason?: unknown) => void;
    const pending = new Promise<FinalizedSponsorSubmission>((_resolve, reject) => { rejectSubmission = reject; });
    const service = new SponsorService(serviceOptions({ timeoutMs: 5, submit: async (_request, _dustCap, signal) => { submissions += 1; signal?.addEventListener("abort", () => undefined); return pending; } }));

    await expect(service.handle("token", request())).resolves.toMatchObject({ ok: false, code: "TIMEOUT", retryable: false });
    rejectSubmission(new Error("provider rejected after timeout"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(service.handle("token", request())).resolves.toMatchObject({ ok: false, code: "TIMEOUT", retryable: false });
    expect(submissions).toBe(1);
  });

  test("keeps an upstream rejection retryable for wallet-funded fallback", async () => {
    const service = new SponsorService(serviceOptions({ submit: async () => ({ transactionId: "", networkFinalized: false, indexerVisible: false, ledgerConfirmed: false }) }));
    await expect(service.handle("token", request())).resolves.toMatchObject({ ok: false, code: "UPSTREAM_REJECTED", retryable: true, fallback: "participant-funded-dust" });
  });

  test("contains asynchronous upstream rejection and preserves reconciliation safety", async () => {
    let submissions = 0;
    const service = new SponsorService(serviceOptions({ submit: async () => { submissions += 1; throw new Error("provider unavailable"); } }));
    await expect(service.handle("token", request())).resolves.toMatchObject({ ok: false, code: "UPSTREAM_REJECTED", retryable: true, fallback: "participant-funded-dust" });
    await expect(service.handle("token", request())).resolves.toMatchObject({ ok: false, code: "TIMEOUT", retryable: false });
    expect(submissions).toBe(1);
  });

  test("cryptographically verifies participant authorization before submission", async () => {
    const service = new SponsorService(serviceOptions());
    await expect(service.handle("token", request({ signature: "not-a-valid-ed25519-signature" }))).resolves.toMatchObject({ ok: false, code: "INVALID_SIGNATURE" });
    await expect(service.handle("token", request({ binding: { contractId: "other-contract" } }))).resolves.toMatchObject({ ok: false, code: "POLICY_REJECTED" });
    await expect(service.handle("token", request({ binding: { expiresAt: NOW - 1 } }))).resolves.toMatchObject({ ok: false, code: "POLICY_REJECTED" });
  });

  test("does not let an idempotency key replay a different signed request", async () => {
    const service = new SponsorService(serviceOptions());
    const first = await service.handle("token", request());
    expect(first.ok).toBe(true);
    await expect(service.handle("token", request({ participantProof: "different-proof" }))).resolves.toMatchObject({ ok: false, code: "POLICY_REJECTED" });
  });

  test("serializes concurrent identical idempotent submissions", async () => {
    let submissions = 0;
    const service = new SponsorService(serviceOptions({ submit: async () => { submissions += 1; return { transactionId: `0x${"b".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }; } }));
    const [first, second] = await Promise.all([service.handle("token", request()), service.handle("token", request())]);
    expect(first).toMatchObject({ ok: true });
    expect(second).toEqual(first);
    expect(submissions).toBe(1);
  });

  test("replays a completed result after the service is restarted", async () => {
    const stateStore = new InMemorySponsorStateStore();
    let submissions = 0;
    const options = serviceOptions({
      stateStore,
      submit: async () => {
        submissions += 1;
        return { transactionId: `0x${"e".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true };
      },
    });
    const first = await new SponsorService(options).handle("token", request());
    const afterRestart = await new SponsorService(options).handle("token", request());

    expect(afterRestart).toEqual(first);
    expect(submissions).toBe(1);
  });

  test("persists an uncertain timeout and reconciles a late finalized result", async () => {
    const stateStore = new InMemorySponsorStateStore();
    let submissions = 0;
    let resolveSubmission!: (result: FinalizedSponsorSubmission) => void;
    const pending = new Promise<FinalizedSponsorSubmission>((resolve) => { resolveSubmission = resolve; });
    const options = serviceOptions({ stateStore, timeoutMs: 5, submit: async () => { submissions += 1; return pending; } });

    await expect(new SponsorService(options).handle("token", request())).resolves.toMatchObject({ code: "TIMEOUT", retryable: false });
    await expect(new SponsorService(options).handle("token", request())).resolves.toMatchObject({ code: "TIMEOUT", retryable: false });
    expect(submissions).toBe(1);

    resolveSubmission({ transactionId: `0x${"f".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(new SponsorService(options).handle("token", request())).resolves.toMatchObject({ ok: true, transaction: { transactionId: `0x${"f".repeat(64)}` } });
  });

  test("atomically allows only one process to claim an uncertain submission", async () => {
    const stateStore = new InMemorySponsorStateStore();
    const claims = await Promise.all([
      stateStore.claimUncertain("account-1:action-1", { accountId: "account-1", authorizationDigest: "digest" }),
      stateStore.claimUncertain("account-1:action-1", { accountId: "account-1", authorizationDigest: "digest" }),
    ]);
    expect(claims.filter((claim) => claim.acquired)).toHaveLength(1);
    expect(claims.filter((claim) => !claim.acquired)).toHaveLength(1);
  });
});
