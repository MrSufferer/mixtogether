import { describe, expect, test } from "vitest";
import { MidnightDAppConnector } from "./connector";
import { createOfficialMidnightJsExecutor, createOfficialPreprodExecutor, MidnightPreprodAdapter } from "./preprod-adapter";
import type { ParticipantStateSnapshot } from "./types";

const contractIds = { asset: "asset", randomness: "randomness", yield: "yield", pool: "pool" } as const;
const transactionId = `0x${"a".repeat(64)}` as const;
const state: ParticipantStateSnapshot = {
  account: { balanceMicroUnits: 10_000_000n, principalMicroUnits: 5_000_000n, twabSeconds: 42n, unclaimedPrizeMicroUnits: 0n },
  draw: { drawId: 1n, phase: "open", opensAt: 0n, closesAt: 900n, commitCutoff: 900n, revealOpensAt: 901n, revealClosesAt: 1_200n, eligibleCommitments: 5, disclosureCohortMet: true, prizeMicroUnits: 100_000_000n, rolloverMicroUnits: 0n },
};

describe("genuine Preprod transaction lifecycle", () => {
  test("builds, proves, balances, submits, and independently observes finality", async () => {
    const calls: string[] = [];
    const api: Record<string, unknown> = {
      apiVersion: "4.0.1",
      networkId: "preprod",
      getConfiguration: () => ({ networkId: "preprod" }),
      getConnectionStatus: () => ({ status: "connected", networkId: "preprod" }),
      getUnshieldedAddress: () => ({ address: "addr_test1_shroudly" }),
      getProvingProvider(this: Record<string, unknown>) { calls.push(this === api ? "proving-receiver" : "wrong-proving-receiver"); return { prove: () => ({ proof: true }) }; },
      balanceUnsealedTransaction(this: Record<string, unknown>, value: unknown) { calls.push(this === api ? "balance-receiver" : "wrong-balance-receiver"); return { balanced: value }; },
      submitTransaction(this: Record<string, unknown>, value: unknown) { calls.push(this === api ? "submit-receiver" : "wrong-submit-receiver"); return { transactionId, submitted: value }; },
    };
    const transaction = {
      prove(this: object, provingProvider: unknown) {
        if (this !== transaction) throw new Error("transaction receiver was not preserved");
        calls.push(provingProvider ? "prove" : "missing-provider");
        return { proven: true };
      },
    };
    const connector = new MidnightDAppConnector({ lace: { apiVersion: "4.0.1", connect: async () => api } });
    const executor = createOfficialPreprodExecutor({
      deploymentId: "deployment",
      contractIds,
      build: async (input) => {
        expect(input.command).toBe("contribute");
        expect(input.amount).toBe(5n);
        expect(input.deploymentId).toBe("deployment");
        expect(input.contractIds).toEqual(contractIds);
        return { transaction };
      },
      finality: { wait: async (id) => ({ transactionId: id, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }) },
    });
    const adapter = new MidnightPreprodAdapter(connector, { deploymentId: "deployment", contractIds, execute: executor, stateReader: async () => state });
    await adapter.connect("lace");
    await adapter.refreshState();
    const receipt = await adapter.command("contribute", 5n);

    expect(receipt).toMatchObject({ transactionId, action: "contribute", status: "finalized", indexerVisible: true, ledgerConfirmed: true });
    expect(calls).toEqual(["proving-receiver", "prove", "balance-receiver", "submit-receiver"]);
  });

  test("does not turn a submission without finality evidence into a receipt", async () => {
    const api: Record<string, unknown> = {
      apiVersion: "4.0.1",
      networkId: "preprod",
      getConfiguration: () => ({ networkId: "preprod" }),
      getConnectionStatus: () => ({ status: "connected", networkId: "preprod" }),
      getUnshieldedAddress: () => "addr_test1_shroudly",
      getProvingProvider: () => ({ prove: () => ({}) }),
      balanceUnsealedTransaction: (value: unknown) => value,
      submitTransaction: () => ({ transactionId }),
    };
    const transaction = { prove: async () => ({}) };
    const connector = new MidnightDAppConnector({ lace: { apiVersion: "4.0.1", connect: async () => api } });
    const executor = createOfficialPreprodExecutor({ deploymentId: "deployment", contractIds, build: async () => ({ transaction }) });
    const adapter = new MidnightPreprodAdapter(connector, { deploymentId: "deployment", contractIds, execute: executor, stateReader: async () => state });
    await adapter.connect("lace");
    await adapter.refreshState();

    await expect(adapter.command("contribute", 5n)).rejects.toMatchObject({ code: "FINALITY_LAG", retryable: true });
  });

  test("does not spend sponsor quota or execute a command without verified state", async () => {
    const api: Record<string, unknown> = {
      apiVersion: "4.0.1",
      networkId: "preprod",
      getConfiguration: () => ({ networkId: "preprod" }),
      getConnectionStatus: () => ({ status: "connected", networkId: "preprod" }),
      getUnshieldedAddress: () => "addr_test1_shroudly",
    };
    let executed = false;
    let sponsored = false;
    const connector = new MidnightDAppConnector({ lace: { apiVersion: "4.0.1", connect: async () => api } });
    const adapter = new MidnightPreprodAdapter(connector, {
      deploymentId: "deployment",
      contractIds,
      execute: async () => { executed = true; return { transactionId, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }; },
      sponsor: async () => { sponsored = true; },
    });
    await adapter.connect("lace");

    await expect(adapter.command("contribute", 5n, "sponsored")).rejects.toMatchObject({ code: "OUTAGE", retryable: true });
    expect(executed).toBe(false);
    expect(sponsored).toBe(false);
  });

  test("keeps configured node, indexer, and ZK providers after wallet connection", async () => {
    const api: Record<string, unknown> = {
      apiVersion: "4.0.1",
      networkId: "preprod",
      getConfiguration: () => ({ networkId: "preprod" }),
      getConnectionStatus: () => ({ status: "connected", networkId: "preprod" }),
      getUnshieldedAddress: () => "addr_test1_shroudly",
    };
    const connector = new MidnightDAppConnector({ lace: { apiVersion: "4.0.1", connect: async () => api } });
    const adapter = new MidnightPreprodAdapter(connector, { deploymentId: "deployment", contractIds });
    const before = adapter.providers;

    await adapter.connect("lace");

    expect(adapter.providers.publicData).toBe(before.publicData);
    expect(adapter.providers.rpc).toBe(before.rpc);
    expect(adapter.providers.zkConfig).toBe(before.zkConfig);
    expect(adapter.providers.wallet).toBe(api);
  });

  test("uses official Midnight.js submission status before persisting private state", async () => {
    const api: Record<string, unknown> = {
      apiVersion: "4.0.1",
      networkId: "preprod",
      getConfiguration: () => ({ networkId: "preprod" }),
      getConnectionStatus: () => ({ status: "connected", networkId: "preprod" }),
      getUnshieldedAddress: () => "addr_test1_shroudly",
    };
    const calls: string[] = [];
    const connector = new MidnightDAppConnector({ lace: { apiVersion: "4.0.1", connect: async () => api } });
    const executor = createOfficialMidnightJsExecutor({
      providers: {
        publicDataProvider: {
          watchForTxData: async (id) => { calls.push(`watch:${id}`); return { txId: id, status: "SucceedEntirely" }; },
        },
        privateStateProvider: {
          set: async (id, state) => { calls.push(`private:${id}:${String(state)}`); },
        },
      },
      submitCallTxAsync: async (_providers, call) => { calls.push(`submit:${String((call as { circuitId?: unknown }).circuitId)}`); return { txId: transactionId, callTxData: { private: { nextPrivateState: { generation: 2 } } } }; },
      buildCall: async (input) => { calls.push(`build:${input.command}`); return { options: { circuitId: "contribute" }, privateStateId: "pool:lace" }; },
      finality: { wait: async (id) => { calls.push(`finality:${id}`); return { transactionId: id, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }; } },
    }, "deployment", contractIds);
    const adapter = new MidnightPreprodAdapter(connector, { deploymentId: "deployment", contractIds, execute: executor, stateReader: async () => state });
    await adapter.connect("lace");
    await adapter.refreshState();

    await expect(adapter.command("contribute", 5n)).resolves.toMatchObject({ transactionId, status: "finalized" });
    expect(calls).toEqual([`build:contribute`, "submit:contribute", `watch:${transactionId}`, `finality:${transactionId}`, "private:pool:lace:[object Object]"]);
  });

  test("rejects an official reverted receipt and does not persist its private state", async () => {
    const api: Record<string, unknown> = {
      apiVersion: "4.0.1",
      networkId: "preprod",
      getConfiguration: () => ({ networkId: "preprod" }),
      getConnectionStatus: () => ({ status: "connected", networkId: "preprod" }),
      getUnshieldedAddress: () => "addr_test1_shroudly",
    };
    let persisted = false;
    const connector = new MidnightDAppConnector({ lace: { apiVersion: "4.0.1", connect: async () => api } });
    const executor = createOfficialMidnightJsExecutor({
      providers: {
        publicDataProvider: { watchForTxData: async (id) => ({ txId: id, status: "FailFallible" }) },
        privateStateProvider: { set: async () => { persisted = true; } },
      },
      submitCallTxAsync: async () => ({ txId: transactionId, callTxData: { private: { nextPrivateState: {} } } }),
      buildCall: async () => ({ options: {}, privateStateId: "pool:lace" }),
      finality: { wait: async (id) => ({ transactionId: id, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }) },
    }, "deployment", contractIds);
    const adapter = new MidnightPreprodAdapter(connector, { deploymentId: "deployment", contractIds, execute: executor, stateReader: async () => state });
    await adapter.connect("lace");
    await adapter.refreshState();

    await expect(adapter.command("contribute", 5n)).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    expect(persisted).toBe(false);
  });

  test("keeps the production adapter unavailable until a verified state reader succeeds", async () => {
    const api: Record<string, unknown> = {
      apiVersion: "4.0.1",
      networkId: "preprod",
      getConfiguration: () => ({ networkId: "preprod" }),
      getConnectionStatus: () => ({ status: "connected", networkId: "preprod" }),
      getUnshieldedAddress: () => "addr_test1_shroudly",
    };
    const connector = new MidnightDAppConnector({ lace: { apiVersion: "4.0.1", connect: async () => api } });
    const adapter = new MidnightPreprodAdapter(connector, { deploymentId: "deployment", contractIds });

    expect(adapter.stateStatus()).toBe("unavailable");
    expect(adapter.draw().phase).toBe("closed");
    await adapter.connect("lace");
    expect(adapter.stateStatus()).toBe("unavailable");

    const withState = new MidnightPreprodAdapter(connector, { deploymentId: "deployment", contractIds, stateReader: async () => state });
    await withState.connect("lace");
    await withState.refreshState();
    expect(withState.stateStatus()).toBe("available");
    expect(withState.account()).toEqual(state.account);
    expect(withState.draw()).toEqual(state.draw);
  });

  test("retains the last verified state but marks it stale when refresh fails", async () => {
    let shouldFail = false;
    const api: Record<string, unknown> = {
      apiVersion: "4.0.1",
      networkId: "preprod",
      getConfiguration: () => ({ networkId: "preprod" }),
      getConnectionStatus: () => ({ status: "connected", networkId: "preprod" }),
      getUnshieldedAddress: () => "addr_test1_shroudly",
    };
    const connector = new MidnightDAppConnector({ lace: { apiVersion: "4.0.1", connect: async () => api } });
    const adapter = new MidnightPreprodAdapter(connector, { deploymentId: "deployment", contractIds, stateReader: async () => { if (shouldFail) throw new Error("indexer lag"); return state; } });
    await adapter.connect("lace");
    await adapter.refreshState();
    expect(adapter.stateStatus()).toBe("available");
    shouldFail = true;
    await expect(adapter.refreshState()).rejects.toMatchObject({ code: "INDEXER_LAG", retryable: true });
    expect(adapter.stateStatus()).toBe("stale");
    expect(adapter.account()).toEqual(state.account);
    expect(adapter.stateMessage()).toContain("indexer lag");
  });

  test("selects the official runtime when it is supplied to the adapter", async () => {
    const api: Record<string, unknown> = {
      apiVersion: "4.0.1",
      networkId: "preprod",
      getConfiguration: () => ({ networkId: "preprod" }),
      getConnectionStatus: () => ({ status: "connected", networkId: "preprod" }),
      getUnshieldedAddress: () => "addr_test1_shroudly",
    };
    const connector = new MidnightDAppConnector({ lace: { apiVersion: "4.0.1", connect: async () => api } });
    let submitted = false;
    const adapter = new MidnightPreprodAdapter(connector, {
      deploymentId: "deployment",
      contractIds,
      stateReader: async () => state,
      officialRuntime: {
        providers: { publicDataProvider: { watchForTxData: async (id) => ({ txId: id, status: "SucceedEntirely" }) } },
        submitCallTxAsync: async () => { submitted = true; return { txId: transactionId }; },
        buildCall: async () => ({ options: { circuitId: "contribute" } }),
        finality: { wait: async (id) => ({ transactionId: id, networkFinalized: true, indexerVisible: true, ledgerConfirmed: true }) },
      },
    });
    await adapter.connect("lace");
    await adapter.refreshState();
    await expect(adapter.command("contribute", 5n)).resolves.toMatchObject({ transactionId, status: "finalized" });
    expect(submitted).toBe(true);
  });
});
