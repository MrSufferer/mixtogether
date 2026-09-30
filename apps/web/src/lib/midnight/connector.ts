import type { NetworkId, WalletSnapshot } from "./types";
import { ParticipantError } from "./types";

/**
 * The application only depends on this small, normalized configuration. The
 * URI fields are copied from the wallet's connected configuration when the
 * official connector exposes them; the application never invents a provider
 * URI on behalf of a wallet.
 */
export type DAppConnectorConfiguration = Readonly<{
  networkId: NetworkId;
  apiVersion: string;
  walletId: string;
  indexerUri?: string;
  indexerWsUri?: string;
  proverServerUri?: string;
  substrateNodeUri?: string;
}>;

/**
 * A structural view of ConnectedAPI from @midnight-ntwrk/dapp-connector-api
 * 4.0.1. The package is intentionally not bundled into this small adapter:
 * the wallet owns the actual implementation and the generated contract
 * runtime is injected at the transaction boundary.
 */
export type ConnectedWalletOperations = Readonly<{
  getConfiguration?: () => Promise<unknown> | unknown;
  getConnectionStatus?: () => Promise<unknown> | unknown;
  getUnshieldedAddress?: () => Promise<unknown> | unknown;
  getShieldedAddresses?: () => Promise<unknown> | unknown;
  getProvingProvider?: (keyMaterialProvider?: unknown) => Promise<unknown> | unknown;
  balanceUnsealedTransaction?: (transaction: unknown) => Promise<unknown> | unknown;
  balanceSealedTransaction?: (transaction: unknown) => Promise<unknown> | unknown;
  submitTransaction?: (transaction: unknown) => Promise<unknown> | unknown;
  makeTransfer?: (outputs: unknown) => Promise<unknown> | unknown;
}>;

export type ConnectedWallet = Readonly<{ snapshot: WalletSnapshot; api: ConnectedWalletApi }>;
export type ConnectedWalletApi = Readonly<{
  configuration: DAppConnectorConfiguration;
  /** Normalized operations used by the official transaction runtime. */
  operations: ConnectedWalletOperations;
  /** Opaque provider values retained for the composition seam. */
  providers: {
    wallet: unknown;
    proof: unknown;
    publicData: unknown;
    privateState: unknown;
    zkConfig: unknown;
    logging: unknown;
  };
  /** The unmodified ConnectedAPI; only the adapter may consume it. */
  raw: unknown;
}>;

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
    try {
      connected = await initial.connect(networkId);
    } catch (cause) {
      throw new ParticipantError("AUTHORIZATION_REJECTED", cause instanceof Error ? cause.message : "wallet authorization was rejected");
    }
    if (!isRecord(connected)) throw new ParticipantError("UNSUPPORTED_VERSION", "wallet returned an invalid connection response");

    const apiVersion = stringValue(connected.apiVersion ?? connected.version ?? initial.apiVersion ?? initial.version);
    if (apiVersion !== "4.0.1") throw new ParticipantError("UNSUPPORTED_VERSION", `DApp Connector API ${apiVersion || "unknown"} is unsupported`);

    const operations = connected as ConnectedWalletOperations;
    let officialConfiguration: Record<string, unknown> | null = null;
    let connectionStatus: Record<string, unknown> | null = null;
    try {
      officialConfiguration = await optionalRecordCall(operations, "getConfiguration");
      connectionStatus = await optionalRecordCall(operations, "getConnectionStatus");
    } catch (cause) {
      throw new ParticipantError("AUTHORIZATION_REJECTED", cause instanceof Error ? cause.message : "wallet connection status could not be verified");
    }

    const embeddedConfiguration = isRecord(connected.configuration) ? connected.configuration : null;
    const reportedNetwork = stringValue(officialConfiguration?.networkId ?? embeddedConfiguration?.networkId ?? connected.networkId);
    if (reportedNetwork !== networkId) throw new ParticipantError("UNSUPPORTED_NETWORK", "wallet is connected to the wrong Midnight network");

    const statusNetwork = stringValue(connectionStatus?.networkId);
    if (statusNetwork && statusNetwork !== networkId) throw new ParticipantError("UNSUPPORTED_NETWORK", "wallet connection status reports the wrong Midnight network");
    const status = stringValue(connectionStatus?.status ?? connectionStatus?.connectionStatus).toLowerCase();
    if (["disconnected", "not-connected", "unauthorized"].includes(status)) {
      throw new ParticipantError("AUTHORIZATION_REJECTED", "wallet authorization is no longer active");
    }

    let address: string;
    try {
      const officialAddress = typeof operations.getUnshieldedAddress === "function" ? await operations.getUnshieldedAddress.call(operations) : null;
      address = extractAddress(officialAddress) || stringValue(connected.address ?? connected.walletAddress ?? connected.unshieldedAddress);
    } catch (cause) {
      throw new ParticipantError("UNSUPPORTED_WALLET", cause instanceof Error ? cause.message : "wallet address could not be read");
    }
    if (!address) throw new ParticipantError("UNSUPPORTED_WALLET", "wallet did not return a participant address");

    const configuration: DAppConnectorConfiguration = {
      networkId,
      apiVersion,
      walletId,
      ...optionalStringFields(officialConfiguration ?? embeddedConfiguration),
    };
    const api: ConnectedWalletApi = Object.freeze({
      configuration,
      operations,
      providers: {
        // Official 4.0.1 exposes operations on ConnectedAPI rather than a
        // provider bag. Retain the bag as an opaque compatibility seam for
        // the generated runtime.
        wallet: connected,
        proof: connected,
        publicData: connected,
        privateState: connected,
        zkConfig: connected,
        logging: connected,
      },
      raw: connected,
    });
    this.connected = Object.freeze({ snapshot: { walletId, address, network: networkId, apiVersion }, api });
    return this.connected;
  }

  public current(): ConnectedWallet | null { return this.connected; }
  public disconnect(): void { this.connected = null; }
}

async function optionalRecordCall(owner: ConnectedWalletOperations, method: "getConfiguration" | "getConnectionStatus"): Promise<Record<string, unknown> | null> {
  const call = owner[method];
  if (typeof call !== "function") return null;
  const result = await call.call(owner);
  return isRecord(result) ? result : null;
}

function optionalStringFields(value: Record<string, unknown> | null): Pick<DAppConnectorConfiguration, "indexerUri" | "indexerWsUri" | "proverServerUri" | "substrateNodeUri"> {
  if (!value) return {};
  const fields: { indexerUri?: string; indexerWsUri?: string; proverServerUri?: string; substrateNodeUri?: string } = {};
  const names = ["indexerUri", "indexerWsUri", "proverServerUri", "substrateNodeUri"] as const;
  for (const name of names) {
    const valueAtName = stringValue(value[name]);
    if (valueAtName) fields[name] = valueAtName;
  }
  return fields;
}

function extractAddress(value: unknown): string {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return "";
  return stringValue(value.unshieldedAddress ?? value.address ?? value.value);
}

function isWallet(value: unknown): value is InitialWalletApi { return isRecord(value) && typeof value.connect === "function"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function stringValue(value: unknown): string { return typeof value === "string" ? value : ""; }
