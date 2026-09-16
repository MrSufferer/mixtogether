import type { PrivateStateStore } from "./private-state";
import type { NetworkId } from "./types";

export type ProofMode = "local" | "remote-opt-in";
export type MidnightProviderConfig = Readonly<{
  network: "preprod";
  rpcUrl: string;
  indexerGraphqlUrl: string;
  zkConfigUrl?: string;
  proofMode?: ProofMode;
  allowRemoteProof?: boolean;
}>;
export type ProviderStatus = Readonly<{
  proofMode: ProofMode;
  privateState: "local";
  publicData: "indexer";
  connector: "dapp-connector-boundary";
  dust: "explicit-approval-boundary";
}>;

export interface PublicDataProvider {
  readonly kind: "indexer";
  query<T>(query: string, variables?: Record<string, unknown>, signal?: AbortSignal): Promise<T>;
}
export interface ProofProvider { readonly mode: ProofMode; prove(request: unknown): Promise<unknown>; }
export interface WalletProvider { connect(): Promise<unknown>; disconnect(): Promise<void>; }
export interface DAppConnectorBoundary { requestAuthorization(): Promise<unknown>; disconnect(): Promise<void>; }
export interface DustSponsorBoundary { sponsorAfterApproval(transaction: UserApprovedTransaction): Promise<{ sponsoredTransaction: unknown }>; }
export type UserApprovedTransaction = Readonly<{ transactionId: string; calldataFingerprint: string; approvedAt: number }>;
export type MidnightProviderBoundaries = Readonly<{
  config: MidnightProviderConfig;
  status: ProviderStatus;
  publicData: PublicDataProvider;
  proof: ProofProvider;
  privateState: PrivateStateStore<unknown>;
  wallet: WalletProvider;
  connector: DAppConnectorBoundary;
  dust: DustSponsorBoundary;
}>;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * The indexer is the public-data source, but its response is never treated as
 * finality by itself.  Transaction callers must pair this provider with the
 * network and ledger probes below.
 */
export class GraphqlPublicDataProvider implements PublicDataProvider {
  public readonly kind = "indexer" as const;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  public constructor(private readonly endpoint: string, options: { fetch?: FetchLike; timeoutMs?: number } = {}) {
    assertHttpsEndpoint("indexer GraphQL endpoint", endpoint);
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) throw new Error("indexer timeout must be positive");
  }

  public get endpointUrl(): string { return this.endpoint; }

  public async query<T>(query: string, variables: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
    if (!query.trim()) throw new Error("indexer GraphQL query is required");
    const controller = new AbortController();
    const cancel = forwardAbort(signal, controller);
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`indexer request failed with HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!isRecord(payload) || (Array.isArray(payload.errors) && payload.errors.length > 0) || !Object.prototype.hasOwnProperty.call(payload, "data")) {
        throw new Error("indexer returned an invalid GraphQL response");
      }
      return payload.data as T;
    } catch (cause) {
      if (controller.signal.aborted) throw new Error(signal?.aborted ? "indexer request was cancelled" : "indexer request timed out");
      throw cause instanceof Error ? cause : new Error("indexer request failed");
    } finally {
      clearTimeout(timer);
      cancel();
    }
  }
}

export function createGraphqlPublicDataProvider(endpoint: string, options?: { fetch?: FetchLike; timeoutMs?: number }): PublicDataProvider {
  return new GraphqlPublicDataProvider(endpoint, options);
}

/** Adapt a wallet-owned proving provider without making a remote proof call. */
export function createWalletProofProvider(provingProvider: unknown, mode: ProofMode = "local"): ProofProvider {
  if (!isRecord(provingProvider) || typeof provingProvider.prove !== "function") throw new Error("wallet proving provider is not connected");
  const prove = provingProvider.prove as (request: unknown) => unknown;
  return Object.freeze({ mode, prove: (request: unknown): Promise<unknown> => Promise.resolve(prove.call(provingProvider, request)) });
}

/**
 * A finality receipt is deliberately made from three independent observations:
 * the network, the indexer, and a fresh ledger query.  A caller can provide
 * the exact query shapes for the currently pinned Midnight infrastructure
 * without changing the application or sponsor service.
 */
export type ProviderFinalityObservation = Readonly<{
  transactionId: string;
  networkFinalized: boolean;
  indexerVisible: boolean;
  ledgerConfirmed: boolean;
}>;
export type FinalityProbe = Readonly<{
  networkFinalized(transactionId: string, signal?: AbortSignal): Promise<boolean>;
  indexerVisible(transactionId: string, signal?: AbortSignal): Promise<boolean>;
  ledgerConfirmed(transactionId: string, signal?: AbortSignal): Promise<boolean>;
}>;
export type FinalityObserver = Readonly<{
  wait(transactionId: string, signal?: AbortSignal): Promise<ProviderFinalityObservation>;
}>;

export function createPollingFinalityObserver(probe: FinalityProbe, options: { timeoutMs?: number; pollMs?: number } = {}): FinalityObserver {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const pollMs = options.pollMs ?? 2_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(pollMs) || pollMs <= 0) throw new Error("finality polling limits must be positive");
  return Object.freeze({
    async wait(transactionId: string, signal?: AbortSignal): Promise<ProviderFinalityObservation> {
      if (!transactionId.trim()) throw new Error("transaction identifier is required for finality observation");
      const started = Date.now();
      while (Date.now() - started <= timeoutMs) {
        if (signal?.aborted) throw new Error("finality observation was cancelled");
        const [networkFinalized, indexerVisible, ledgerConfirmed] = await Promise.all([
          probe.networkFinalized(transactionId, signal),
          probe.indexerVisible(transactionId, signal),
          probe.ledgerConfirmed(transactionId, signal),
        ]);
        if (networkFinalized && indexerVisible && ledgerConfirmed) return { transactionId, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true };
        await delay(pollMs, signal);
      }
      throw new Error(`transaction ${transactionId} did not reach all finality signals before timeout`);
    },
  });
}

/**
 * A small JSON-RPC transport for node-specific probes.  The method and result
 * interpretation stay explicit at the call site because Midnight node
 * deployments can expose different read methods across compatibility lines.
 */
export class JsonRpcProvider {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private sequence = 0;

  public constructor(private readonly endpoint: string, options: { fetch?: FetchLike; timeoutMs?: number } = {}) {
    assertHttpsEndpoint("Midnight RPC endpoint", endpoint);
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) throw new Error("RPC timeout must be positive");
  }

  public get endpointUrl(): string { return this.endpoint; }

  public async request<T>(method: string, params: readonly unknown[] = [], signal?: AbortSignal): Promise<T> {
    if (!/^[A-Za-z0-9_.:-]+$/.test(method)) throw new Error("RPC method is invalid");
    const controller = new AbortController();
    const cancel = forwardAbort(signal, controller);
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++this.sequence, method, params }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`RPC request failed with HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (!isRecord(payload) || payload.error !== undefined || !Object.prototype.hasOwnProperty.call(payload, "result")) throw new Error("RPC returned an invalid response");
      return payload.result as T;
    } catch (cause) {
      if (controller.signal.aborted) throw new Error(signal?.aborted ? "RPC request was cancelled" : "RPC request timed out");
      throw cause instanceof Error ? cause : new Error("RPC request failed");
    } finally {
      clearTimeout(timer);
      cancel();
    }
  }
}

export function createJsonRpcProvider(endpoint: string, options?: { fetch?: FetchLike; timeoutMs?: number }): JsonRpcProvider {
  return new JsonRpcProvider(endpoint, options);
}

/**
 * ZK configuration is fetched from the pinned deployment endpoint. It is kept
 * as a separate provider because the generated Compact runtime owns the
 * interpretation of the returned document.
 */
export interface ZkConfigProvider { load<T>(signal?: AbortSignal): Promise<T>; }

export class JsonZkConfigProvider implements ZkConfigProvider {
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;

  public constructor(private readonly endpoint: string, options: { fetch?: FetchLike; timeoutMs?: number } = {}) {
    assertHttpsEndpoint("ZK configuration endpoint", endpoint);
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) throw new Error("ZK configuration timeout must be positive");
  }

  public get endpointUrl(): string { return this.endpoint; }

  public async load<T>(signal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const cancel = forwardAbort(signal, controller);
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(this.endpoint, { method: "GET", headers: { accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`ZK configuration request failed with HTTP ${response.status}`);
      const payload: unknown = await response.json();
      if (payload === null || payload === undefined) throw new Error("ZK configuration response is empty");
      return payload as T;
    } catch (cause) {
      if (controller.signal.aborted) throw new Error(signal?.aborted ? "ZK configuration request was cancelled" : "ZK configuration request timed out");
      throw cause instanceof Error ? cause : new Error("ZK configuration request failed");
    } finally {
      clearTimeout(timer);
      cancel();
    }
  }
}

export function createJsonZkConfigProvider(endpoint: string, options?: { fetch?: FetchLike; timeoutMs?: number }): ZkConfigProvider {
  return new JsonZkConfigProvider(endpoint, options);
}

/** Provider composition keeps official Midnight packages behind one replaceable seam. */
export function createMidnightProviderBoundaries(config: MidnightProviderConfig, dependencies: { privateState: PrivateStateStore<unknown>; publicData?: PublicDataProvider; proof?: ProofProvider; wallet?: WalletProvider; connector?: DAppConnectorBoundary; dust?: DustSponsorBoundary }): MidnightProviderBoundaries {
  const proofMode = config.proofMode ?? "local";
  if (proofMode === "remote-opt-in" && !config.allowRemoteProof) throw new Error("remote proving requires explicit opt-in");
  const publicData = dependencies.publicData ?? { kind: "indexer" as const, async query<T>(): Promise<T> { throw new Error("indexer provider is not connected"); } };
  const proof = dependencies.proof ?? { mode: proofMode, async prove(): Promise<unknown> { throw new Error("proof provider is not connected"); } };
  const wallet = dependencies.wallet ?? { async connect(): Promise<unknown> { throw new Error("wallet provider is not connected"); }, async disconnect(): Promise<void> {} };
  const connector = dependencies.connector ?? { async requestAuthorization(): Promise<unknown> { throw new Error("DApp Connector is not connected"); }, async disconnect(): Promise<void> {} };
  const dust = dependencies.dust ?? { async sponsorAfterApproval(transaction: UserApprovedTransaction): Promise<{ sponsoredTransaction: unknown }> { if (!transaction.approvedAt || !transaction.calldataFingerprint) throw new Error("DUST sponsorship requires participant approval"); throw new Error("DUST sponsor is not connected"); } };
  return { config, status: { proofMode, privateState: "local", publicData: "indexer", connector: "dapp-connector-boundary", dust: "explicit-approval-boundary" }, publicData, proof, privateState: dependencies.privateState, wallet, connector, dust };
}

export type OfficialProviderComposition = Readonly<{
  wallet: unknown;
  proof: unknown;
  publicData: unknown;
  privateState: unknown;
  zkConfig: unknown;
  logging: unknown;
  rpc?: unknown;
  network: NetworkId;
}>;

export type OfficialProviderDependencies = Partial<Omit<OfficialProviderComposition, "network">>;

export function composeOfficialProviders(input: Omit<OfficialProviderComposition, "network"> & { network?: NetworkId }): OfficialProviderComposition {
  return Object.freeze({ ...input, network: input.network ?? "preprod" });
}

/**
 * Construct the provider bag used by a genuine Preprod runtime. The
 * generated Compact binding may replace wallet/private-state/proof values
 * after connection, but public data, node RPC, and ZK configuration remain
 * anchored to the configured HTTPS endpoints.
 */
export function createConfiguredOfficialProviders(input: {
  rpcUrl: string;
  indexerGraphqlUrl: string;
  zkConfigUrl?: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  dependencies?: OfficialProviderDependencies;
}): OfficialProviderComposition {
  const dependencies = input.dependencies ?? {};
  return composeOfficialProviders({
    wallet: dependencies.wallet ?? unavailableProvider("wallet"),
    proof: dependencies.proof ?? unavailableProvider("proof"),
    publicData: dependencies.publicData ?? createGraphqlPublicDataProvider(input.indexerGraphqlUrl, { fetch: input.fetch, timeoutMs: input.timeoutMs }),
    privateState: dependencies.privateState ?? unavailableProvider("private state"),
    zkConfig: dependencies.zkConfig ?? (input.zkConfigUrl ? createJsonZkConfigProvider(input.zkConfigUrl, { fetch: input.fetch, timeoutMs: input.timeoutMs }) : unavailableProvider("ZK configuration")),
    logging: dependencies.logging ?? unavailableProvider("logging"),
    rpc: dependencies.rpc ?? createJsonRpcProvider(input.rpcUrl, { fetch: input.fetch, timeoutMs: input.timeoutMs }),
    network: "preprod",
  });
}

function assertHttpsEndpoint(label: string, value: string): void {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid HTTPS URL`); }
  if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
}

function forwardAbort(source: AbortSignal | undefined, target: AbortController): () => void {
  if (!source) return () => undefined;
  if (source.aborted) target.abort();
  const abort = () => target.abort();
  source.addEventListener("abort", abort, { once: true });
  return () => source.removeEventListener("abort", abort);
}

function delay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error("finality observation was cancelled")); return; }
    let settled = false;
    const abort = () => { if (settled) return; settled = true; clearTimeout(timer); reject(new Error("finality observation was cancelled")); };
    const timer = setTimeout(() => { settled = true; signal?.removeEventListener("abort", abort); resolve(); }, milliseconds);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function unavailableProvider(name: string): Readonly<{ kind: "unavailable"; name: string }> {
  return Object.freeze({ kind: "unavailable" as const, name });
}
