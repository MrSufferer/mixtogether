import { describe, expect, test } from "vitest";
import { handleSponsorRequest } from "./http";
import { sponsorAuthorizationMessage, SponsorService } from "./service";
import { generateKeyPairSync, sign as signBytes } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

describe("sponsor HTTP boundary", () => {
  test("rejects non-POST and malformed JSON", async () => {
    const service = new SponsorService();
    expect((await handleSponsorRequest(new Request("https://sponsor.test", { method: "GET" }), service)).status).toBe(405);
    expect((await handleSponsorRequest(new Request("https://sponsor.test", { method: "POST", body: "{" }), service)).status).toBe(400);
  });

  test("normalizes JSON qualification costs and never caches responses", async () => {
    const now = 1_800_000_000_000;
    const unsigned = { idempotencyKey: "x", operation: "submit" as const, transaction: JSON.stringify({ action: "submit", valueBalanced: true, networkId: "preprod", deploymentId: "dep", contractId: "pool", circuitId: "submit", accountId: "a", qualificationCost: "100", expiresAt: now + 60_000 }), participantProof: "proof", valueBalanced: true, signature: "", participantPublicKey: publicKeyPem, binding: { environment: "preprod" as const, networkId: "preprod" as const, deploymentId: "dep", contractId: "pool", circuitId: "submit", accountId: "a", qualificationCost: 100n, expiresAt: now + 60_000 }, qualificationCost: 100n };
    const signed = { ...unsigned, signature: signBytes(null, Buffer.from(sponsorAuthorizationMessage(unsigned)), privateKey).toString("base64") };
    const service = new SponsorService({ deploymentId: "dep", allowedContractIds: ["pool"], allowedCircuitIds: ["submit"], now: () => now, authenticate: async () => ({ accountId: "a" }), submit: async () => ({ transactionId: `0x${"c".repeat(64)}`, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }) });
    const response = await handleSponsorRequest(new Request("https://sponsor.test", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify(signed, (_, value) => typeof value === "bigint" ? value.toString() : value) }), service);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: true, transaction: { dustAdded: "0" } });
  });
});
