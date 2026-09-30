import { bytes32, domain, hashToBigInt, hashWords } from "./hashing";
import { exportPrivateState, restorePrivateState, type PrivateEnvironment, type RecoveryKitKey } from "./recovery";
import { parsePrivateStateBackup, serializePrivateStateBackup, type PrivateStateBackup } from "./private-state";

export type BackupSession = Readonly<{ sessionId: string; email: string; aal: "aal2"; expiresAt: number; accountId?: string; accessToken?: string }>;
export type BackupRecord = Readonly<{ email: string; verifiedEmail: boolean; generation: bigint; activeWriter: string | null; encryptedState: PrivateStateBackup | null }>;
export interface BackupAccountStore {
  handoff(session: BackupSession, writerId: string, expectedGeneration: bigint): bigint | Promise<bigint>;
  ensureAccount?(input: { session: BackupSession; environment: PrivateEnvironment; deploymentId: string }): Promise<void>;
  write(input: { session: BackupSession; writerId: string; expectedGeneration: bigint; key: RecoveryKitKey; environment: PrivateEnvironment; deploymentId: string; state: unknown }): Promise<BackupRecord>;
  read(input: { session: BackupSession; key: RecoveryKitKey; environment: PrivateEnvironment; deploymentId: string; retiredDeployments?: readonly string[] }): Promise<{ state: unknown; generation: bigint }>;
}

type MutableAccount = { email: string; passwordHash: string; totpSecret: string; verifiedEmail: boolean; generation: bigint; activeWriter: string | null; environment: PrivateEnvironment | null; deploymentId: string | null; encryptedState: PrivateStateBackup | null };

function digestCredential(value: string): string {
  const encoded = new TextEncoder().encode(value);
  const chunks: string[] = [];
  for (let i = 0; i < encoded.length; i += 32) chunks.push(bytes32(`0x${Array.from(encoded.slice(i, i + 32), (byte) => byte.toString(16).padStart(2, "0")).join("")}`));
  return hashWords(domain("auth/credential/v1"), ...(chunks.length ? chunks : [bytes32("")])).slice(2);
}

export function totpCode(secret: string, at = Date.now()): string {
  const counter = BigInt(Math.floor(at / 30_000));
  return (hashToBigInt(hashWords(domain("auth/totp/v1"), bytes32(secret), bytes32(counter.toString()))) % 1_000_000n).toString().padStart(6, "0");
}

export class BackupAccountService {
  private readonly accounts = new Map<string, MutableAccount>();
  private readonly sessions = new Map<string, BackupSession>();
  private sequence = 0;

  public register(email: string, password: string, totpSecret: string): void {
    const normalized = normalizeEmail(email);
    if (password.length < 12) throw new Error("password must contain at least 12 characters");
    if (!totpSecret.trim()) throw new Error("TOTP enrollment is required");
    if (this.accounts.has(normalized)) throw new Error("backup account already exists");
    this.accounts.set(normalized, { email: normalized, passwordHash: digestCredential(password), totpSecret, verifiedEmail: false, generation: 0n, activeWriter: null, environment: null, deploymentId: null, encryptedState: null });
  }

  public verifyEmail(email: string): void { this.account(email).verifiedEmail = true; }

  public authenticate(email: string, password: string, code: string, now = Date.now()): BackupSession {
    const account = this.account(email);
    if (!account.verifiedEmail) throw new Error("email address is not verified");
    if (account.passwordHash !== digestCredential(password)) throw new Error("invalid credentials");
    if (![totpCode(account.totpSecret, now), totpCode(account.totpSecret, now - 30_000)].includes(code)) throw new Error("AAL2 TOTP verification failed");
    const session = Object.freeze({ sessionId: `backup-session-${++this.sequence}`, email: account.email, aal: "aal2" as const, expiresAt: now + 30 * 60_000 });
    this.sessions.set(session.sessionId, session);
    return session;
  }

  public handoff(session: BackupSession, writerId: string, expectedGeneration: bigint): bigint {
    this.assertAal2(session);
    const account = this.account(session.email);
    if (!writerId.trim()) throw new Error("writer identity is required");
    if (expectedGeneration < 0n) throw new Error("backup generation is invalid");
    if (account.generation !== expectedGeneration) throw new Error("backup generation is stale");
    account.activeWriter = writerId;
    return account.generation;
  }

  public async write(input: { session: BackupSession; writerId: string; expectedGeneration: bigint; key: RecoveryKitKey; environment: PrivateEnvironment; deploymentId: string; state: unknown }): Promise<BackupRecord> {
    this.assertAal2(input.session);
    const account = this.account(input.session.email);
    const expectedGeneration = input.expectedGeneration;
    if (expectedGeneration < 0n) throw new Error("backup generation is invalid");
    if (account.activeWriter !== input.writerId) throw new Error("backup writer handoff required");
    if (account.generation !== expectedGeneration) throw new Error("backup generation is stale");
    if (account.environment !== null && (account.environment !== input.environment || account.deploymentId !== input.deploymentId)) throw new Error("backup deployment binding is immutable");
    const nextGeneration = expectedGeneration + 1n;
    const encryptedState = await exportPrivateState({ key: input.key, environment: input.environment, deploymentId: input.deploymentId, generation: nextGeneration, state: input.state });
    // The encryption await is intentionally before this compare-and-swap.
    // Another writer can commit while the blob is being prepared; only the
    // first caller whose expected generation is still current may publish it.
    if (account.activeWriter !== input.writerId || account.generation !== expectedGeneration) throw new Error("backup generation is stale");
    account.encryptedState = encryptedState;
    account.generation = nextGeneration;
    account.environment = input.environment;
    account.deploymentId = input.deploymentId;
    return this.snapshot(account);
  }

  public async read(input: { session: BackupSession; key: RecoveryKitKey; environment: PrivateEnvironment; deploymentId: string; retiredDeployments?: readonly string[] }): Promise<{ state: unknown; generation: bigint }> {
    this.assertAal2(input.session);
    const backup = this.account(input.session.email).encryptedState;
    if (!backup) throw new Error("no backup exists");
    return restorePrivateState({ key: input.key, backup, activeEnvironment: input.environment, activeDeploymentId: input.deploymentId, retiredDeployments: input.retiredDeployments });
  }

  public async delete(input: { session: BackupSession; writerId: string; expectedGeneration: bigint }): Promise<bigint> {
    this.assertAal2(input.session);
    const account = this.account(input.session.email);
    if (input.expectedGeneration < 0n) throw new Error("backup generation is invalid");
    if (account.activeWriter !== input.writerId) throw new Error("backup writer handoff required");
    if (account.generation !== input.expectedGeneration) throw new Error("backup generation is stale");
    account.encryptedState = null;
    account.generation = input.expectedGeneration + 1n;
    return account.generation;
  }

  /** Administrative/UI inspection still requires the same AAL2 session as a
   * read.  Never expose encrypted backup metadata through an email-only lookup. */
  public inspect(session: BackupSession): BackupRecord {
    this.assertAal2(session);
    return this.snapshot(this.account(session.email));
  }

  private account(email: string): MutableAccount {
    const account = this.accounts.get(normalizeEmail(email));
    if (!account) throw new Error("backup account not found");
    return account;
  }

  private assertAal2(session: BackupSession): void {
    const current = this.sessions.get(session.sessionId);
    if (!current || current.email !== session.email || current.expiresAt !== session.expiresAt || current.aal !== "aal2" || current.expiresAt < Date.now()) throw new Error("AAL2 session required");
  }

  private snapshot(account: MutableAccount): BackupRecord {
    return Object.freeze({ email: account.email, verifiedEmail: account.verifiedEmail, generation: account.generation, activeWriter: account.activeWriter, encryptedState: account.encryptedState });
  }
}

/**
 * The browser must never silently fall back to process-local Backup Account
 * state.  A durable Supabase implementation is injected by the deployment;
 * until then, every remote-backup operation fails closed.
 */
export class UnavailableBackupAccountStore implements BackupAccountStore {
  public handoff(): bigint { throw new Error("durable Supabase Backup Account store is not configured"); }
  public async write(): Promise<BackupRecord> { throw new Error("durable Supabase Backup Account store is not configured"); }
  public async read(): Promise<{ state: unknown; generation: bigint }> { throw new Error("durable Supabase Backup Account store is not configured"); }
}

export type SupabaseBackupAccountStoreOptions = Readonly<{
  url: string;
  anonKey: string;
  fetch?: BackupFetchLike;
}>;
export type BackupFetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Browser-facing Backup Account storage. Supabase receives only an
 * AES-GCM-encrypted PrivateStateBackup; the Recovery Kit key remains in the
 * participant's possession. Every mutation goes through an authenticated CAS
 * function, never a direct table update.
 */
export class SupabaseBackupAccountStore implements BackupAccountStore {
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly fetchImpl: BackupFetchLike;

  public constructor(options: SupabaseBackupAccountStoreOptions) {
    assertHttpsEndpoint("Supabase URL", options.url);
    if (!options.anonKey.trim()) throw new Error("Supabase anon key is required for Backup Accounts");
    this.baseUrl = `${options.url.replace(/\/$/, "")}/rest/v1`;
    this.anonKey = options.anonKey;
    this.fetchImpl = options.fetch ?? fetch;
  }

  public async ensureAccount(input: { session: BackupSession; environment: PrivateEnvironment; deploymentId: string }): Promise<void> {
    this.assertSession(input.session);
    const accountId = input.session.accountId!;
    await this.requestJson("backup_accounts", input.session, {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify({ account_id: accountId, email: normalizeEmail(input.session.email), verified_email: false, generation: 0, active_writer: null, environment: input.environment, deployment_id: input.deploymentId, encrypted_state: null, encrypted_state_created_at: null }),
    });
    // Supabase Auth's email-confirmed claim is the source of truth for the
    // verified-email transition; the RPC keeps that transition server-side.
    await this.requestJson("rpc/mark_backup_email_verified", input.session, { method: "POST", body: "{}" });
  }

  public async handoff(session: BackupSession, writerId: string, expectedGeneration: bigint): Promise<bigint> {
    this.assertSession(session);
    if (!writerId.trim() || expectedGeneration < 0n) throw new Error("backup handoff is invalid");
    const value = await this.requestJson<unknown>("rpc/handoff_backup_cas", session, { method: "POST", body: JSON.stringify({ p_expected_generation: expectedGeneration.toString(), p_writer: writerId }) });
    return parseBigIntResult(value, "backup handoff");
  }

  public async write(input: { session: BackupSession; writerId: string; expectedGeneration: bigint; key: RecoveryKitKey; environment: PrivateEnvironment; deploymentId: string; state: unknown }): Promise<BackupRecord> {
    this.assertSession(input.session);
    if (input.expectedGeneration < 0n) throw new Error("backup generation is invalid");
    const encryptedState = await exportPrivateState({ key: input.key, environment: input.environment, deploymentId: input.deploymentId, generation: input.expectedGeneration + 1n, state: input.state });
    await this.requestJson("rpc/write_backup_cas", input.session, {
      method: "POST",
      body: JSON.stringify({ p_expected_generation: input.expectedGeneration.toString(), p_writer: input.writerId, p_environment: input.environment, p_deployment_id: input.deploymentId, p_encrypted_state: serializePrivateStateBackup(encryptedState) }),
    });
    return this.loadRecord(input.session);
  }

  public async read(input: { session: BackupSession; key: RecoveryKitKey; environment: PrivateEnvironment; deploymentId: string; retiredDeployments?: readonly string[] }): Promise<{ state: unknown; generation: bigint }> {
    this.assertSession(input.session);
    const record = await this.loadRecord(input.session);
    if (!record.encryptedState) throw new Error("no backup exists");
    return restorePrivateState({ key: input.key, backup: record.encryptedState, activeEnvironment: input.environment, activeDeploymentId: input.deploymentId, retiredDeployments: input.retiredDeployments });
  }

  private async loadRecord(session: BackupSession): Promise<BackupRecord> {
    const accountId = encodeURIComponent(session.accountId!);
    const rows = await this.requestJson<unknown[]>(`backup_accounts?select=email,verified_email,generation,active_writer,encrypted_state&account_id=eq.${accountId}&limit=1`, session, { method: "GET" });
    const row = Array.isArray(rows) ? rows[0] : undefined;
    if (!isRecord(row) || typeof row.email !== "string" || typeof row.verified_email !== "boolean" || row.generation === undefined || (row.active_writer !== null && typeof row.active_writer !== "string") || (row.encrypted_state !== null && typeof row.encrypted_state !== "string")) throw new Error("invalid Backup Account record");
    const generation = parseBigIntResult(row.generation, "backup generation");
    if (generation < 0n) throw new Error("invalid backup generation");
    const encryptedState = typeof row.encrypted_state === "string" ? parsePrivateStateBackup(row.encrypted_state) : null;
    return Object.freeze({ email: normalizeEmail(row.email), verifiedEmail: row.verified_email, generation, activeWriter: row.active_writer, encryptedState });
  }

  private async requestJson<T = unknown>(path: string, session: BackupSession, init: RequestInit): Promise<T> {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("apikey", this.anonKey);
    headers.set("authorization", `Bearer ${session.accessToken}`);
    headers.set("content-type", "application/json");
    const response = await this.fetchImpl(`${this.baseUrl}/${path}`, { ...init, headers });
    if (!response.ok) throw new Error(`Backup Account request failed with HTTP ${response.status}`);
    if (response.status === 204) return undefined as T;
    const body = await response.text();
    return body ? JSON.parse(body) as T : undefined as T;
  }

  private assertSession(session: BackupSession): void {
    if (session.aal !== "aal2" || !session.accountId?.trim() || !session.accessToken?.trim() || !Number.isSafeInteger(session.expiresAt) || session.expiresAt <= Date.now()) throw new Error("AAL2 Supabase session required");
    normalizeEmail(session.email);
  }
}

export function createSupabaseBackupAccountStore(options: SupabaseBackupAccountStoreOptions): BackupAccountStore {
  return new SupabaseBackupAccountStore(options);
}

function parseBigIntResult(value: unknown, label: string): bigint {
  const row = Array.isArray(value) ? value[0] : value;
  const candidate = isRecord(row) && Object.keys(row).length === 1 ? Object.values(row)[0] : row;
  if (typeof candidate === "number" && Number.isSafeInteger(candidate)) return BigInt(candidate);
  if (typeof candidate === "string" && /^\d+$/.test(candidate)) return BigInt(candidate);
  throw new Error(`invalid ${label} response`);
}

function assertHttpsEndpoint(label: string, value: string): void {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid HTTPS URL`); }
  if (parsed.protocol !== "https:") throw new Error(`${label} must use HTTPS`);
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("a verified email is required");
  return normalized;
}
