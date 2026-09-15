import type { NetworkId, WalletSnapshot } from "./types";
import { ParticipantError } from "./types";

export type DAppConnectorConfiguration = Readonly<{ networkId: NetworkId; apiVersion: string; walletId: string }>;
export type ConnectedWallet = Readonly<{ snapshot: WalletSnapshot; api: ConnectedWalletApi }>;
export type ConnectedWalletApi = Readonly<{ configuration: DAppConnectorConfiguration; providers: { wallet: unknown; proof: unknown; publicData: unknown; privateState: unknown; zkConfig: unknown; logging: unknown } }>;

type InitialWalletApi = { apiVersion?: unknown; version?: unknown; connect(networkId: NetworkId): Promise<unknown> };

export function discoverMidnightWallets(source: unknown = typeof window === "undefined" ? undefined : window.midnight): string[] {
  if (!source || typeof source !== "object") return [];
  return Object.keys(source as Record<string, unknown>).filter((walletId) => isWallet((source as Record<string, unknown>)[walletId]));
}

export class MidnightDAppConnector {
  private connected: ConnectedWallet | null = null;
  public constructor(private readonly walletSource: Record<string, unknown> = (typeof window === "undefined" ? {} : window.midnight ?? {})) {}

  public walletIds(): readonly string[] { return discoverMidnightWallets(this.walletSource); }

  public async connect(walletId: string, networkId: NetworkId = "preprod"): Promise<ConnectedWallet> {
    const initial = this.walletSource[walletId];
    if (!isWallet(initial)) throw new ParticipantError("UNSUPPORTED_WALLET", "supported Lace wallet discovery was not found");
    let connected: unknown;
    try { connected = await initial.connect(networkId); } catch (cause) { throw new ParticipantError("AUTHORIZATION_REJECTED", cause instanceof Error ? cause.message : "wallet authorization was rejected"); }
    if (!isRecord(connected)) throw new ParticipantError("UNSUPPORTED_VERSION", "wallet returned an invalid connection response");
    const apiVersion = stringValue(connected.apiVersion ?? connected.version ?? initial.apiVersion ?? initial.version);
    if (apiVersion !== "4.0.1") throw new ParticipantError("UNSUPPORTED_VERSION", `DApp Connector API ${apiVersion || "unknown"} is unsupported`);
    const configuration = connected.configuration;
    if (!isRecord(configuration) || configuration.networkId !== networkId) throw new ParticipantError("UNSUPPORTED_NETWORK", "wallet is connected to the wrong Midnight network");
    const address = stringValue(connected.address ?? connected.walletAddress ?? connected.unshieldedAddress);
    if (!address) throw new ParticipantError("UNSUPPORTED_WALLET", "wallet did not return a participant address");
    const providers = isRecord(connected.providers) ? connected.providers : {};
    const api: ConnectedWalletApi = Object.freeze({ configuration: { networkId, apiVersion, walletId }, providers: { wallet: providers.wallet, proof: providers.proof, publicData: providers.publicData, privateState: providers.privateState, zkConfig: providers.zkConfig, logging: providers.logging } });
    this.connected = Object.freeze({ snapshot: { walletId, address, network: networkId, apiVersion }, api });
    return this.connected;
  }

  public current(): ConnectedWallet | null { return this.connected; }
  public disconnect(): void { this.connected = null; }
}

function isWallet(value: unknown): value is InitialWalletApi { return isRecord(value) && typeof value.connect === "function"; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null; }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
