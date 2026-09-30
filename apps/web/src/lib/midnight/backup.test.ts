import { describe, expect, test } from "vitest";
import { SupabaseBackupAccountStore, type BackupFetchLike, type BackupSession } from "./backup";

function session(): BackupSession {
  return { sessionId: "session-1", email: "participant@example.test", aal: "aal2", expiresAt: Date.now() + 60_000, accountId: "account-1", accessToken: "access-token" };
}

describe("Supabase Backup Account boundary", () => {
  test("requires an HTTPS endpoint and an authenticated-session key", () => {
    expect(() => new SupabaseBackupAccountStore({ url: "http://supabase.example.test", anonKey: "anon" })).toThrow(/HTTPS/);
    expect(() => new SupabaseBackupAccountStore({ url: "https://supabase.example.test", anonKey: "" })).toThrow(/anon key/);
  });

  test("accepts scalar, row-object, and array-shaped RPC generation results", async () => {
    const calls: string[] = [];
    const fetchImpl: BackupFetchLike = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("handoff_backup_cas")) return new Response(JSON.stringify({ handoff_backup_cas: "7" }), { status: 200 });
      if (url.includes("backup_accounts")) return new Response(JSON.stringify([{ email: "participant@example.test", verified_email: true, generation: "7", active_writer: "writer-1", encrypted_state: null }]), { status: 200 });
      return new Response(null, { status: 204 });
    };
    const store = new SupabaseBackupAccountStore({ url: "https://supabase.example.test", anonKey: "anon-key", fetch: fetchImpl });
    await expect(store.handoff(session(), "writer-1", 7n)).resolves.toBe(7n);
    await expect(store.read({ session: session(), key: `0x${"a".repeat(64)}`, environment: "preprod", deploymentId: "deployment-1" })).rejects.toThrow(/no backup/);
    expect(calls.some((url) => url.includes("handoff_backup_cas"))).toBe(true);
    expect(calls.some((url) => url.includes("backup_accounts"))).toBe(true);
  });
});
