import { RandomnessSignerService, type FinalizedRandomnessSubmission, type RandomnessIntent } from "./service";

export type RandomnessRuntime = Readonly<{ service: RandomnessSignerService; ready: boolean; missing: readonly string[] }>;

/**
 * Construct the Render boundary from server-side configuration. The upstream
 * must be the reviewed Midnight transaction adapter; this package deliberately
 * does not turn an intent hash into a fake on-chain receipt.
 */
export function createRandomnessRuntimeFromEnvironment(environment: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = fetch): RandomnessRuntime {
  const required = [
    "SHROUDLY_RANDOMNESS_DEPLOYMENT_ID",
    "SHROUDLY_RANDOMNESS_CONTRACT_ID",
    "SHROUDLY_RANDOMNESS_CONTRIBUTOR",
    "SHROUDLY_RENDER_AUTOMATION_TOKEN",
    "SHROUDLY_RANDOMNESS_UPSTREAM_URL",
    "SHROUDLY_RANDOMNESS_UPSTREAM_TOKEN",
  ];
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length) return { service: new RandomnessSignerService({ deploymentId: "not-ready", contractId: "not-ready", contributor: "render", ingressToken: "not-ready" }), ready: false, missing };

  try {
    const deploymentId = requireEnvironment(environment, "SHROUDLY_RANDOMNESS_DEPLOYMENT_ID");
    const contractId = requireEnvironment(environment, "SHROUDLY_RANDOMNESS_CONTRACT_ID");
    const contributor = requireEnvironment(environment, "SHROUDLY_RANDOMNESS_CONTRIBUTOR");
    if (contributor !== "render") throw new Error("SHROUDLY_RANDOMNESS_CONTRIBUTOR must be render");
    const service = new RandomnessSignerService({
      deploymentId,
      contractId,
      contributor,
      ingressToken: requireEnvironment(environment, "SHROUDLY_RENDER_AUTOMATION_TOKEN"),
      submit: createUpstreamSubmitter(requireEnvironment(environment, "SHROUDLY_RANDOMNESS_UPSTREAM_URL"), requireEnvironment(environment, "SHROUDLY_RANDOMNESS_UPSTREAM_TOKEN"), fetchImpl),
    });
    return { service, ready: true, missing: [] };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "randomness provider configuration is invalid";
    return { service: new RandomnessSignerService({ deploymentId: "not-ready", contractId: "not-ready", contributor: "render", ingressToken: "not-ready" }), ready: false, missing: [message] };
  }
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function createUpstreamSubmitter(url: string, upstreamToken: string, fetchImpl: FetchLike): (intent: RandomnessIntent, contractId: string, signal?: AbortSignal) => Promise<FinalizedRandomnessSubmission> {
  assertHttpsEndpoint("randomness upstream URL", url);
  return async (intent, contractId, signal) => {
    const response = await fetchImpl(url, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${upstreamToken}` }, body: JSON.stringify({ contractId, intent }), signal });
    if (!response.ok) throw new Error(`randomness upstream rejected with HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || typeof payload.transactionId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(payload.transactionId) || typeof payload.networkFinalized !== "boolean" || typeof payload.indexerVisible !== "boolean" || typeof payload.ledgerConfirmed !== "boolean") throw new Error("randomness upstream returned an invalid finality receipt");
    return { transactionId: payload.transactionId, networkFinalized: payload.networkFinalized, indexerVisible: payload.indexerVisible, ledgerConfirmed: payload.ledgerConfirmed };
  };
}

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string): string { const value = environment[name]?.trim(); if (!value) throw new Error(`${name} is required`); return value; }
function assertHttpsEndpoint(label: string, value: string): void { let parsed: URL; try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid HTTPS URL`); } if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS`); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
