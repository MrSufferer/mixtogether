import { describe, expect, test } from "vitest";
import { createSponsorRuntimeFromEnvironment } from "./runtime";

const configuredEnvironment = {
  MIDNIGHT_SPONSOR_DEPLOYMENT_ID: "shroudly-preprod-1",
  MIDNIGHT_SPONSOR_CONTRACT_IDS: "pool",
  MIDNIGHT_SPONSOR_CIRCUIT_IDS: "submit",
  MIDNIGHT_SPONSOR_UPSTREAM_URL: "https://upstream.example.test/submit",
  MIDNIGHT_SPONSOR_UPSTREAM_TOKEN: "upstream-token",
  SUPABASE_URL: "https://supabase.example.test",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
} as NodeJS.ProcessEnv;

describe("sponsor production runtime", () => {
  test("stays not ready when any trust boundary is absent", () => {
    const runtime = createSponsorRuntimeFromEnvironment({ SUPABASE_URL: "https://supabase.example.test" });
    expect(runtime.ready).toBe(false);
    expect(runtime.missing).toContain("MIDNIGHT_SPONSOR_UPSTREAM_TOKEN");
    expect(runtime.missing).toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  test("rejects non-HTTPS provider configuration before serving traffic", () => {
    const runtime = createSponsorRuntimeFromEnvironment({ ...configuredEnvironment, MIDNIGHT_SPONSOR_UPSTREAM_URL: "http://upstream.example.test" });
    expect(runtime.ready).toBe(false);
    expect(runtime.missing.join(" ")).toMatch(/HTTPS/);
  });

  test("constructs a ready runtime only with complete provider configuration", () => {
    const runtime = createSponsorRuntimeFromEnvironment(configuredEnvironment, async () => new Response("{}", { status: 200 }));
    expect(runtime.ready).toBe(true);
    expect(runtime.missing).toEqual([]);
    expect(runtime.service.dustCap()).toBe(125n);
  });
});
