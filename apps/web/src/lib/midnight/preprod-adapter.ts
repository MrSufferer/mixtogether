import { isHex, ParticipantError, type CommandReceipt, type ParticipantAccountSnapshot, type ParticipantSnapshot, type ParticipantStateSnapshot, type ParticipantStateStatus, type SponsorshipChoice, type WalletSnapshot } from "./types";
import type { ParticipantAdapter, ParticipantCommand, SponsorExecutor } from "./application";
import { MidnightDAppConnector, type ConnectedWallet } from "./connector";
import { createConfiguredOfficialProviders, composeOfficialProviders, type FinalityObserver, type OfficialProviderComposition, type OfficialProviderDependencies } from "./providers";
import { MIDNIGHT_NETWORK_CONFIG, type ShroudlyContractIds } from "./config";

export type FinalityObservation = Readonly<{ transactionId: `0x${string}`; networkFinalized: boolean; indexerVisible: boolean; ledgerConfirmed: boolean; }>;
export type PreprodCommandExecutor = (command: ParticipantCommand, amount?: bigint, wallet?: ConnectedWallet) => Promise<FinalityObservation>;

/**
 * Reads state from the deployed Compact ledgers and the participant's private
 * state.  There is no default implementation: a production build must bind a
 * generated runtime reader to the immutable deployment before displaying
 * balances or draw data.
 */
export type PreprodStateReader = (input: Readonly<{
  wallet: ConnectedWallet;
  providers: OfficialProviderComposition;
  deploymentId: string;
  contractIds: ShroudlyContractIds;
}>) => Promise<ParticipantStateSnapshot>;

/** Input handed to the generated Compact binding/runtime for one call. */
export type PreprodTransactionBuildInput = Readonly<{
  command: ParticipantCommand;
  amount?: bigint;
  wallet: ConnectedWallet;
  deploymentId: string;
  contractIds: Readonly<Record<"asset" | "randomness" | "yield" | "pool", string>>;
}>;

/**
 * The generated binding may provide custom callbacks when its exact
 * transaction shape differs from the connector version.  If it does not,
 * the official ConnectedAPI methods are used directly.
 */
export type PreprodTransactionPlan = Readonly<{
  transaction: unknown;
  isSealed?: boolean;
  keyMaterialProvider?: unknown;
  provingProvider?: unknown;
  costModel?: unknown;
  prove?: (transaction: unknown, wallet: ConnectedWallet) => Promise<unknown>;
  balance?: (transaction: unknown, wallet: ConnectedWallet) => Promise<unknown>;
  submit?: (transaction: unknown, wallet: ConnectedWallet, signal?: AbortSignal) => Promise<unknown>;
}>;

export type OfficialPreprodExecutorOptions = Readonly<{
  build: (input: PreprodTransactionBuildInput) => Promise<PreprodTransactionPlan>;
  deploymentId: string;
  contractIds: Readonly<Record<"asset" | "randomness" | "yield" | "pool", string>>;
  finality?: FinalityObserver;
  observe?: (transactionId: `0x${string}`, signal?: AbortSignal) => Promise<FinalityObservation>;
}>;

/**
 * The small official Midnight.js surface used by the browser runtime.  The
 * concrete values are supplied by the release assembly from the pinned
 * `@midnight-ntwrk/midnight-js-*` packages. Keeping this type local avoids
 * importing generated proving material into the UI bundle.
 */
export type OfficialMidnightProviders = Readonly<{
  publicDataProvider: Readonly<{
    watchForTxData(transactionId: string): Promise<unknown>;
  }>;
  privateStateProvider?: Readonly<{
    set(privateStateId: string, state: unknown): Promise<void>;
  }>;
}>;

export type OfficialMidnightCall = Readonly<{
  /** The exact CallTxOptions object expected by official submitCallTxAsync. */
  options: unknown;
  /** Required when the Compact circuit produces a next private state. */
  privateStateId?: string;
}>;

export type OfficialMidnightRuntimeOptions = Readonly<{
  providers: OfficialMidnightProviders;
  submitCallTxAsync(providers: unknown, options: unknown): Promise<unknown>;
  buildCall(input: PreprodTransactionBuildInput): Promise<OfficialMidnightCall>;
  finality: FinalityObserver;
  /** Upper bound for the official indexer's watchForTxData promise. */
  watchTimeoutMs?: number;
}>;

/**
 * Execute the real DApp Connector lifecycle: build an unproven call, obtain a
 * wallet-owned proving provider, prove it, balance it, submit it, then wait
 * for the independent finality receipt.  There is intentionally no fake
 * transaction-id or optimistic receipt fallback in this function.
 */
export function createOfficialPreprodExecutor(options: OfficialPreprodExecutorOptions): PreprodCommandExecutor {
  assertDeploymentBinding(options.deploymentId, options.contractIds);
  return async (command, amount, wallet) => {
    if (!wallet) throw new ParticipantError("AUTHORIZATION_REJECTED", "a connected wallet is required");
    const plan = await options.build({ command, amount, wallet, deploymentId: options.deploymentId, contractIds: options.contractIds });
    if (!isRecord(plan) || plan.transaction === undefined) throw new ParticipantError("INVALID_COMMAND", "generated Compact binding returned no transaction");
    const operations = wallet.api.operations;
    const proven = await provePlan(plan, wallet, operations);
    const balanced = await balancePlan(plan, proven, wallet, operations);
    const controller = new AbortController();
    const submitted = await submitPlan(plan, balanced, wallet, operations, controller.signal);
    const transactionId = extractTransactionId(submitted);
    if (!transactionId) throw new ParticipantError("FINALITY_LAG", "wallet submission returned no transaction identifier", true);
    try {
      if (options.observe) return validateFinalityObservation(await options.observe(transactionId, controller.signal), transactionId);
      if (!options.finality) throw new Error("finality observer is not configured");
      const observed = await options.finality.wait(transactionId, controller.signal);
      return validateFinalityObservation(observed, transactionId);
    } catch (cause) {
      controller.abort();
      throw new ParticipantError("FINALITY_LAG", cause instanceof Error ? cause.message : "transaction finality could not be observed", true);
    }
  };
}

/**
 * Execute the pinned Midnight.js contract lifecycle. `submitCallTxAsync` is
 * intentionally injected from the official package so this repository can
 * keep the generated Compact bindings and 100MB+ proving keys out of source
 * control. The returned private state is persisted only after the official
 * indexer reports `SucceedEntirely` and the independent three-signal finality
 * observer agrees.
 */
export function createOfficialMidnightJsExecutor(options: OfficialMidnightRuntimeOptions, deploymentId: string, contractIds: ShroudlyContractIds): PreprodCommandExecutor {
  assertDeploymentBinding(deploymentId, contractIds);
  const watchTimeoutMs = options.watchTimeoutMs ?? 120_000;
  if (!Number.isInteger(watchTimeoutMs) || watchTimeoutMs <= 0) throw new Error("official indexer watch timeout must be positive");
  return async (command, amount, wallet) => {
    if (!wallet) throw new ParticipantError("AUTHORIZATION_REJECTED", "a connected wallet is required");
    const call = await options.buildCall({ command, amount, wallet, deploymentId, contractIds });
    if (!isRecord(call) || call.options === undefined) throw new ParticipantError("INVALID_COMMAND", "official Compact call options were not produced");
    if (call.privateStateId !== undefined && !call.privateStateId.trim()) throw new ParticipantError("INVALID_COMMAND", "private-state identifier is empty");

    let submission: unknown;
    try {
      submission = await options.submitCallTxAsync(options.providers, call.options);
    } catch (cause) {
      throw new ParticipantError("OUTAGE", cause instanceof Error ? cause.message : "official Midnight transaction submission failed", true);
    }
    const transactionId = extractTransactionId(submission);
    if (!transactionId) throw new ParticipantError("FINALITY_LAG", "official Midnight submission returned no transaction identifier", true);

    const controller = new AbortController();
    try {
      const finalized = await withTimeout(options.providers.publicDataProvider.watchForTxData(transactionId), watchTimeoutMs);
      if (finalized === null) throw new Error("official indexer did not return transaction data before timeout");
      if (!isRecord(finalized) || extractTransactionId(finalized) !== transactionId) throw new Error("official indexer returned a different transaction identifier");
      if (finalized.status !== "SucceedEntirely") throw new ParticipantError("INVALID_COMMAND", `transaction finalized with status ${String(finalized.status ?? "unknown")}`);

      const observed = await options.finality.wait(transactionId, controller.signal);
      const evidence = validateFinalityObservation(observed, transactionId);
      if (call.privateStateId !== undefined) await persistNextPrivateState(options.providers, submission, call.privateStateId);
      return evidence;
    } catch (cause) {
      controller.abort();
      if (cause instanceof ParticipantError) throw cause;
      throw new ParticipantError("FINALITY_LAG", cause instanceof Error ? cause.message : "official transaction finality could not be observed", true);
    }
  };
}

export type MidnightPreprodAdapterOptions = Readonly<{
  deploymentId?: string;
  contractIds?: ShroudlyContractIds;
  providers?: OfficialProviderDependencies;
  execute?: PreprodCommandExecutor;
  runtime?: PreprodCommandExecutor;
  officialRuntime?: OfficialMidnightRuntimeOptions;
  sponsor?: SponsorExecutor;
  stateReader?: PreprodStateReader;
}>;

/** Genuine DApp Connector 4.0.1 boundary. No wallet bridge is bundled in production. */
export class MidnightPreprodAdapter implements ParticipantAdapter {
  public readonly kind = "midnight-preprod" as const;
  public readonly deploymentId: string;
  public readonly contractIds: ShroudlyContractIds;
  private connected: ConnectedWallet | null = null;
  private composition: OfficialProviderComposition;
  private readonly sponsor?: SponsorExecutor;
  private readonly stateReader?: PreprodStateReader;
  private state: ParticipantStateSnapshot | null = null;
  private stateFailure: string | null = null;
  public constructor(private readonly connector = new MidnightDAppConnector(), options: MidnightPreprodAdapterOptions = {}) {
    this.deploymentId = options.deploymentId ?? MIDNIGHT_NETWORK_CONFIG.deploymentId;
    this.contractIds = options.contractIds ?? MIDNIGHT_NETWORK_CONFIG.contractIds;
    this.composition = createConfiguredOfficialProviders({
      rpcUrl: MIDNIGHT_NETWORK_CONFIG.rpcUrl,
      indexerGraphqlUrl: MIDNIGHT_NETWORK_CONFIG.indexerGraphqlUrl,
      zkConfigUrl: MIDNIGHT_NETWORK_CONFIG.zkConfigUrl,
      dependencies: options.providers,
    });
    this.executeCommand = options.runtime ?? options.execute ?? (options.officialRuntime ? createOfficialMidnightJsExecutor(options.officialRuntime, this.deploymentId, this.contractIds) : async () => { throw new ParticipantError("OUTAGE", "Preprod contract executor is not configured", true); });
    this.sponsor = options.sponsor;
    this.stateReader = options.stateReader;
  }
  private readonly executeCommand: PreprodCommandExecutor;
  public get providers(): OfficialProviderComposition { return this.composition; }
  public async connect(walletId: string): Promise<WalletSnapshot> {
    this.connected = await this.connector.connect(walletId, "preprod");
    const walletApi = this.connected.api;
    this.composition = composeOfficialProviders({
      ...this.composition,
      wallet: walletApi.raw,
      proof: walletApi.raw,
      privateState: walletApi.raw,
      logging: walletApi.raw,
      network: "preprod",
    });
    return this.connected.snapshot;
  }
  public async disconnect(): Promise<void> { this.connector.disconnect(); this.connected = null; this.state = null; this.stateFailure = null; }
  public currentWallet(): WalletSnapshot | null { return this.connected?.snapshot ?? null; }
  public stateStatus(): ParticipantStateStatus { return this.state ? (this.stateFailure ? "stale" : "available") : "unavailable"; }
  public stateMessage(): string | null {
    if (this.stateFailure) return `Verified Preprod state is stale: ${this.stateFailure}`;
    if (!this.stateReader) return "A generated Compact state reader is not configured for this deployment.";
    if (!this.state) return "Waiting for verified ledger state from the deployed contracts.";
    return null;
  }
  public async refreshState(): Promise<void> {
    if (!this.connected || !this.stateReader) return;
    try {
      this.state = validateStateSnapshot(await this.stateReader({ wallet: this.connected, providers: this.composition, deploymentId: this.deploymentId, contractIds: this.contractIds }));
      this.stateFailure = null;
    } catch (cause) {
      this.stateFailure = cause instanceof Error ? cause.message : "the state reader failed";
      throw new ParticipantError("INDEXER_LAG", this.stateFailure, true);
    }
  }
  public async command(command: ParticipantCommand, amount?: bigint, sponsorship: SponsorshipChoice = "participant-funded"): Promise<CommandReceipt> {
    if (!this.connected) throw new ParticipantError("AUTHORIZATION_REJECTED", "connect a Lace wallet first");
    assertDeploymentBinding(this.deploymentId, this.contractIds);
    if (!this.stateReader) throw new ParticipantError("OUTAGE", this.stateMessage() ?? "a verified Preprod state reader is not configured", true);
    if (!this.state) throw new ParticipantError("INDEXER_LAG", this.stateMessage() ?? "verified Preprod ledger state is unavailable", true);
    if (this.stateFailure) throw new ParticipantError("INDEXER_LAG", this.stateMessage() ?? "verified Preprod ledger state is stale", true);
    if (sponsorship === "sponsored" && !this.sponsor) throw new ParticipantError("SPONSOR_REJECTED", "DUST Sponsor Service is not configured; choose wallet-funded DUST", true);
    if (sponsorship === "sponsored") {
      try { await this.sponsor!({ command, amount, wallet: this.connected.snapshot, deploymentId: this.deploymentId }); }
      catch (cause) {
        const message = cause instanceof Error ? cause.message : "DUST sponsorship was rejected";
        throw new ParticipantError(message.toLowerCase().includes("timeout") ? "SPONSOR_TIMEOUT" : "SPONSOR_REJECTED", `${message}; choose wallet-funded DUST`, true);
      }
    }
    let observation: FinalityObservation;
    try { observation = validateFinalityObservation(await this.executeCommand(command, amount, this.connected)); }
    catch (cause) {
      if (cause instanceof ParticipantError) throw cause;
      throw new ParticipantError("FINALITY_LAG", cause instanceof Error ? cause.message : "fresh finality evidence is invalid", true);
    }
    return { transactionId: observation.transactionId, action: command, status: "finalized", finalizedAt: Math.floor(Date.now() / 1000), indexerVisible: true, ledgerConfirmed: true, sponsorship };
  }
  public account(): ParticipantAccountSnapshot { return this.state?.account ?? { balanceMicroUnits: 0n, principalMicroUnits: 0n, twabSeconds: 0n, unclaimedPrizeMicroUnits: 0n }; }
  public draw(): ParticipantSnapshot["draw"] { return this.state?.draw ?? { drawId: 0n, phase: "closed", opensAt: 0n, closesAt: 0n, commitCutoff: 0n, revealOpensAt: 0n, revealClosesAt: 0n, eligibleCommitments: 0, disclosureCohortMet: false, prizeMicroUnits: 0n, rolloverMicroUnits: 0n }; }
  public recoveryState(): unknown { return { deploymentId: this.deploymentId, walletId: this.connected?.snapshot.walletId ?? null }; }
  public async restoreRecoveryState(state: unknown, generation: bigint): Promise<void> {
    if (!this.connected) throw new ParticipantError("AUTHORIZATION_REJECTED", "connect a Lace wallet first");
    const privateState = this.composition.privateState as { save?: (scope: string, value: unknown) => Promise<void> };
    if (typeof privateState.save !== "function") throw new ParticipantError("OUTAGE", "durable Midnight private-state provider is not configured", true);
    await privateState.save(`${this.deploymentId}:${this.connected.snapshot.walletId}`, { state, generation });
  }
}

async function provePlan(plan: PreprodTransactionPlan, wallet: ConnectedWallet, operations: ConnectedWallet["api"]["operations"]): Promise<unknown> {
  if (plan.prove) return plan.prove(plan.transaction, wallet);
  const transaction = asCallableObject(plan.transaction);
  if (!transaction || typeof transaction.prove !== "function") throw new ParticipantError("PROOF_FAILURE", "generated transaction does not expose a proving operation");
  const provingProvider = plan.provingProvider ?? (typeof operations.getProvingProvider === "function" ? await operations.getProvingProvider.call(operations, plan.keyMaterialProvider) : undefined);
  if (provingProvider === undefined) throw new ParticipantError("PROOF_FAILURE", "wallet proving provider is not configured", true);
  try { return await transaction.prove(provingProvider, plan.costModel); }
  catch (cause) { throw new ParticipantError("PROOF_FAILURE", cause instanceof Error ? cause.message : "transaction proving failed", true); }
}

async function balancePlan(plan: PreprodTransactionPlan, proven: unknown, wallet: ConnectedWallet, operations: ConnectedWallet["api"]["operations"]): Promise<unknown> {
  if (plan.balance) return plan.balance(proven, wallet);
  const balance = plan.isSealed ? operations.balanceSealedTransaction : operations.balanceUnsealedTransaction;
  if (typeof balance !== "function") throw new ParticipantError("OUTAGE", "wallet transaction balancing is not configured", true);
  try { return await balance.call(operations, proven); }
  catch (cause) { throw new ParticipantError("OUTAGE", cause instanceof Error ? cause.message : "wallet transaction balancing failed", true); }
}

async function submitPlan(plan: PreprodTransactionPlan, balanced: unknown, wallet: ConnectedWallet, operations: ConnectedWallet["api"]["operations"], signal?: AbortSignal): Promise<unknown> {
  if (plan.submit) return plan.submit(balanced, wallet, signal);
  if (typeof operations.submitTransaction !== "function") throw new ParticipantError("OUTAGE", "wallet transaction submission is not configured", true);
  try { return await operations.submitTransaction.call(operations, balanced); }
  catch (cause) { throw new ParticipantError("OUTAGE", cause instanceof Error ? cause.message : "wallet transaction submission failed", true); }
}

function extractTransactionId(value: unknown): `0x${string}` | null {
  const candidate = typeof value === "string" ? value : isRecord(value) ? value.transactionId ?? value.txId ?? value.id : undefined;
  return typeof candidate === "string" && /^0x[0-9a-fA-F]{64}$/.test(candidate) ? candidate as `0x${string}` : null;
}

function validateFinalityObservation(observation: unknown, expectedTransactionId?: `0x${string}`): FinalityObservation {
  if (!isRecord(observation) || typeof observation.transactionId !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(observation.transactionId) || typeof observation.networkFinalized !== "boolean" || typeof observation.indexerVisible !== "boolean" || typeof observation.ledgerConfirmed !== "boolean") {
    throw new Error("finality observer returned an invalid observation");
  }
  const transactionId = observation.transactionId as `0x${string}`;
  if (expectedTransactionId !== undefined && transactionId !== expectedTransactionId) throw new Error("finality observer returned a different transaction identifier");
  if (!observation.networkFinalized || !observation.indexerVisible || !observation.ledgerConfirmed) throw new Error("transaction finality evidence is incomplete");
  return { transactionId, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true };
}

async function persistNextPrivateState(providers: OfficialMidnightProviders, submission: unknown, privateStateId: string): Promise<void> {
  if (!providers.privateStateProvider || typeof providers.privateStateProvider.set !== "function") throw new ParticipantError("OUTAGE", "official private-state provider is not configured", false);
  const data = isRecord(submission) ? submission.callTxData : undefined;
  const privateData = isRecord(data) ? data.private : undefined;
  const nextPrivateState = isRecord(privateData) ? privateData.nextPrivateState : undefined;
  if (nextPrivateState === undefined) throw new ParticipantError("OUTAGE", "official transaction did not return the next private state", false);
  try { await providers.privateStateProvider.set(privateStateId, nextPrivateState); }
  catch (cause) { throw new ParticipantError("OUTAGE", cause instanceof Error ? cause.message : "official private-state persistence failed", false); }
}

function assertDeploymentBinding(deploymentId: string, contractIds: ShroudlyContractIds): void {
  if (!deploymentId.trim() || deploymentId === "shroudly-preprod-unassigned") throw new ParticipantError("OUTAGE", "immutable Preprod deployment binding is not configured", true);
  if (Object.entries(contractIds).some(([, value]) => !value.trim() || value === "unassigned")) throw new ParticipantError("OUTAGE", "immutable Preprod contract bindings are not configured", true);
}

function asCallableObject(value: unknown): (Record<string, (...args: unknown[]) => unknown> & { prove: (...args: unknown[]) => unknown }) | null {
  return isRecord(value) && typeof value.prove === "function" ? value as Record<string, (...args: unknown[]) => unknown> & { prove: (...args: unknown[]) => unknown } : null;
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function validateStateSnapshot(value: unknown): ParticipantStateSnapshot {
  if (!isRecord(value) || !isRecord(value.account) || !isRecord(value.draw)) throw new Error("generated Compact state reader returned an invalid snapshot");
  const accountBalance = value.account.balanceMicroUnits;
  const accountPrincipal = value.account.principalMicroUnits;
  const accountTwab = value.account.twabSeconds;
  const accountUnclaimed = value.account.unclaimedPrizeMicroUnits;
  if (!isNonNegativeBigInt(accountBalance) || !isNonNegativeBigInt(accountPrincipal) || !isNonNegativeBigInt(accountTwab) || !isNonNegativeBigInt(accountUnclaimed)) throw new Error("state reader returned an invalid account snapshot");
  const drawId = value.draw.drawId;
  const opensAt = value.draw.opensAt;
  const closesAt = value.draw.closesAt;
  const commitCutoff = value.draw.commitCutoff;
  const revealOpensAt = value.draw.revealOpensAt;
  const revealClosesAt = value.draw.revealClosesAt;
  const prize = value.draw.prizeMicroUnits;
  const rollover = value.draw.rolloverMicroUnits;
  if (!isNonNegativeBigInt(drawId) || !isNonNegativeBigInt(opensAt) || !isNonNegativeBigInt(closesAt) || !isNonNegativeBigInt(commitCutoff) || !isNonNegativeBigInt(revealOpensAt) || !isNonNegativeBigInt(revealClosesAt) || !isNonNegativeBigInt(prize) || !isNonNegativeBigInt(rollover)) throw new Error("state reader returned an invalid draw snapshot");
  const phase = value.draw.phase;
  if (!isDrawPhase(phase)) throw new Error("state reader returned an invalid draw phase");
  if (typeof value.draw.eligibleCommitments !== "number" || !Number.isSafeInteger(value.draw.eligibleCommitments) || value.draw.eligibleCommitments < 0) throw new Error("state reader returned an invalid commitment count");
  if (typeof value.draw.disclosureCohortMet !== "boolean") throw new Error("state reader returned an invalid cohort status");
  if (value.draw.winningCommitment !== undefined && !isHex(value.draw.winningCommitment, 32)) throw new Error("state reader returned an invalid winning commitment");
  return {
    account: {
      balanceMicroUnits: accountBalance,
      principalMicroUnits: accountPrincipal,
      twabSeconds: accountTwab,
      unclaimedPrizeMicroUnits: accountUnclaimed,
    },
    draw: {
      drawId,
      phase,
      opensAt,
      closesAt,
      commitCutoff,
      revealOpensAt,
      revealClosesAt,
      eligibleCommitments: value.draw.eligibleCommitments,
      disclosureCohortMet: value.draw.disclosureCohortMet,
      ...(value.draw.winningCommitment === undefined ? {} : { winningCommitment: value.draw.winningCommitment }),
      prizeMicroUnits: prize,
      rolloverMicroUnits: rollover,
    },
  };
}

function isNonNegativeBigInt(value: unknown): value is bigint { return typeof value === "bigint" && value >= 0n; }
function isDrawPhase(value: unknown): value is ParticipantStateSnapshot["draw"]["phase"] { return value === "open" || value === "closed" || value === "revealing" || value === "finalized" || value === "rolled-over"; }

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); })]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
