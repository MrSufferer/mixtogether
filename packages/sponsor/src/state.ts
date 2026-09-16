import type { SponsoredTransaction } from "./service";

/** Durable state required by the sponsor's idempotency and reconciliation path. */
export type PersistedCompletedSubmission = Readonly<{
  accountId: string;
  authorizationDigest: string;
  transaction: SponsoredTransaction;
}>;
export type PersistedUncertainSubmission = Readonly<{
  accountId: string;
  authorizationDigest: string;
}>;
export type UncertainSubmissionClaim = Readonly<{
  accountId: string;
  authorizationDigest: string;
  acquired: boolean;
}>;

export interface SponsorStateStore {
  loadCompleted(idempotencyId: string): Promise<PersistedCompletedSubmission | null>;
  putCompleted(idempotencyId: string, submission: PersistedCompletedSubmission): Promise<PersistedCompletedSubmission>;
  loadUncertain(idempotencyId: string): Promise<PersistedUncertainSubmission | null>;
  /** Atomically claim a submission slot across service instances. */
  claimUncertain(idempotencyId: string, submission: PersistedUncertainSubmission): Promise<UncertainSubmissionClaim>;
  putUncertain(idempotencyId: string, submission: PersistedUncertainSubmission): Promise<PersistedUncertainSubmission>;
  clearUncertain(idempotencyId: string, authorizationDigest?: string): Promise<void>;
  reserveQuota(input: { accountId: string; idempotencyId: string; now: number; accountLimit: number; globalLimit: number }): Promise<boolean>;
}

/**
 * A process-independent-in-shape test store. Tests can share one instance
 * between service instances to exercise restart/retry behavior without
 * pretending that a process-local map is production persistence.
 */
export class InMemorySponsorStateStore implements SponsorStateStore {
  private readonly completed = new Map<string, PersistedCompletedSubmission>();
  private readonly uncertain = new Map<string, PersistedUncertainSubmission>();
  private readonly accountEvents = new Map<string, number[]>();
  private readonly globalEvents: number[] = [];
  private readonly reservations = new Set<string>();

  public async loadCompleted(idempotencyId: string): Promise<PersistedCompletedSubmission | null> { return this.completed.get(idempotencyId) ?? null; }

  public async putCompleted(idempotencyId: string, submission: PersistedCompletedSubmission): Promise<PersistedCompletedSubmission> {
    const existing = this.completed.get(idempotencyId);
    if (existing) return existing;
    this.completed.set(idempotencyId, submission);
    return submission;
  }

  public async loadUncertain(idempotencyId: string): Promise<PersistedUncertainSubmission | null> { return this.uncertain.get(idempotencyId) ?? null; }

  public async claimUncertain(idempotencyId: string, submission: PersistedUncertainSubmission): Promise<UncertainSubmissionClaim> {
    const existing = this.uncertain.get(idempotencyId);
    if (existing) return { ...existing, acquired: false };
    this.uncertain.set(idempotencyId, submission);
    return { ...submission, acquired: true };
  }

  public async putUncertain(idempotencyId: string, submission: PersistedUncertainSubmission): Promise<PersistedUncertainSubmission> {
    const existing = this.uncertain.get(idempotencyId);
    if (existing) return existing;
    this.uncertain.set(idempotencyId, submission);
    return submission;
  }

  public async clearUncertain(idempotencyId: string, authorizationDigest?: string): Promise<void> {
    const existing = this.uncertain.get(idempotencyId);
    if (existing && (!authorizationDigest || existing.authorizationDigest === authorizationDigest)) this.uncertain.delete(idempotencyId);
  }

  public async reserveQuota(input: { accountId: string; idempotencyId: string; now: number; accountLimit: number; globalLimit: number }): Promise<boolean> {
    this.prune(input.now);
    const account = this.accountEvents.get(input.accountId) ?? [];
    if (this.reservations.has(input.idempotencyId)) return true;
    if (account.length >= input.accountLimit || this.globalEvents.length >= input.globalLimit) return false;
    account.push(input.now);
    this.accountEvents.set(input.accountId, account);
    this.globalEvents.push(input.now);
    this.reservations.add(input.idempotencyId);
    return true;
  }

  private prune(now: number): void {
    const rollingCutoff = now - 24 * 60 * 60 * 1000;
    for (const [accountId, events] of this.accountEvents) {
      const kept = events.filter((time) => time > rollingCutoff);
      if (kept.length) this.accountEvents.set(accountId, kept); else this.accountEvents.delete(accountId);
    }
    const utcDay = new Date(now).toISOString().slice(0, 10);
    while (this.globalEvents.length && new Date(this.globalEvents[0]).toISOString().slice(0, 10) !== utcDay) this.globalEvents.shift();
  }
}

export type SupabaseSponsorStateStoreOptions = Readonly<{
  url: string;
  serviceRoleKey: string;
  fetch?: FetchLike;
}>;
export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * PostgREST-backed implementation. The service-role key is accepted only by
 * this server-side package and is never returned, logged, or placed in a
 * browser build. RLS on the tables must deny anon/authenticated clients.
 */
export class SupabaseSponsorStateStore implements SponsorStateStore {
  private readonly baseUrl: string;
  private readonly serviceRoleKey: string;
  private readonly fetchImpl: FetchLike;

  public constructor(options: SupabaseSponsorStateStoreOptions) {
    assertHttpsEndpoint("Supabase URL", options.url);
    if (!options.serviceRoleKey.trim()) throw new Error("Supabase service-role key is required for sponsor persistence");
    this.baseUrl = `${options.url.replace(/\/$/, "")}/rest/v1`;
    this.serviceRoleKey = options.serviceRoleKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  public async loadCompleted(idempotencyId: string): Promise<PersistedCompletedSubmission | null> {
    const rows = await this.requestJson<unknown[]>(`sponsor_idempotency?select=account_id,authorization_digest,transaction&idempotency_id=eq.${encodeURIComponent(idempotencyId)}&limit=1`, { method: "GET" });
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return row ? parseCompleted(row) : null;
  }

  public async putCompleted(idempotencyId: string, submission: PersistedCompletedSubmission): Promise<PersistedCompletedSubmission> {
    await this.requestJson(`sponsor_idempotency`, { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ idempotency_id: idempotencyId, account_id: submission.accountId, authorization_digest: submission.authorizationDigest, transaction: wireTransaction(submission.transaction) }) });
    const stored = await this.loadCompleted(idempotencyId);
    if (!stored) throw new Error("Supabase did not persist the sponsor idempotency record");
    return stored;
  }

  public async loadUncertain(idempotencyId: string): Promise<PersistedUncertainSubmission | null> {
    const rows = await this.requestJson<unknown[]>(`sponsor_uncertain?select=account_id,authorization_digest&idempotency_id=eq.${encodeURIComponent(idempotencyId)}&limit=1`, { method: "GET" });
    const row = Array.isArray(rows) ? rows[0] : undefined;
    return row ? parseUncertain(row) : null;
  }

  public async claimUncertain(idempotencyId: string, submission: PersistedUncertainSubmission): Promise<UncertainSubmissionClaim> {
    const value = await this.requestJson<unknown>("rpc/claim_sponsor_uncertain", { method: "POST", body: JSON.stringify({ p_idempotency_id: idempotencyId, p_account_id: submission.accountId, p_authorization_digest: submission.authorizationDigest }) });
    if (!isRecord(value) || typeof value.account_id !== "string" || typeof value.authorization_digest !== "string" || typeof value.acquired !== "boolean") throw new Error("Supabase returned an invalid sponsor claim response");
    return { accountId: value.account_id, authorizationDigest: value.authorization_digest, acquired: value.acquired };
  }

  public async putUncertain(idempotencyId: string, submission: PersistedUncertainSubmission): Promise<PersistedUncertainSubmission> {
    await this.requestJson(`sponsor_uncertain`, { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ idempotency_id: idempotencyId, account_id: submission.accountId, authorization_digest: submission.authorizationDigest }) });
    const stored = await this.loadUncertain(idempotencyId);
    if (!stored) throw new Error("Supabase did not persist the sponsor reconciliation record");
    return stored;
  }

  public async clearUncertain(idempotencyId: string, authorizationDigest?: string): Promise<void> {
    const digestQuery = authorizationDigest ? `&authorization_digest=eq.${encodeURIComponent(authorizationDigest)}` : "";
    await this.requestJson(`sponsor_uncertain?idempotency_id=eq.${encodeURIComponent(idempotencyId)}${digestQuery}`, { method: "DELETE" });
  }

  public async reserveQuota(input: { accountId: string; idempotencyId: string; now: number; accountLimit: number; globalLimit: number }): Promise<boolean> {
    const value = await this.requestJson<unknown>("rpc/reserve_sponsorship_quota", { method: "POST", body: JSON.stringify({ p_account_id: input.accountId, p_idempotency_id: input.idempotencyId, p_occurred_at: new Date(input.now).toISOString(), p_account_limit: input.accountLimit, p_global_limit: input.globalLimit }) });
    if (typeof value === "boolean") return value;
    if (isRecord(value) && typeof value.allowed === "boolean") return value.allowed;
    throw new Error("Supabase returned an invalid sponsorship quota response");
  }

  private async requestJson<T = unknown>(path: string, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("apikey", this.serviceRoleKey);
    headers.set("authorization", `Bearer ${this.serviceRoleKey}`);
    headers.set("content-type", "application/json");
    const response = await this.fetchImpl(`${this.baseUrl}/${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) throw new Error(`durable sponsor state request failed with HTTP ${response.status}`);
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    return body ? JSON.parse(body) as T : undefined as T;
  }
}

export function createSupabaseSponsorStateStore(options: SupabaseSponsorStateStoreOptions): SponsorStateStore {
  return new SupabaseSponsorStateStore(options);
}

function wireTransaction(transaction: SponsoredTransaction): Record<string, unknown> {
  return { idempotencyKey: transaction.idempotencyKey, operation: transaction.operation, transactionId: transaction.transactionId, dustAdded: transaction.dustAdded.toString(), networkFinalized: transaction.networkFinalized, indexerVisible: transaction.indexerVisible, ledgerConfirmed: transaction.ledgerConfirmed };
}

function parseCompleted(value: unknown): PersistedCompletedSubmission {
  if (!isRecord(value) || typeof value.account_id !== "string" || typeof value.authorization_digest !== "string" || !isRecord(value.transaction)) throw new Error("invalid durable sponsor idempotency record");
  if (!value.account_id.trim() || !/^[a-f0-9]{64}$/.test(value.authorization_digest)) throw new Error("invalid durable sponsor identity");
  const transaction = value.transaction;
  if (typeof transaction.idempotencyKey !== "string" || typeof transaction.operation !== "string" || typeof transaction.transactionId !== "string" || typeof transaction.dustAdded !== "string" || typeof transaction.networkFinalized !== "boolean" || typeof transaction.indexerVisible !== "boolean" || typeof transaction.ledgerConfirmed !== "boolean") throw new Error("invalid durable sponsored transaction");
  if (!transaction.idempotencyKey.trim() || !["add-dust", "finalize", "submit"].includes(transaction.operation) || !/^0x[0-9a-fA-F]{64}$/.test(transaction.transactionId) || !/^\d+$/.test(transaction.dustAdded) || !transaction.networkFinalized || !transaction.indexerVisible || !transaction.ledgerConfirmed) throw new Error("invalid durable sponsored transaction");
  return { accountId: value.account_id, authorizationDigest: value.authorization_digest, transaction: Object.freeze({ idempotencyKey: transaction.idempotencyKey, operation: transaction.operation as SponsoredTransaction["operation"], transactionId: transaction.transactionId, dustAdded: BigInt(transaction.dustAdded), networkFinalized: transaction.networkFinalized, indexerVisible: transaction.indexerVisible, ledgerConfirmed: transaction.ledgerConfirmed }) };
}

function parseUncertain(value: unknown): PersistedUncertainSubmission {
  if (!isRecord(value) || typeof value.account_id !== "string" || typeof value.authorization_digest !== "string") throw new Error("invalid durable sponsor reconciliation record");
  if (!value.account_id.trim() || !/^[a-f0-9]{64}$/.test(value.authorization_digest)) throw new Error("invalid durable sponsor reconciliation record");
  return { accountId: value.account_id, authorizationDigest: value.authorization_digest };
}

function assertHttpsEndpoint(label: string, value: string): void {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid HTTPS URL`); }
  if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
