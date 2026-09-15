import type { PrivateStateStore } from "./private-state";
import type { NetworkId } from "./types";

export type ProofMode = "local" | "remote-opt-in";
export type MidnightProviderConfig = Readonly<{ network: "preprod"; rpcUrl: string; indexerGraphqlUrl: string; proofMode?: ProofMode; allowRemoteProof?: boolean }>;
export type ProviderStatus = Readonly<{ proofMode: ProofMode; privateState: "local"; publicData: "indexer"; connector: "dapp-connector-boundary"; dust: "explicit-approval-boundary" }>;

export interface PublicDataProvider { readonly kind: "indexer"; query<T>(query: string, variables?: Record<string, unknown>): Promise<T>; }
export interface ProofProvider { readonly mode: ProofMode; prove(request: unknown): Promise<unknown>; }
export interface WalletProvider { connect(): Promise<unknown>; disconnect(): Promise<void>; }
export interface DAppConnectorBoundary { requestAuthorization(): Promise<unknown>; disconnect(): Promise<void>; }
export interface DustSponsorBoundary { sponsorAfterApproval(transaction: UserApprovedTransaction): Promise<{ sponsoredTransaction: unknown }>; }
export type UserApprovedTransaction = Readonly<{ transactionId: string; calldataFingerprint: string; approvedAt: number }>;
export type MidnightProviderBoundaries = Readonly<{ config: MidnightProviderConfig; status: ProviderStatus; publicData: PublicDataProvider; proof: ProofProvider; privateState: PrivateStateStore<unknown>; wallet: WalletProvider; connector: DAppConnectorBoundary; dust: DustSponsorBoundary }>;

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

export type OfficialProviderComposition = Readonly<{ wallet: unknown; proof: unknown; publicData: unknown; privateState: unknown; zkConfig: unknown; logging: unknown; network: NetworkId }>;

export function composeOfficialProviders(input: Omit<OfficialProviderComposition, "network"> & { network?: NetworkId }): OfficialProviderComposition {
  return Object.freeze({ ...input, network: input.network ?? "preprod" });
}
