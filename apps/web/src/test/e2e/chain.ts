import {
  decodeFunctionData,
  encodeFunctionResult,
  parseAbi,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { poolAbi, tokenAbi } from "../../lib/contracts";
import { poolStore } from "./pool-store";

const multicall3Abi = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)",
]);

async function handleEthCall(callObj?: { to?: string; data?: Hex }): Promise<Hex> {
  const data = callObj?.data;
  if (!data) return "0x";
  if (data.startsWith("0x82ad56cb")) {
    try {
      const decoded = decodeFunctionData({ abi: multicall3Abi, data });
      if (decoded.functionName === "aggregate3" && Array.isArray(decoded.args?.[0])) {
        const calls = decoded.args[0] as Array<{
          target: string;
          allowFailure: boolean;
          callData: Hex;
        }>;
        const results = await Promise.all(
          calls.map(async (c) => {
            const returnData = await handleEthCall({ to: c.target, data: c.callData });
            return [true, returnData] as const;
          }),
        );
        return encodeFunctionResult({
          abi: multicall3Abi,
          functionName: "aggregate3",
          result: results as any,
        });
      }
    } catch {
      // Fall through
    }
  }

  try {
    const decodedToken = decodeFunctionData({ abi: tokenAbi, data });
    if (decodedToken.functionName === "balanceOf") {
      return encodeFunctionResult({
        abi: tokenAbi,
        functionName: "balanceOf",
        result: poolStore.state.publicBalance,
      });
    }
    if (decodedToken.functionName === "confidentialBalanceOf") {
      return encodeFunctionResult({
        abi: tokenAbi,
        functionName: "confidentialBalanceOf",
        result: poolStore.state.handles.token,
      });
    }
  } catch {
    // Fall through to poolAbi
  }

  try {
    const decodedPool = decodeFunctionData({ abi: poolAbi, data });
    if (decodedPool.functionName === "drawState") {
      return encodeFunctionResult({
        abi: poolAbi,
        functionName: "drawState",
        result: poolStore.getDrawState(),
      });
    }
    if (decodedPool.functionName === "principalOf") {
      return encodeFunctionResult({
        abi: poolAbi,
        functionName: "principalOf",
        result: poolStore.state.handles.principal,
      });
    }
    if (decodedPool.functionName === "winningsOf") {
      return encodeFunctionResult({
        abi: poolAbi,
        functionName: "winningsOf",
        result: poolStore.state.handles.winnings,
      });
    }
  } catch {
    // Unknown read
  }

  return "0x";
}

export const e2eEthereumProvider: EIP1193Provider = {
  request: (async ({ method, params }: { method: string; params?: unknown }) => {
    const paramList = (Array.isArray(params) ? params : []) as unknown[];
    switch (method) {
      case "eth_chainId":
        return "0xaa36a7"; // 11155111 in hex

      case "net_version":
        return "11155111";

      case "eth_accounts":
        return [poolStore.state.account];

      case "eth_requestAccounts":
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("__mixtogether_mock_connected__", "true");
        }
        return [poolStore.state.account];
      case "eth_blockNumber":
        return "0x100";

      case "eth_getBlockByNumber":
        return {
          number: "0x100",
          hash: "0x0000000000000000000000000000000000000000000000000000000000000100",
          timestamp: "0x68000000",
          transactions: [],
        };
      case "eth_estimateGas":
        return "0x5208";

      case "eth_gasPrice":
        return "0x3b9aca00";

      case "eth_maxPriorityFeePerGas":
        return "0x1";

      case "eth_feeHistory":
        return {
          oldestBlock: "0x0",
          baseFeePerGas: ["0x3b9aca00", "0x3b9aca00"],
          gasUsedRatio: [0.5],
        };

      case "eth_getTransactionCount":
        return "0x1";

      case "wallet_switchEthereumChain":
        return null;

      case "eth_getTransactionByHash": {
        const txHash = (paramList[0] as string) || poolStore.mockTxHash;
        return {
          hash: txHash,
          blockNumber: "0x100",
          blockHash:
            "0x0000000000000000000000000000000000000000000000000000000000000100",
          from: poolStore.state.account,
          to: "0x1111111111111111111111111111111111111111",
          nonce: "0x1",
          value: "0x0",
          gas: "0x5208",
          gasPrice: "0x3b9aca00",
          input: "0x",
        };
      }

      case "eth_getTransactionReceipt": {
        const txHash = (paramList[0] as string) || poolStore.mockTxHash;
        return {
          transactionHash: txHash,
          status: "0x1",
          blockNumber: "0x100",
          blockHash:
            "0x0000000000000000000000000000000000000000000000000000000000000100",
          from: poolStore.state.account,
          to: "0x1111111111111111111111111111111111111111",
          cumulativeGasUsed: "0x5208",
          gasUsed: "0x5208",
          effectiveGasPrice: "0x3b9aca00",
          logs: [],
        };
      }

      case "eth_getLogs":
        // Returning empty array triggers the app's localStorage unwrap recovery fallback
        return [];

      case "eth_call":
        return handleEthCall(paramList[0] as { to?: string; data?: Hex } | undefined);

      case "eth_sendTransaction": {
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem("__mixtogether_mock_connected__", "true");
        }
        const txObj = paramList[0] as { to?: string; data?: Hex } | undefined;
        const data = txObj?.data;
        if (!data) return poolStore.mockTxHash;

        try {
          const decodedToken = decodeFunctionData({ abi: tokenAbi, data });
          if (decodedToken.functionName === "mint" && Array.isArray(decodedToken.args)) {
            const amount = decodedToken.args[1] as bigint;
            poolStore.mint(amount);
            return poolStore.mockTxHash;
          }
        } catch {
          // Fall through to poolAbi
        }

        try {
          const decodedPool = decodeFunctionData({ abi: poolAbi, data });
          switch (decodedPool.functionName) {
            case "closeDraw":
            case "closeSavingEpoch":
              poolStore.closeSavingEpoch();
              break;
            case "processAccrualBatch":
            case "processChanceBatch":
              poolStore.processChanceBatch();
              break;
            case "randomizeDraw":
            case "createPrivateTicket":
              poolStore.createPrivateTicket();
              break;
            case "processSelectionBatch":
              poolStore.processSelectionBatch();
              break;
            case "claimWinnings":
              poolStore.claimWinnings();
              break;
            case "withdrawAll":
              poolStore.withdrawAll();
              break;
          }
        } catch {
          // Unknown write
        }
        return poolStore.mockTxHash;
      }

      default:
        return null;
    }
  }) as unknown as EIP1193Provider["request"],
  on: (() => {}) as unknown as EIP1193Provider["on"],
  removeListener: (() => {}) as unknown as EIP1193Provider["removeListener"],
};

// Intercept window.fetch to prevent any RPC call escaping to external networks
if (typeof window !== "undefined") {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body);
        if (Array.isArray(body)) {
          const results = await Promise.all(
            body.map(async (req) => {
              const result = await e2eEthereumProvider.request({
                method: req.method,
                params: req.params,
              });
              return { jsonrpc: "2.0", id: req.id, result };
            }),
          );
          return new Response(JSON.stringify(results), {
            headers: { "Content-Type": "application/json" },
          });
        }
        if (body && typeof body.method === "string") {
          const result = await e2eEthereumProvider.request({
            method: body.method,
            params: body.params,
          });
          return new Response(
            JSON.stringify({ jsonrpc: "2.0", id: body.id, result }),
            {
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      } catch {
        // Fall back to original fetch
      }
    }
    return originalFetch(input, init);
  };
}
