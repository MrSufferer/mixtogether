import { describe, expect, test } from "vitest";
import { RandomnessSignerService, type RandomnessIntent } from "./service";

const intent: RandomnessIntent = {
  format: "shroudly-randomness-intent-v1",
  action: "commit",
  environment: "preprod",
  deploymentId: "dep",
  drawId: "draw-1",
  contributor: "render",
  credentialScope: "render",
  commitment: `0x${"1".repeat(64)}`,
  idempotencyKey: `0x${"2".repeat(32)}`,
};

function options(overrides: Partial<ConstructorParameters<typeof RandomnessSignerService>[0]> = {}): ConstructorParameters<typeof RandomnessSignerService>[0] {
  return {
    deploymentId: "dep",
    contractId: "randomness-contract",
    contributor: "render",
    ingressToken: "token",
    submit: async () => ({ transactionId: `0x${"a".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }),
    ...overrides,
  };
}

describe("randomness signer boundary", () => {
  test("requires the contributor-scoped credential and rejects other contributors", async () => {
    const service = new RandomnessSignerService(options());
    await expect(service.handle(undefined, intent)).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    await expect(service.handle("token", { ...intent, contributor: "github-actions", credentialScope: "github-actions" })).resolves.toMatchObject({ ok: false, code: "POLICY_REJECTED" });
  });

  test("submits only valid intents and returns the independent finality receipt", async () => {
    let contractId = "";
    const service = new RandomnessSignerService(options({ submit: async (submitted, configuredContractId) => { expect(submitted).toEqual(intent); contractId = configuredContractId; return { transactionId: `0x${"b".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }; } }));
    await expect(service.handle("token", intent)).resolves.toMatchObject({ ok: true, transaction: { action: "commit", drawId: "draw-1", transactionId: `0x${"b".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true } });
    expect(contractId).toBe("randomness-contract");
  });

  test("replays an identical idempotent intent without a second provider call", async () => {
    let submissions = 0;
    const service = new RandomnessSignerService(options({ submit: async () => { submissions += 1; return { transactionId: `0x${"c".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }; } }));
    const first = await service.handle("token", intent);
    const second = await service.handle("token", intent);
    expect(second).toEqual(first);
    expect(submissions).toBe(1);
    await expect(service.handle("token", { ...intent, commitment: `0x${"d".repeat(64)}` })).resolves.toMatchObject({ ok: false, code: "POLICY_REJECTED" });
  });

  test("does not claim success when provider finality is incomplete", async () => {
    const service = new RandomnessSignerService(options({ submit: async () => ({ transactionId: `0x${"e".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: false }) }));
    await expect(service.handle("token", intent)).resolves.toMatchObject({ ok: false, code: "UPSTREAM_REJECTED", retryable: true });
  });

  test("keeps an uncertain timeout from being submitted twice", async () => {
    let submissions = 0;
    let resolveSubmission!: (value: { transactionId: string; networkFinalized: boolean; indexerVisible: boolean; ledgerConfirmed: boolean }) => void;
    const pending = new Promise<{ transactionId: string; networkFinalized: boolean; indexerVisible: boolean; ledgerConfirmed: boolean }>((resolve) => { resolveSubmission = resolve; });
    const service = new RandomnessSignerService(options({ timeoutMs: 5, submit: async () => { submissions += 1; return pending; } }));
    await expect(service.handle("token", intent)).resolves.toMatchObject({ ok: false, code: "TIMEOUT", retryable: false });
    await expect(service.handle("token", intent)).resolves.toMatchObject({ ok: false, code: "TIMEOUT", retryable: false });
    expect(submissions).toBe(1);
    resolveSubmission({ transactionId: `0x${"f".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true });
    await new Promise((resolve) => setTimeout(resolve, 0));
    await expect(service.handle("token", intent)).resolves.toMatchObject({ ok: true, transaction: { transactionId: `0x${"f".repeat(64)}` } });
  });
});
