import { bytes32, domain, hashToBigInt, hashWords } from "./hashing";
import { exportPrivateState, restorePrivateState, type PrivateEnvironment, type RecoveryKitKey } from "./recovery";
import type { PrivateStateBackup } from "./private-state";

export type BackupSession = Readonly<{ sessionId: string; email: string; aal: "aal2"; expiresAt: number }>;
export type BackupRecord = Readonly<{ email: string; verifiedEmail: boolean; generation: bigint; activeWriter: string | null; encryptedState: PrivateStateBackup | null }>;
export interface BackupAccountStore {
  handoff(session: BackupSession, writerId: string, expectedGeneration: bigint): bigint;
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

function normalizeEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalized)) throw new Error("a verified email is required");
  return normalized;
}
