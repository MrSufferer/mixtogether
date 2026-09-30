import { describe, expect, test } from "vitest";
import { createRandomnessRuntimeFromEnvironment } from "./runtime";

const complete = {
  SHROUDLY_RANDOMNESS_DEPLOYMENT_ID: "dep",
  SHROUDLY_RANDOMNESS_CONTRACT_ID: "randomness",
  SHROUDLY_RANDOMNESS_CONTRIBUTOR: "render",
  SHROUDLY_RENDER_AUTOMATION_TOKEN: "ingress",
  SHROUDLY_RANDOMNESS_UPSTREAM_URL: "https://provider.example.test/submit",
  SHROUDLY_RANDOMNESS_UPSTREAM_TOKEN: "upstream",
};

describe("randomness signer runtime", () => {
  test("is unhealthy when provider configuration is incomplete", () => {
    const runtime = createRandomnessRuntimeFromEnvironment({});
    expect(runtime.ready).toBe(false);
    expect(runtime.missing).toContain("SHROUDLY_RANDOMNESS_DEPLOYMENT_ID");
  });

  test("rejects a non-HTTPS provider endpoint", () => {
    const runtime = createRandomnessRuntimeFromEnvironment({ ...complete, SHROUDLY_RANDOMNESS_UPSTREAM_URL: "http://provider.example.test/submit" });
    expect(runtime.ready).toBe(false);
    expect(runtime.missing[0]).toMatch(/HTTPS/);
  });

  test("constructs a ready runtime without exposing provider secrets", () => {
    const runtime = createRandomnessRuntimeFromEnvironment(complete);
    expect(runtime.ready).toBe(true);
    expect(runtime.missing).toEqual([]);
    expect(JSON.stringify(runtime)).not.toContain("upstream");
    expect(JSON.stringify(runtime)).not.toContain("ingress");
  });
});
