/** Shared browser-safe types used at the ParticipantApplication seam. */
export type Hex = `0x${string}`;

export type NetworkId = "preprod" | "mainnet";

export type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "unavailable"
  | "unsupported-network"
  | "unsupported-version";

export type ParticipantStateStatus = "unavailable" | "available" | "stale";

export type SponsorshipChoice = "sponsored" | "participant-funded";

export type ErrorCode =
  | "UNSUPPORTED_WALLET"
  | "UNSUPPORTED_NETWORK"
  | "UNSUPPORTED_VERSION"
  | "AUTHORIZATION_REJECTED"
  | "PROOF_FAILURE"
  | "SPONSOR_REJECTED"
  | "SPONSOR_TIMEOUT"
  | "FINALITY_LAG"
  | "INDEXER_LAG"
  | "OUTAGE"
  | "STALE_BACKUP"
  | "RETIRED_DEPLOYMENT"
  | "RECOVERY_NOT_READY"
  | "MAINNET_DISABLED"
  | "INVALID_COMMAND"
  | "SOLVENCY_BREACH"
  | "THRESHOLD_NOT_MET"
  | "CLAIM_EXPIRED"
  | "ALREADY_CLAIMED";

export class ParticipantError extends Error {
  public readonly name = "ParticipantError";

  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

export type CommandReceipt = Readonly<{
  transactionId: Hex;
  action: string;
  status: "finalized";
  finalizedAt: number;
  indexerVisible: true;
  ledgerConfirmed: true;
  sponsorship: SponsorshipChoice;
}>;

export type WalletSnapshot = Readonly<{
  walletId: string;
  address: string;
  network: NetworkId;
  apiVersion: string;
}>;

export type ParticipantAccountSnapshot = Readonly<{
  balanceMicroUnits: bigint;
  principalMicroUnits: bigint;
  twabSeconds: bigint;
  unclaimedPrizeMicroUnits: bigint;
}>;

export type PublicDrawSnapshot = Readonly<{
  drawId: bigint;
  phase: "open" | "closed" | "revealing" | "finalized" | "rolled-over";
  opensAt: bigint;
  closesAt: bigint;
  commitCutoff: bigint;
  revealOpensAt: bigint;
  revealClosesAt: bigint;
  eligibleCommitments: number;
  disclosureCohortMet: boolean;
  winningCommitment?: Hex;
  prizeMicroUnits: bigint;
  rolloverMicroUnits: bigint;
}>;

export type ParticipantStateSnapshot = Readonly<{
  account: ParticipantAccountSnapshot;
  draw: PublicDrawSnapshot;
}>;

export type ParticipantSnapshot = Readonly<{
  connection: ConnectionStatus;
  wallet: WalletSnapshot | null;
  deployment: Readonly<{
    environment: "preprod" | "mainnet-test-build";
    deploymentId: string;
    mainnetTransactionsEnabled: false;
  }>;
  stateStatus: ParticipantStateStatus;
  stateMessage: string | null;
  privateBalanceMicroUnits: bigint;
  principalMicroUnits: bigint;
  unclaimedPrizeMicroUnits: bigint;
  recoveryReady: boolean;
  backupGeneration: bigint;
  draw: PublicDrawSnapshot;
  sponsorship: SponsorshipChoice;
  outage: string | null;
}>;

export function isHex(value: unknown, bytes?: number): value is Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]*$/.test(value)) return false;
  return bytes === undefined ? value.length % 2 === 0 : value.length === 2 + bytes * 2;
}
