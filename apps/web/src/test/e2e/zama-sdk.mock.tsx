import React from "react";
import type { Address, Hex } from "viem";
import { poolStore } from "./pool-store";

export function ZamaProvider({
  children,
}: {
  children: React.ReactNode;
  config?: unknown;
}) {
  return <>{children}</>;
}

export function useGrantPermit() {
  return {
    mutateAsync: async () => ({ permit: "mock-permit" }),
    isPending: false,
  };
}

export function useApproveUnderlying(_tokenAddress?: Address) {
  return {
    mutateAsync: async ({ amount: _amount }: { amount: bigint }) => {
      poolStore.approve();
      return {
        txHash: poolStore.mockTxHash,
        receipt: poolStore.mockReceipt,
      };
    },
    isPending: false,
  };
}

export function useWrap(_tokenAddress?: Address) {
  return {
    mutateAsync: async ({ amount }: { amount: bigint }) => {
      poolStore.wrap(amount);
      return {
        txHash: poolStore.mockTxHash,
        receipt: poolStore.mockReceipt,
      };
    },
    isPending: false,
  };
}

export function useConfidentialTransferAndCall(_options?: { address: Address }) {
  return {
    mutateAsync: async ({
      amount,
    }: {
      to: Address;
      amount: bigint;
      data: Hex;
    }) => {
      poolStore.deposit(amount);
      return {
        txHash: poolStore.mockTxHash,
        receipt: poolStore.mockReceipt,
      };
    },
    isPending: false,
  };
}

export function useUnwrap(_tokenAddress?: Address) {
  return {
    mutateAsync: async ({ amount }: { amount: bigint }) => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("__mixtogether_mock_connected__", "true");
      }
      const id = poolStore.unwrap(amount);
      return {
        unwrapRequestId: id,
        txHash: poolStore.mockTxHash,
        receipt: poolStore.mockReceipt,
      };
    },
    isPending: false,
  };
}

export function useFinalizeUnwrap(_tokenAddress?: Address) {
  return {
    mutateAsync: async ({ unwrapRequestId }: { unwrapRequestId: Hex }) => {
      poolStore.finalizeUnwrap(unwrapRequestId);
      return {
        txHash: poolStore.mockTxHash,
        receipt: poolStore.mockReceipt,
      };
    },
    isPending: false,
  };
}

export function useDecryptValues(
  _inputs?: Array<{ encryptedValue: Hex; contractAddress: Address }>,
  _options?: { enabled?: boolean; staleTime?: number },
) {
  return {
    data: {
      [poolStore.state.handles.token]: poolStore.state.shielded,
      [poolStore.state.handles.principal]: poolStore.state.principal,
      [poolStore.state.handles.winnings]: poolStore.state.winnings,
    },
    isPending: false,
    error: null,
  };
}
