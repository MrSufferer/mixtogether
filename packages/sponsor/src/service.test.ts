import { describe, expect, test } from "vitest";
import { SponsorService, type SponsorRequest } from "./service";

function request(overrides: Partial<SponsorRequest> = {}): SponsorRequest {
  return {
    idempotencyKey: "action-1",
    operation: "submit",
    transaction: JSON.stringify({ action: "submit", value: 0 }),
    participantProof: "proof",
    valueBalanced: true,
    signature: "signature",
    binding: { environment: "preprod", deploymentId: "dep", accountId: "account-1" },
    qualificationCost: 100n,
    ...overrides,
  };
}

describe("DUST sponsor policy boundary", () => {
  test("requires Backup Account authentication and preserves the participant fallback", async () => {
    const service = new SponsorService();
    await expect(service.handle(undefined, request())).resolves.toMatchObject({ ok: false, code: "UNAUTHORIZED", fallback: "participant-funded-dust" });
  });

  test("allows only balanced, proved, idempotent actions", async () => {
    const service = new SponsorService({ authenticate: async (token) => token === "token" ? { accountId: "account-1" } : null });
    const first = await service.handle("token", request());
    expect(first).toMatchObject({ ok: true, transaction: { operation: "submit", finalized: true } });
    if (!first.ok) throw new Error("expected first sponsorship to succeed");
    const repeat = await service.handle("token", request());
    if (!repeat.ok) throw new Error("expected idempotent sponsorship to succeed");
    expect(repeat.transaction).toEqual(first.transaction);
    await expect(service.handle("token", request({ idempotencyKey: "action-2", valueBalanced: false }))).resolves.toMatchObject({ ok: false, code: "POLICY_REJECTED" });
    await expect(service.handle("token", request({ idempotencyKey: "action-3", qualificationCost: 126n }))).resolves.toMatchObject({ ok: false, code: "POLICY_REJECTED" });
  });

  test("enforces account and global quotas and exposes redacted logs", async () => {
    const service = new SponsorService({ accountQuota: 1, globalQuota: 1, authenticate: async () => ({ accountId: "account-1" }) });
    const first = await service.handle("token", request());
    expect(service.redactedLog(first)).not.toHaveProperty("participantProof");
    await expect(service.handle("token", request({ idempotencyKey: "action-2" }))).resolves.toMatchObject({ ok: false, code: "QUOTA_EXCEEDED" });
  });

  test("returns a retryable timeout while preserving the same action key", async () => {
    const service = new SponsorService({ timeoutMs: 5, authenticate: async () => ({ accountId: "account-1" }), submit: async () => new Promise(() => undefined) });
    await expect(service.handle("token", request())).resolves.toMatchObject({ ok: false, code: "TIMEOUT", retryable: true, fallback: "participant-funded-dust" });
  });

  test("keeps an upstream rejection retryable for wallet-funded fallback", async () => {
    const service = new SponsorService({ authenticate: async () => ({ accountId: "account-1" }), submit: async () => ({ submitted: false, finalized: false }) });
    await expect(service.handle("token", request())).resolves.toMatchObject({ ok: false, code: "UPSTREAM_REJECTED", retryable: true, fallback: "participant-funded-dust" });
  });
});
