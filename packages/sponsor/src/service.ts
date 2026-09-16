import { createHash, createPublicKey, verify as verifyEd25519 } from "node:crypto";
import type { SponsorStateStore } from "./state";

export type SponsorOperation = "add-dust" | "finalize" | "submit";
export type SponsorBinding = Readonly<{
  environment: "preprod";
  networkId: "preprod";
  deploymentId: string;
  contractId: string;
  circuitId: string;
  accountId: string;
  qualificationCost: bigint;
  expiresAt: number;
}>;
export type SponsorRequest = Readonly<{
  idempotencyKey: string;
  operation: SponsorOperation;
  transaction: string;
  participantProof: string;
  valueBalanced: boolean;
  participantPublicKey: string;
  signature: string;
  binding: SponsorBinding;
  qualificationCost: bigint;
}>;
export type FinalizedSponsorSubmission = Readonly<{ transactionId: string; networkFinalized: boolean; indexerVisible: boolean; ledgerConfirmed: boolean }>;
export type SponsoredTransaction = Readonly<{ idempotencyKey: string; operation: SponsorOperation; transactionId: string; dustAdded: bigint; networkFinalized: boolean; indexerVisible: boolean; ledgerConfirmed: boolean }>;
export type SponsorResult = Readonly<{ ok: true; transaction: SponsoredTransaction } | { ok: false; code: "UNAUTHORIZED" | "INVALID_TRANSACTION" | "INVALID_SIGNATURE" | "POLICY_REJECTED" | "QUOTA_EXCEEDED" | "TIMEOUT" | "UPSTREAM_REJECTED"; message: string; retryable: boolean; fallback: "participant-funded-dust" }>;

export type SponsorServiceOptions = Readonly<{
  timeoutMs?: number;
  accountQuota?: number;
  globalQuota?: number;
  maxObservedQualificationCost?: bigint;
  maxAuthorizationLifetimeMs?: number;
  deploymentId?: string;
  allowedContractIds?: readonly string[];
  allowedCircuitIds?: readonly string[];
  now?: () => number;
  authenticate?: (token: string) => Promise<{ accountId: string } | null>;
  verifySignature?: (input: { publicKey: string; signature: string; message: string }) => boolean | Promise<boolean>;
  /** Durable CAS/idempotency/quota state. Omit only for unit-test harnesses. */
  stateStore?: SponsorStateStore;
  /**
   * The injected adapter must submit through the provider and then observe the
   * network finality, indexer visibility, and fresh ledger state.  A request
   * identifier or a pair of optimistic booleans is not an acceptable receipt.
   */
  /**
   * Submit through the provider and observe all three finality signals. The
   * adapter should abort promptly, but the service still reconciles a late
   * result because provider cancellation cannot be assumed to be atomic.
   */
  submit?: (request: SponsorRequest, dustCap: bigint, signal?: AbortSignal) => Promise<FinalizedSponsorSubmission>;
}>;

type Usage = { timestamps: number[] };
type StoredTransaction = { transaction: SponsoredTransaction; authorizationDigest: string };
type UncertainSubmission = { authorizationDigest: string };

const FALLBACK = "participant-funded-dust" as const;
const AUTHORIZATION_DOMAIN = "shroudly/sponsor-authorization/v1";

/**
 * Produce the exact participant-authorized message that the sponsor verifies.
 * Fixed field order and length prefixes prevent ambiguous concatenation and
 * bind every policy-sensitive value to the Ed25519 signature.
 */
export function sponsorAuthorizationMessage(request: SponsorRequest): string {
  const parts = [
    AUTHORIZATION_DOMAIN,
    request.idempotencyKey,
    request.operation,
    request.transaction,
    request.participantProof,
    request.valueBalanced ? "true" : "false",
    request.participantPublicKey,
    request.binding.environment,
    request.binding.networkId,
    request.binding.deploymentId,
    request.binding.contractId,
    request.binding.circuitId,
    request.binding.accountId,
    request.binding.qualificationCost.toString(),
    request.binding.expiresAt.toString(),
    request.qualificationCost.toString(),
  ];
  return parts.map((part) => `${part.length}:${part}`).join("|");
}

export class SponsorService {
  private readonly records = new Map<string, StoredTransaction>();
  private readonly inFlight = new Map<string, { authorizationDigest: string; result: Promise<SponsorResult> }>();
  private readonly uncertain = new Map<string, UncertainSubmission>();
  private readonly accountUsage = new Map<string, Usage>();
  private readonly globalUsage: number[] = [];
  private readonly options: {
    timeoutMs: number;
    accountQuota: number;
    globalQuota: number;
    maxObservedQualificationCost: bigint;
    maxAuthorizationLifetimeMs: number;
    deploymentId: string;
    allowedContractIds: ReadonlySet<string>;
    allowedCircuitIds: ReadonlySet<string>;
    now: () => number;
    authenticate: NonNullable<SponsorServiceOptions["authenticate"]>;
    verifySignature: NonNullable<SponsorServiceOptions["verifySignature"]>;
    submit: NonNullable<SponsorServiceOptions["submit"]>;
    stateStore?: SponsorStateStore;
  };

  public constructor(options: SponsorServiceOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 8_000;
    const accountQuota = options.accountQuota ?? 20;
    const globalQuota = options.globalQuota ?? 500;
    const maxObservedQualificationCost = options.maxObservedQualificationCost ?? 100n;
    const maxAuthorizationLifetimeMs = options.maxAuthorizationLifetimeMs ?? 5 * 60_000;
    if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(accountQuota) || accountQuota <= 0 || !Number.isInteger(globalQuota) || globalQuota <= 0 || maxObservedQualificationCost < 0n || !Number.isInteger(maxAuthorizationLifetimeMs) || maxAuthorizationLifetimeMs <= 0) {
      throw new Error("sponsor quotas, timeout, authorization lifetime, and DUST cost must be positive");
    }
    this.options = {
      timeoutMs,
      accountQuota,
      globalQuota,
      maxObservedQualificationCost,
      maxAuthorizationLifetimeMs,
      deploymentId: options.deploymentId?.trim() ?? "",
      allowedContractIds: new Set(options.allowedContractIds ?? []),
      allowedCircuitIds: new Set(options.allowedCircuitIds ?? []),
      now: options.now ?? (() => Date.now()),
      authenticate: options.authenticate ?? (async () => null),
      verifySignature: options.verifySignature ?? verifyParticipantSignature,
      // The HTTP entrypoint is intentionally inert until the deployment
      // injects a provider-backed submitter.
      submit: options.submit ?? (async () => { throw new Error("sponsor submitter is not configured"); }),
      stateStore: options.stateStore,
    };
  }

  public dustCap(): bigint { return (this.options.maxObservedQualificationCost * 125n + 99n) / 100n; }
  public hotBalanceCap(): bigint { return this.dustCap() * BigInt(this.options.globalQuota) * 7n; }

  public async handle(token: string | undefined, request: unknown): Promise<SponsorResult> {
    let auth: { accountId: string } | null = null;
    try { auth = token ? await this.options.authenticate(token) : null; } catch { auth = null; }
    if (!auth) return failure("UNAUTHORIZED", "Backup Account AAL2 authentication is required", false);
    if (!isRequest(request)) return failure("INVALID_TRANSACTION", "transaction payload is invalid", false);

    const now = this.options.now();
    const policy = validatePolicy(request, auth.accountId, this.options, now);
    if (policy) return failure("POLICY_REJECTED", policy, false);
    if (request.qualificationCost < 0n || request.qualificationCost > this.dustCap()) return failure("POLICY_REJECTED", "qualification cost exceeds the frozen DUST cap", false);

    const message = sponsorAuthorizationMessage(request);
    let authorized = false;
    try { authorized = await this.options.verifySignature({ publicKey: request.participantPublicKey, signature: request.signature, message }); } catch { authorized = false; }
    if (!authorized) return failure("INVALID_SIGNATURE", "participant authorization signature is invalid", false);

    const idempotencyId = `${auth.accountId}:${request.idempotencyKey}`;
    const authorizationDigest = digest(message);
    let prior = this.records.get(idempotencyId);
    try {
      if (!prior && this.options.stateStore) {
        const persisted = await this.options.stateStore.loadCompleted(idempotencyId);
        if (persisted) {
          if (persisted.accountId !== auth.accountId) return failure("POLICY_REJECTED", "idempotency record is bound to a different account", false);
          prior = { transaction: persisted.transaction, authorizationDigest: persisted.authorizationDigest };
        }
      }
    } catch { return failure("UPSTREAM_REJECTED", "durable sponsor state is unavailable; no transaction was submitted", true); }
    if (prior) {
      if (prior.authorizationDigest !== authorizationDigest) return failure("POLICY_REJECTED", "idempotency key was reused for a different authorization", false);
      return { ok: true, transaction: prior.transaction };
    }

    const pending = this.inFlight.get(idempotencyId);
    if (pending) {
      if (pending.authorizationDigest !== authorizationDigest) return failure("POLICY_REJECTED", "idempotency key was reused for a different authorization", false);
      return pending.result;
    }

    let uncertain = this.uncertain.get(idempotencyId);
    try {
      if (!uncertain && this.options.stateStore) {
        const persisted = await this.options.stateStore.loadUncertain(idempotencyId);
        if (persisted) {
          if (persisted.accountId !== auth.accountId) return failure("POLICY_REJECTED", "reconciliation record is bound to a different account", false);
          uncertain = { authorizationDigest: persisted.authorizationDigest };
        }
      }
    } catch { return failure("UPSTREAM_REJECTED", "durable sponsor state is unavailable; no transaction was submitted", true); }
    if (uncertain) {
      if (uncertain.authorizationDigest !== authorizationDigest) return failure("POLICY_REJECTED", "idempotency key was reused for a different authorization", false);
      return failure("TIMEOUT", "the sponsor submission outcome is still being reconciled; do not retry this action", false);
    }

    const result = this.submitAuthorized(request, auth.accountId, idempotencyId, authorizationDigest, now);
    this.inFlight.set(idempotencyId, { authorizationDigest, result });
    try { return await result; }
    finally {
      if (this.inFlight.get(idempotencyId)?.result === result) this.inFlight.delete(idempotencyId);
    }
  }

  public redactedLog(result: SponsorResult): Record<string, unknown> {
    return result.ok ? { ok: true, operation: result.transaction.operation, idempotencyKey: result.transaction.idempotencyKey, transactionId: result.transaction.transactionId } : { ok: false, code: result.code, retryable: result.retryable };
  }

  private async submitAuthorized(request: SponsorRequest, accountId: string, idempotencyId: string, authorizationDigest: string, now: number): Promise<SponsorResult> {
    this.prune(now);
    if (this.options.stateStore) {
      try {
        const allowed = await this.options.stateStore.reserveQuota({ accountId, idempotencyId, now, accountLimit: this.options.accountQuota, globalLimit: this.options.globalQuota });
        if (!allowed) return failure("QUOTA_EXCEEDED", "sponsorship quota is exhausted", true);
      } catch { return failure("UPSTREAM_REJECTED", "durable sponsor quota state is unavailable; no transaction was submitted", true); }
    } else {
      const usage = this.accountUsage.get(accountId) ?? { timestamps: [] };
      if (usage.timestamps.length >= this.options.accountQuota || this.globalUsage.length >= this.options.globalQuota) return failure("QUOTA_EXCEEDED", "sponsorship quota is exhausted", true);
    }

    if (this.options.stateStore) {
      try {
        const claim = await this.options.stateStore.claimUncertain(idempotencyId, { accountId, authorizationDigest });
        if (claim.authorizationDigest !== authorizationDigest || claim.accountId !== accountId) return failure("POLICY_REJECTED", "idempotency key was reused for a different authorization", false);
        if (!claim.acquired) return failure("TIMEOUT", "the sponsor submission outcome is still being reconciled; do not retry this action", false);
      } catch { return failure("UPSTREAM_REJECTED", "durable sponsor state is unavailable; no transaction was submitted", true); }
    }

    const controller = new AbortController();
    let submission: Promise<FinalizedSponsorSubmission>;
    try { submission = Promise.resolve(this.options.submit(request, this.dustCap(), controller.signal)); }
    catch {
      if (this.options.stateStore) await this.options.stateStore.clearUncertain(idempotencyId, authorizationDigest).catch(() => undefined);
      return failure("UPSTREAM_REJECTED", "the network rejected the sponsored action", true);
    }

    let result: FinalizedSponsorSubmission | null;
    try {
      result = await withTimeout(submission, this.options.timeoutMs);
    } catch {
      // A rejected provider promise is not proof that the network did not
      // receive the request. Keep the durable reconciliation marker and make
      // the local harness equally conservative before offering the wallet
      // funded fallback.
      controller.abort();
      if (!this.options.stateStore) this.uncertain.set(idempotencyId, { authorizationDigest });
      return failure("UPSTREAM_REJECTED", "the sponsored action could not be finalized; its outcome is being reconciled", true);
    }
    if (!result) {
      controller.abort();
      if (!this.options.stateStore) this.uncertain.set(idempotencyId, { authorizationDigest });
      void submission.then(
        async (lateResult) => {
          const current = this.options.stateStore ? await this.options.stateStore.loadUncertain(idempotencyId).catch(() => null) : this.uncertain.get(idempotencyId);
          if (current?.authorizationDigest !== authorizationDigest) return;
          if (!hasIndependentFinality(lateResult, request)) return;
          const lateStored = await this.storeSuccessfulSubmission(request, accountId, idempotencyId, authorizationDigest, lateResult, this.options.now());
          // Keep the reconciliation marker when durable completion could not
          // be recorded.  Clearing it first would permit a second sponsor
          // submission while the original transaction remains ambiguous.
          if (lateStored.ok) {
            if (this.options.stateStore) await this.options.stateStore.clearUncertain(idempotencyId, authorizationDigest).catch(() => undefined);
            else this.uncertain.delete(idempotencyId);
          }
        },
        async () => {
          // A provider promise rejecting does not prove that the request never
          // reached the network. Durable uncertain rows remain until a
          // reconciliation operator resolves them. The local harness follows
          // the same conservative rule so a late rejection cannot reopen the
          // idempotency key for a second sponsored submission.
        },
      );
      return failure("TIMEOUT", `sponsor timed out after ${this.options.timeoutMs} milliseconds; the submission is being reconciled`, false);
    }
    if (!hasIndependentFinality(result, request)) return failure("UPSTREAM_REJECTED", "the sponsored action did not produce independently observed finality", true);

    const stored = await this.storeSuccessfulSubmission(request, accountId, idempotencyId, authorizationDigest, result, now);
    if (stored.ok && this.options.stateStore) await this.options.stateStore.clearUncertain(idempotencyId, authorizationDigest);
    return stored;
  }

  private async storeSuccessfulSubmission(request: SponsorRequest, accountId: string, idempotencyId: string, authorizationDigest: string, result: FinalizedSponsorSubmission, now: number): Promise<SponsorResult> {
    const transaction: SponsoredTransaction = Object.freeze({ idempotencyKey: request.idempotencyKey, operation: request.operation, transactionId: result.transactionId, dustAdded: request.operation === "add-dust" ? this.dustCap() : 0n, networkFinalized: result.networkFinalized, indexerVisible: result.indexerVisible, ledgerConfirmed: result.ledgerConfirmed });
    if (this.options.stateStore) {
      try {
        const stored = await this.options.stateStore.putCompleted(idempotencyId, { accountId, authorizationDigest, transaction });
        if (stored.authorizationDigest !== authorizationDigest || stored.accountId !== accountId) return failure("POLICY_REJECTED", "idempotency key was reused for a different authorization", false);
        return { ok: true, transaction: stored.transaction };
      } catch { return failure("UPSTREAM_REJECTED", "durable sponsor state could not record the finalized transaction", true); }
    }
    this.records.set(idempotencyId, { transaction, authorizationDigest });
    this.prune(now);
    const currentUsage = this.accountUsage.get(accountId) ?? { timestamps: [] };
    currentUsage.timestamps.push(now);
    this.accountUsage.set(accountId, currentUsage);
    this.globalUsage.push(now);
    return { ok: true, transaction };
  }

  private prune(now: number): void {
    const cutoff = now - 24 * 60 * 60 * 1000;
    for (const usage of this.accountUsage.values()) usage.timestamps = usage.timestamps.filter((time) => time > cutoff);
    // Account quota is rolling 24 hours; the global 500-action budget is a
    // UTC-calendar-day budget and therefore resets at midnight UTC.
    const day = new Date(now).toISOString().slice(0, 10);
    while (this.globalUsage[0] !== undefined && new Date(this.globalUsage[0]).toISOString().slice(0, 10) !== day) this.globalUsage.shift();
  }
}

function validatePolicy(request: SponsorRequest, accountId: string, options: SponsorService["options"], now: number): string | null {
  if (!request.idempotencyKey || request.idempotencyKey.length > 128) return "idempotency key is required";
  if (!request.transaction.trim() || !request.participantProof.trim() || !request.signature.trim() || !request.participantPublicKey.trim()) return "participant proof, signature, public key, and transaction are required";
  if (!request.valueBalanced) return "transaction must be value-balanced";
  if (!["add-dust", "finalize", "submit"].includes(request.operation)) return "operation is not allowlisted";
  if (!options.deploymentId || options.allowedContractIds.size === 0 || options.allowedCircuitIds.size === 0) return "sponsor deployment policy is not configured";
  if (request.binding.environment !== "preprod" || request.binding.networkId !== "preprod") return "transaction network binding is invalid";
  if (request.binding.accountId !== accountId || request.binding.deploymentId !== options.deploymentId) return "transaction binding is invalid";
  if (!options.allowedContractIds.has(request.binding.contractId) || !options.allowedCircuitIds.has(request.binding.circuitId)) return "contract or circuit is not allowlisted";
  if (request.binding.qualificationCost !== request.qualificationCost) return "qualification cost binding is invalid";
  if (!Number.isSafeInteger(request.binding.expiresAt) || request.binding.expiresAt <= now || request.binding.expiresAt > now + options.maxAuthorizationLifetimeMs) return "authorization lifetime is invalid or expired";
  if (!Number.isSafeInteger(now)) return "sponsor clock is invalid";

  try {
    const decoded: unknown = JSON.parse(request.transaction);
    if (!isRecord(decoded)) return "transaction is not a decodable object";
    const expected = {
      action: request.operation,
      valueBalanced: true,
      networkId: request.binding.networkId,
      deploymentId: request.binding.deploymentId,
      contractId: request.binding.contractId,
      circuitId: request.binding.circuitId,
      accountId,
      qualificationCost: request.qualificationCost.toString(),
      expiresAt: request.binding.expiresAt,
    } as const;
    for (const [key, value] of Object.entries(expected)) if (decoded[key] !== value) return `transaction ${key} binding is invalid`;
  } catch { return "transaction is not valid JSON"; }
  return null;
}

function isRequest(value: unknown): value is SponsorRequest {
  if (!isRecord(value)) return false;
  const record = value;
  const binding = isRecord(record.binding) ? record.binding : null;
  return typeof record.idempotencyKey === "string" && typeof record.operation === "string" && typeof record.transaction === "string" && typeof record.participantProof === "string" && typeof record.signature === "string" && typeof record.participantPublicKey === "string" && typeof record.valueBalanced === "boolean" && typeof record.qualificationCost === "bigint" && binding !== null && binding.environment === "preprod" && binding.networkId === "preprod" && typeof binding.deploymentId === "string" && typeof binding.contractId === "string" && typeof binding.circuitId === "string" && typeof binding.accountId === "string" && typeof binding.qualificationCost === "bigint" && typeof binding.expiresAt === "number";
}

function verifyParticipantSignature(input: { publicKey: string; signature: string; message: string }): boolean {
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(input.signature)) return false;
    const signature = Buffer.from(input.signature, "base64");
    if (signature.length !== 64) return false;
    return verifyEd25519(null, Buffer.from(input.message), createPublicKey(input.publicKey), signature);
  } catch { return false; }
}

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function failure(code: Exclude<SponsorResult, { ok: true }>["code"], message: string, retryable: boolean): SponsorResult { return { ok: false, code, message, retryable, fallback: FALLBACK }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function hasIndependentFinality(result: unknown, request: SponsorRequest): result is FinalizedSponsorSubmission {
  if (!isRecord(result)) return false;
  return typeof result.transactionId === "string" && /^0x[0-9a-fA-F]{64}$/.test(result.transactionId) && result.transactionId !== request.idempotencyKey && result.networkFinalized === true && result.indexerVisible === true && result.ledgerConfirmed === true;
}
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> { let timer: ReturnType<typeof setTimeout> | undefined; try { return await Promise.race([promise, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), timeoutMs); })]); } finally { if (timer) clearTimeout(timer); } }
