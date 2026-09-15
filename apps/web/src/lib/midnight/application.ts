import { deriveOwnerCommitment } from "./account";
import { BackupAccountService, type BackupSession } from "./backup";
import { MIDNIGHT_NETWORK_CONFIG } from "./config";
import { domain, hashWords, type Hex } from "./hashing";
import { PrizePoolLedger } from "./pool";
import { createRecoveryBundle, exportPrivateState, generateRecoveryKit, parseRecoveryBundle, restorePrivateState, runRecoveryReadinessCheck, serializeRecoveryBundle, type RecoveryBundle, type RecoveryKitKey } from "./recovery";
import type { PrivateStateBackup } from "./private-state";
import { ParticipantError, type CommandReceipt, type ParticipantSnapshot, type SponsorshipChoice, type WalletSnapshot } from "./types";
import { fromMicroUnits, toMicroUnits } from "./constants";

export type ParticipantCommand = "faucetClaim" | "contribute" | "withdraw" | "checkpointYield" | "finalizeDraw" | "claimPrize";

export interface ParticipantApplication {
  readonly snapshot: ParticipantSnapshot;
  connect(walletId?: string): Promise<WalletSnapshot>;
  disconnect(): Promise<void>;
  subscribe(listener: (snapshot: ParticipantSnapshot) => void): () => void;
  setSponsorship(choice: SponsorshipChoice): void;
  faucetClaim(): Promise<CommandReceipt>;
  contribute(amount: bigint | string): Promise<CommandReceipt>;
  withdraw(amount: bigint | string): Promise<CommandReceipt>;
  checkpointYield(): Promise<CommandReceipt>;
  finalizeDraw(): Promise<CommandReceipt>;
  claimPrize(): Promise<CommandReceipt>;
  exportRecovery(): Promise<PrivateStateBackup>;
  exportRecoveryBundle(): Promise<RecoveryBundle>;
  restoreRecovery(backup: PrivateStateBackup | RecoveryBundle | string): Promise<void>;
  runRecoveryReadiness(): Promise<boolean>;
  writeBackup(session: BackupSession, writerId: string): Promise<bigint>;
  readBackup(session: BackupSession): Promise<unknown>;
}

export interface ParticipantAdapter {
  readonly kind: "deterministic-preprod" | "midnight-preprod";
  readonly deploymentId: string;
  connect(walletId: string): Promise<WalletSnapshot>;
  disconnect(): Promise<void>;
  currentWallet(): WalletSnapshot | null;
  command(command: ParticipantCommand, amount?: bigint): Promise<CommandReceipt>;
  account(): { balanceMicroUnits: bigint; principalMicroUnits: bigint; twabSeconds: bigint; unclaimedPrizeMicroUnits: bigint };
  draw(): ParticipantSnapshot["draw"];
  advanceTime?(seconds: bigint): void;
  recoveryState(): unknown;
}

export class ParticipantApplicationClient implements ParticipantApplication {
  private wallet: WalletSnapshot | null = null;
  private status: ParticipantSnapshot["connection"] = "disconnected";
  private sponsorship: SponsorshipChoice = "participant-funded";
  private recoveryKey: RecoveryKitKey = generateRecoveryKit();
  private recoveryReady = false;
  private backupGeneration = 0n;
  private outage: string | null = null;
  private readonly listeners = new Set<(snapshot: ParticipantSnapshot) => void>();
  private current: ParticipantSnapshot;
  private readonly backups: BackupAccountService;

  public constructor(private readonly adapter: ParticipantAdapter, backups = new BackupAccountService()) {
    this.backups = backups;
    this.current = this.makeSnapshot();
  }

  public get snapshot(): ParticipantSnapshot { return this.current; }

  public async connect(walletId = "evidence-wallet-1"): Promise<WalletSnapshot> {
    this.status = "connecting"; this.emit();
    try {
      if (MIDNIGHT_NETWORK_CONFIG.network !== "preprod") throw new ParticipantError("MAINNET_DISABLED", "transactional Mainnet entrypoints are absent from this build");
      this.wallet = await this.adapter.connect(walletId);
      this.status = "connected";
      this.recoveryReady = await this.runRecoveryReadiness();
      this.emit();
      return this.wallet;
    } catch (cause) {
      this.status = "unavailable"; this.emit();
      if (cause instanceof ParticipantError) throw cause;
      throw new ParticipantError("OUTAGE", cause instanceof Error ? cause.message : "Preprod adapter is unavailable", true);
    }
  }

  public async disconnect(): Promise<void> { await this.adapter.disconnect(); this.wallet = null; this.status = "disconnected"; this.emit(); }
  public subscribe(listener: (snapshot: ParticipantSnapshot) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public setSponsorship(choice: SponsorshipChoice): void { this.sponsorship = choice; this.emit(); }

  public faucetClaim(): Promise<CommandReceipt> { return this.execute("faucetClaim"); }
  public contribute(amount: bigint | string): Promise<CommandReceipt> { return this.execute("contribute", parseAmount(amount)); }
  public withdraw(amount: bigint | string): Promise<CommandReceipt> { return this.execute("withdraw", parseAmount(amount)); }
  public checkpointYield(): Promise<CommandReceipt> { return this.execute("checkpointYield"); }
  public finalizeDraw(): Promise<CommandReceipt> { return this.execute("finalizeDraw"); }
  public claimPrize(): Promise<CommandReceipt> { return this.execute("claimPrize"); }

  public async exportRecovery(): Promise<PrivateStateBackup> {
    if (!this.wallet) throw new ParticipantError("AUTHORIZATION_REJECTED", "connect a wallet before exporting recovery state");
    return exportPrivateState({ key: this.recoveryKey, environment: "preprod", deploymentId: this.adapter.deploymentId, generation: this.backupGeneration, state: this.adapter.recoveryState() });
  }

  public async exportRecoveryBundle(): Promise<RecoveryBundle> {
    const backup = await this.exportRecovery();
    return createRecoveryBundle(this.recoveryKey, backup);
  }

  public async restoreRecovery(input: PrivateStateBackup | RecoveryBundle | string): Promise<void> {
    if (!this.wallet) throw new ParticipantError("AUTHORIZATION_REJECTED", "connect a wallet before restoring recovery state");
    try {
      const parsed = typeof input === "string" ? parseRecoveryInput(input) : input;
      const key = isRecoveryBundle(parsed) ? parsed.key : this.recoveryKey;
      const backup = isRecoveryBundle(parsed) ? parsed.backup : parsed;
      await restorePrivateState({ key, backup, activeEnvironment: "preprod", activeDeploymentId: this.adapter.deploymentId });
      this.recoveryKey = key;
      this.recoveryReady = true;
      this.emit();
    }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "recovery backup is stale";
      throw new ParticipantError(message.includes("retired deployment") ? "RETIRED_DEPLOYMENT" : "STALE_BACKUP", message, false);
    }
  }

  public async runRecoveryReadiness(): Promise<boolean> {
    const drill = await runRecoveryReadinessCheck({ key: this.recoveryKey, environment: "preprod", deploymentId: this.adapter.deploymentId, state: this.adapter.recoveryState(), generation: this.backupGeneration });
    this.recoveryReady = drill.exported && drill.restored;
    this.emit();
    return this.recoveryReady;
  }

  public async writeBackup(session: BackupSession, writerId: string): Promise<bigint> {
    if (!this.wallet) throw new ParticipantError("AUTHORIZATION_REJECTED", "connect a wallet before backing up");
    const record = await this.backups.write({ session, writerId, expectedGeneration: this.backupGeneration, key: this.recoveryKey, environment: "preprod", deploymentId: this.adapter.deploymentId, state: this.adapter.recoveryState() });
    this.backupGeneration = record.generation; this.emit(); return this.backupGeneration;
  }

  public async readBackup(session: BackupSession): Promise<unknown> {
    try { const restored = await this.backups.read({ session, key: this.recoveryKey, environment: "preprod", deploymentId: this.adapter.deploymentId }); this.backupGeneration = restored.generation; this.emit(); return restored.state; }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : "backup could not be restored";
      throw new ParticipantError(message.includes("retired deployment") ? "RETIRED_DEPLOYMENT" : "STALE_BACKUP", message, false);
    }
  }

  private async execute(command: ParticipantCommand, amount?: bigint): Promise<CommandReceipt> {
    if (!this.wallet) throw new ParticipantError("AUTHORIZATION_REJECTED", "connect a supported Preprod wallet first");
    if (command === "contribute" && !this.recoveryReady) throw new ParticipantError("RECOVERY_NOT_READY", "complete the Recovery Kit export and restore drill before contributing");
    if (this.outage) throw new ParticipantError("OUTAGE", this.outage, true);
    try { const receipt = await this.adapter.command(command, amount); this.emit(); return { ...receipt, sponsorship: this.sponsorship }; }
    catch (cause) { if (cause instanceof ParticipantError) throw cause; throw new ParticipantError("OUTAGE", cause instanceof Error ? cause.message : "Preprod transaction failed", true); }
  }

  private makeSnapshot(): ParticipantSnapshot {
    const account = this.adapter.account();
    return { connection: this.status, wallet: this.wallet, deployment: { environment: "preprod", deploymentId: this.adapter.deploymentId, mainnetTransactionsEnabled: false }, privateBalanceMicroUnits: account.balanceMicroUnits, principalMicroUnits: account.principalMicroUnits, unclaimedPrizeMicroUnits: account.unclaimedPrizeMicroUnits, recoveryReady: this.recoveryReady, backupGeneration: this.backupGeneration, draw: this.adapter.draw(), sponsorship: this.sponsorship, outage: this.outage };
  }
  private emit(): void { this.current = this.makeSnapshot(); for (const listener of this.listeners) listener(this.current); }
}

export class DeterministicPreprodAdapter implements ParticipantAdapter {
  public readonly kind = "deterministic-preprod" as const;
  public readonly deploymentId: string;
  public readonly pool: PrizePoolLedger;
  private nowSeconds: bigint;
  private wallet: WalletSnapshot | null = null;
  private secret: Hex | null = null;
  // The deterministic adapter must produce the same private state for the
  // same wallet across runs.  A wallet-scoped salt still keeps the owner
  // commitment separate from the wallet's public address without relying on
  // process-local randomness.
  private salt: Hex | null = null;

  public constructor(options: { deploymentId?: string; startTime?: bigint; pool?: PrizePoolLedger } = {}) { this.deploymentId = options.deploymentId ?? "shroudly-preprod-deterministic"; this.nowSeconds = options.startTime ?? 0n; this.pool = options.pool ?? new PrizePoolLedger("preprod", this.deploymentId, this.nowSeconds); }
  public async connect(walletId: string): Promise<WalletSnapshot> { if (!walletId.trim()) throw new ParticipantError("UNSUPPORTED_WALLET", "a wallet id is required"); this.secret = hashWords(domain("wallet/secret/v1"), walletId); this.salt = bytes32WalletSalt(walletId); this.wallet = { walletId, address: hashWords(domain("wallet/address/v1"), walletId), network: "preprod", apiVersion: "4.0.1" }; return this.wallet; }
  public async disconnect(): Promise<void> { this.wallet = null; this.secret = null; this.salt = null; }
  public currentWallet(): WalletSnapshot | null { return this.wallet; }
  public advanceTime(seconds: bigint): void { if (seconds < 0n) throw new Error("time cannot move backwards"); this.nowSeconds += seconds; }
  public seedWallet(walletId: string): void { this.pool.faucetClaim(hashWords(domain("wallet/secret/v1"), walletId), bytes32WalletSalt(walletId), this.nowSeconds); }
  public async command(command: ParticipantCommand, amount?: bigint): Promise<CommandReceipt> {
    if (!this.secret || !this.wallet || !this.salt) throw new ParticipantError("AUTHORIZATION_REJECTED", "wallet is not connected");
    const secret = this.secret; const salt = this.salt;
    if (command === "faucetClaim") this.pool.faucetClaim(secret, salt, this.nowSeconds);
    else if (command === "contribute") this.pool.contribute(secret, salt, amount ?? 0n, this.nowSeconds);
    else if (command === "withdraw") this.pool.withdraw(secret, salt, amount ?? 0n, this.nowSeconds);
    else if (command === "checkpointYield") this.pool.checkpointYield(this.nowSeconds);
    else if (command === "finalizeDraw") { this.ensureRandomness(); this.pool.finalizeDraw(this.nowSeconds); }
    else if (command === "claimPrize") this.pool.claimPrize(secret, salt, this.nowSeconds);
    const transactionId = hashWords(domain("transaction/v1"), this.wallet.address as Hex, command, String(this.nowSeconds));
    return { transactionId, action: command, status: "finalized", finalizedAt: Number(this.nowSeconds), indexerVisible: true, ledgerConfirmed: true, sponsorship: "participant-funded" };
  }
  public account(): { balanceMicroUnits: bigint; principalMicroUnits: bigint; twabSeconds: bigint; unclaimedPrizeMicroUnits: bigint } { if (!this.secret || !this.salt) return { balanceMicroUnits: 0n, principalMicroUnits: 0n, twabSeconds: 0n, unclaimedPrizeMicroUnits: 0n }; const account = this.pool.account(this.secret, this.salt, this.nowSeconds); const owner = deriveOwnerCommitment(this.secret, this.salt); return { balanceMicroUnits: this.pool.asset.balanceOf(owner), principalMicroUnits: account.principalMicroUnits, twabSeconds: account.twabSeconds, unclaimedPrizeMicroUnits: this.pool.unclaimedPrize(this.secret, this.salt) }; }
  public draw(): ParticipantSnapshot["draw"] { return this.pool.snapshot(this.nowSeconds).draw; }
  public recoveryState(): unknown { return { walletId: this.wallet?.walletId ?? null, note: this.secret && this.salt ? this.pool.account(this.secret, this.salt, this.nowSeconds) : null }; }
  private ensureRandomness(): void {
    const seeds: Record<string, Hex> = { render: bytes32WalletSalt("render"), "github-actions": bytes32WalletSalt("github-actions"), "offline-maintainer": bytes32WalletSalt("offline-maintainer") };
    const draw = this.pool.snapshot(this.nowSeconds).draw;
    const opened = draw.commitCutoff - 180n;
    for (const [contributor, seed] of Object.entries(seeds)) { const reveal = this.pool.deriveReveal(seed); const commitment = this.pool.commitForReveal(reveal, contributor); try { this.pool.commitRandomness(contributor, commitment, opened); } catch { /* idempotent automation */ } try { this.pool.revealRandomness(contributor, reveal, draw.revealClosesAt); } catch { /* idempotent automation */ } }
    if (this.nowSeconds < draw.revealClosesAt) this.nowSeconds = draw.revealClosesAt;
  }
}

function parseAmount(amount: bigint | string): bigint { return typeof amount === "bigint" ? amount : toMicroUnits(amount); }
function bytes32WalletSalt(walletId: string): Hex { return hashWords(domain("wallet/salt/v1"), walletId); }

function isRecoveryBundle(value: PrivateStateBackup | RecoveryBundle): value is RecoveryBundle {
  return "format" in value && value.format === "shroudly-recovery-kit";
}

function parseRecoveryInput(serialized: string): PrivateStateBackup | RecoveryBundle {
  try { return parseRecoveryBundle(serialized); }
  catch { return JSON.parse(serialized, (_, value) => typeof value === "string" && /^\d+n$/.test(value) ? BigInt(value.slice(0, -1)) : value) as PrivateStateBackup; }
}

export function createParticipantApplication(adapter: ParticipantAdapter = new DeterministicPreprodAdapter()): ParticipantApplication { return new ParticipantApplicationClient(adapter); }

export { fromMicroUnits };
