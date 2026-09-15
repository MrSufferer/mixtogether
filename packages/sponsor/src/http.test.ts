import { describe, expect, test } from "vitest";
import { handleSponsorRequest } from "./http";
import { SponsorService } from "./service";

describe("sponsor HTTP boundary", () => {
  test("rejects non-POST and malformed JSON", async () => {
    const service = new SponsorService();
    expect((await handleSponsorRequest(new Request("https://sponsor.test", { method: "GET" }), service)).status).toBe(405);
    expect((await handleSponsorRequest(new Request("https://sponsor.test", { method: "POST", body: "{" }), service)).status).toBe(400);
  });

  test("normalizes JSON qualification costs and never caches responses", async () => {
    const service = new SponsorService({ authenticate: async () => ({ accountId: "a" }) });
    const response = await handleSponsorRequest(new Request("https://sponsor.test", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: "x", operation: "submit", transaction: JSON.stringify({ action: "submit" }), participantProof: "proof", valueBalanced: true, signature: "sig", binding: { environment: "preprod", deploymentId: "dep", accountId: "a" }, qualificationCost: "100" }) }), service);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ ok: true, transaction: { dustAdded: "0" } });
  });
});
