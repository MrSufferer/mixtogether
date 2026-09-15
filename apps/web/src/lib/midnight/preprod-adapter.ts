import type { CommandReceipt, ParticipantSnapshot, WalletSnapshot } from "./types";
import { ParticipantError, type SponsorshipChoice } from "./types";
import type { ParticipantAdapter, ParticipantCommand, SponsorExecutor } from "./application";
import { MidnightDAppConnector, type ConnectedWallet } from "./connector";
import { composeOfficialProviders, type OfficialProviderComposition } from "./providers";
import { MIDNIGHT_NETWORK_CONFIG } from "./config";
import { ZERO_BYTES32 } from "./hashing";

export type FinalityObservation = Readonly<{ transactionId: `0x${string}`; networkFinalized: boolean; indexerVisible: boolean; ledgerConfirmed: boolean; }>;
export type PreprodCommandExecutor = (command: ParticipantCommand, amount?: bigint, wallet?: ConnectedWallet) => Promise<FinalityObservation>;

/** Genuine DApp Connector 4.0.1 boundary. No wallet bridge is bundled in production. */
export class MidnightPreprodAdapter implements ParticipantAdapter {
  public readonly kind = "midnight-preprod" as const;
  public readonly deploymentId: string;
  private connected: ConnectedWallet | null = null;
  private readonly composition: OfficialProviderComposition;
  private readonly sponsor?: SponsorExecutor;
  public constructor(private readonly connector = new MidnightDAppConnector(), options: { deploymentId?: string; providers?: Omit<OfficialProviderComposition, "network">; execute?: PreprodCommandExecutor; sponsor?: SponsorExecutor } = {}) {
    this.deploymentId = options.deploymentId ?? MIDNIGHT_NETWORK_CONFIG.deploymentId;
    this.composition = composeOfficialProviders({ ...(options.providers ?? { wallet: {}, proof: {}, publicData: {}, privateState: {}, zkConfig: {}, logging: {} }), network: "preprod" });
    this.executeCommand = options.execute ?? (async () => { throw new ParticipantError("OUTAGE", "Preprod contract executor is not configured", true); });
    this.sponsor = options.sponsor;
  }
  private readonly executeCommand: PreprodCommandExecutor;
  public get providers(): OfficialProviderComposition { return this.composition; }
  public async connect(walletId: string): Promise<WalletSnapshot> { this.connected = await this.connector.connect(walletId, "preprod"); return this.connected.snapshot; }
  public async disconnect(): Promise<void> { this.connector.disconnect(); this.connected = null; }
  public currentWallet(): WalletSnapshot | null { return this.connected?.snapshot ?? null; }
  public async command(command: ParticipantCommand, amount?: bigint, sponsorship: SponsorshipChoice = "participant-funded"): Promise<CommandReceipt> {
    if (!this.connected) throw new ParticipantError("AUTHORIZATION_REJECTED", "connect a Lace wallet first");
    if (sponsorship === "sponsored" && !this.sponsor) throw new ParticipantError("SPONSOR_REJECTED", "DUST Sponsor Service is not configured; choose wallet-funded DUST", true);
    if (sponsorship === "sponsored") {
      try { await this.sponsor!({ command, amount, wallet: this.connected.snapshot, deploymentId: this.deploymentId }); }
      catch (cause) {
        const message = cause instanceof Error ? cause.message : "DUST sponsorship was rejected";
        throw new ParticipantError(message.toLowerCase().includes("timeout") ? "SPONSOR_TIMEOUT" : "SPONSOR_REJECTED", `${message}; choose wallet-funded DUST`, true);
      }
    }
    const observation = await this.executeCommand(command, amount, this.connected);
    if (!observation.networkFinalized) throw new ParticipantError("FINALITY_LAG", "network finality has not been observed", true);
    if (!observation.indexerVisible) throw new ParticipantError("INDEXER_LAG", "indexer visibility has not caught up", true);
    if (!observation.ledgerConfirmed) throw new ParticipantError("FINALITY_LAG", "fresh ledger confirmation is required", true);
    return { transactionId: observation.transactionId, action: command, status: "finalized", finalizedAt: Math.floor(Date.now() / 1000), indexerVisible: true, ledgerConfirmed: true, sponsorship };
  }
  public account(): { balanceMicroUnits: bigint; principalMicroUnits: bigint; twabSeconds: bigint; unclaimedPrizeMicroUnits: bigint } { return { balanceMicroUnits: 0n, principalMicroUnits: 0n, twabSeconds: 0n, unclaimedPrizeMicroUnits: 0n }; }
  public draw(): ParticipantSnapshot["draw"] { const now = BigInt(Math.floor(Date.now() / 1000)); return { drawId: 0n, phase: "open", opensAt: now, closesAt: now, commitCutoff: now, revealOpensAt: now, revealClosesAt: now, eligibleCommitments: 0, disclosureCohortMet: false, prizeMicroUnits: 0n, rolloverMicroUnits: 0n, winningCommitment: ZERO_BYTES32 }; }
  public recoveryState(): unknown { return { deploymentId: this.deploymentId, walletId: this.connected?.snapshot.walletId ?? null }; }
}
