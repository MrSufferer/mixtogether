import { SponsorService, type FinalizedSponsorSubmission, type SponsorRequest } from "./service.ts";
import { createSupabaseSponsorStateStore, type FetchLike as StateFetchLike } from "./state.ts";

export type SponsorRuntime = Readonly<{ service: SponsorService; ready: boolean; missing: readonly string[] }>;

/**
 * Build the Render service only when every production trust boundary is
 * present. The returned not-ready service is still fail-closed, while the
 * health endpoint can accurately prevent traffic from reaching it.
 */
export function createSponsorRuntimeFromEnvironment(environment: NodeJS.ProcessEnv = process.env, fetchImpl: FetchLike = fetch): SponsorRuntime {
  const required = [
    "MIDNIGHT_SPONSOR_DEPLOYMENT_ID",
    "MIDNIGHT_SPONSOR_CONTRACT_IDS",
    "MIDNIGHT_SPONSOR_CIRCUIT_IDS",
    "MIDNIGHT_SPONSOR_UPSTREAM_URL",
    "MIDNIGHT_SPONSOR_UPSTREAM_TOKEN",
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length) return { service: new SponsorService(), ready: false, missing };

  try {
    const deploymentId = requireEnvironment(environment, "MIDNIGHT_SPONSOR_DEPLOYMENT_ID");
    const allowedContractIds = splitAllowlist(environment.MIDNIGHT_SPONSOR_CONTRACT_IDS, "contract");
    const allowedCircuitIds = splitAllowlist(environment.MIDNIGHT_SPONSOR_CIRCUIT_IDS, "circuit");
    const supabaseUrl = requireEnvironment(environment, "SUPABASE_URL");
    const supabaseAnonKey = requireEnvironment(environment, "SUPABASE_ANON_KEY");
    const stateStore = createSupabaseSponsorStateStore({ url: supabaseUrl, serviceRoleKey: requireEnvironment(environment, "SUPABASE_SERVICE_ROLE_KEY"), fetch: fetchImpl as StateFetchLike });
    const service = new SponsorService({
      deploymentId,
      allowedContractIds,
      allowedCircuitIds,
      stateStore,
      authenticate: createSupabaseAuthenticator(supabaseUrl, supabaseAnonKey, fetchImpl),
      submit: createUpstreamSubmitter(requireEnvironment(environment, "MIDNIGHT_SPONSOR_UPSTREAM_URL"), requireEnvironment(environment, "MIDNIGHT_SPONSOR_UPSTREAM_TOKEN"), fetchImpl),
    });
    return { service, ready: true, missing: [] };
  } catch (cause) {
    // Do not expose endpoint/key validation details through health responses.
    // Operators can see the exact startup failure in their provider logs.
    const message = cause instanceof Error ? cause.message : "provider configuration is invalid";
    return { service: new SponsorService(), ready: false, missing: [message] };
  }
}

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function createSupabaseAuthenticator(url: string, anonKey: string, fetchImpl: FetchLike): (token: string) => Promise<{ accountId: string } | null> {
  assertHttpsEndpoint("Supabase URL", url);
  return async (token) => {
    if (!token.trim() || token.length > 16_384) return null;
    const claims = readJwtClaims(token);
    if (claims?.aal !== "aal2") return null;
    const response = await fetchImpl(`${url.replace(/\/$/, "")}/auth/v1/user`, { method: "GET", headers: { accept: "application/json", apikey: anonKey, authorization: `Bearer ${token}` } });
    if (!response.ok) return null;
    const user: unknown = await response.json();
    if (!isRecord(user) || typeof user.id !== "string" || !user.id.trim()) return null;
    return { accountId: user.id };
  };
}

function createUpstreamSubmitter(url: string, upstreamToken: string, fetchImpl: FetchLike): (request: SponsorRequest, dustCap: bigint, signal?: AbortSignal) => Promise<FinalizedSponsorSubmission> {
  assertHttpsEndpoint("sponsor upstream URL", url);
  return async (request, dustCap, signal) => {
    const response = await fetchImpl(url, { method: "POST", headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${upstreamToken}` }, body: JSON.stringify({ request: wireRequest(request), dustCap: dustCap.toString() }), signal });
    if (!response.ok) throw new Error(`sponsor upstream rejected with HTTP ${response.status}`);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || typeof payload.transactionId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(payload.transactionId) || typeof payload.networkFinalized !== "boolean" || typeof payload.indexerVisible !== "boolean" || typeof payload.ledgerConfirmed !== "boolean") throw new Error("sponsor upstream returned an invalid finality receipt");
    return { transactionId: payload.transactionId, networkFinalized: payload.networkFinalized, indexerVisible: payload.indexerVisible, ledgerConfirmed: payload.ledgerConfirmed };
  };
}

function wireRequest(request: SponsorRequest): Record<string, unknown> {
  return {
    idempotencyKey: request.idempotencyKey,
    operation: request.operation,
    transaction: request.transaction,
    participantProof: request.participantProof,
    valueBalanced: request.valueBalanced,
    participantPublicKey: request.participantPublicKey,
    signature: request.signature,
    qualificationCost: request.qualificationCost.toString(),
    binding: { ...request.binding, qualificationCost: request.binding.qualificationCost.toString() },
  };
}

function splitAllowlist(value: string | undefined, label: string): readonly string[] {
  const values = (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (!values.length) throw new Error(`at least one sponsor ${label} allowlist entry is required`);
  return Object.freeze(values);
}

function requireEnvironment(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function assertHttpsEndpoint(label: string, value: string): void {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid HTTPS URL`); }
  if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
}

function readJwtClaims(token: string): { aal?: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64url").toString("utf8"));
    return isRecord(parsed) && typeof parsed.aal === "string" ? { aal: parsed.aal } : null;
  } catch { return null; }
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
