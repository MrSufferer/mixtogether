import { describe, expect, test } from "vitest";
import { SupabaseSponsorStateStore, type FetchLike } from "./state";

const completed = {
  account_id: "account-1",
  authorization_digest: "a".repeat(64),
  transaction: {
    idempotencyKey: "action-1",
    operation: "submit",
    transactionId: `0x${"b".repeat(64)}`,
    dustAdded: "125",
    networkFinalized: true,
    indexerVisible: true,
    ledgerConfirmed: true,
  },
};

function response(value: unknown, status = 200): Response {
  return new Response(value === undefined ? null : JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

describe("Supabase sponsor state store", () => {
  test("requires an HTTPS server-side Supabase endpoint and key", () => {
    expect(() => new SupabaseSponsorStateStore({ url: "http://supabase.example.test", serviceRoleKey: "secret" })).toThrow(/HTTPS/);
    expect(() => new SupabaseSponsorStateStore({ url: "https://supabase.example.test", serviceRoleKey: "" })).toThrow(/service-role key/);
  });

  test("round-trips completed transactions and serializes secret-free wire state", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: FetchLike = async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (init?.method === "POST") return response(undefined, 201);
      return response([completed]);
    };
    const store = new SupabaseSponsorStateStore({ url: "https://supabase.example.test", serviceRoleKey: "service-role-secret", fetch: fetchImpl });
    const loaded = await store.loadCompleted("account-1:action-1");
    expect(loaded?.transaction.dustAdded).toBe(125n);
    const saved = await store.putCompleted("account-1:action-1", loaded!);
    expect(saved).toEqual(loaded);
    expect(calls[0].init?.headers).toBeDefined();
    expect(new Headers(calls[0].init?.headers).get("authorization")).toBe("Bearer service-role-secret");
    expect(String(calls[1].init?.body)).toContain('"dustAdded":"125"');
    expect(String(calls[1].init?.body)).not.toContain("service-role-secret");
  });

  test("uses atomic RPCs for quota and uncertain-submission ownership", async () => {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("reserve_sponsorship_quota")) return response(true);
      if (url.includes("claim_sponsor_uncertain")) return response({ account_id: "account-1", authorization_digest: "a".repeat(64), acquired: true });
      return response(undefined, 204);
    };
    const store = new SupabaseSponsorStateStore({ url: "https://supabase.example.test", serviceRoleKey: "service-role-secret", fetch: fetchImpl });
    await expect(store.reserveQuota({ accountId: "account-1", idempotencyId: "account-1:action-1", now: 1_800_000_000_000, accountLimit: 20, globalLimit: 500 })).resolves.toBe(true);
    await expect(store.claimUncertain("account-1:action-1", { accountId: "account-1", authorizationDigest: "a".repeat(64) })).resolves.toMatchObject({ acquired: true });
    await expect(store.clearUncertain("account-1:action-1", "a".repeat(64))).resolves.toBeUndefined();
    expect(calls.some((url) => url.includes("rpc/reserve_sponsorship_quota"))).toBe(true);
    expect(calls.some((url) => url.includes("rpc/claim_sponsor_uncertain"))).toBe(true);
  });
});
