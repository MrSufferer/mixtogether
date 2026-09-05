import { useEffect } from "react";
import { EyeOff, PartyPopper } from "lucide-react";
import { useDecryptValues } from "@zama-fhe/react-sdk";
import type { Address, Hex } from "viem";
import { formatTokenAmount } from "../lib/amount";

type Props = {
  handles: { token?: Hex; principal?: Hex; winnings?: Hex };
  tokenAddress: Address;
  poolAddress: Address;
  onPositivePrize: () => void;
};

export function PrivateBalances({ handles, tokenAddress, poolAddress, onPositivePrize }: Props) {
  const inputs = [
    handles.token && { encryptedValue: handles.token, contractAddress: tokenAddress },
    handles.principal && { encryptedValue: handles.principal, contractAddress: poolAddress },
    handles.winnings && { encryptedValue: handles.winnings, contractAddress: poolAddress },
  ].filter(Boolean) as Array<{ encryptedValue: Hex; contractAddress: Address }>;

  const decrypted = useDecryptValues(inputs, { enabled: inputs.length === 3, staleTime: 0 });
  const token = handles.token ? decrypted.data?.[handles.token] : undefined;
  const principal = handles.principal ? decrypted.data?.[handles.principal] : undefined;
  const winnings = handles.winnings ? decrypted.data?.[handles.winnings] : undefined;

  useEffect(() => {
    if (typeof winnings === "bigint" && winnings > 0n) onPositivePrize();
  }, [onPositivePrize, winnings]);

  if (decrypted.isPending || inputs.length < 3) {
    return <div className="private-loading" role="status"><span className="spinner" /> Decrypting three private values…</div>;
  }

  if (decrypted.error) {
    return <p className="inline-error" role="alert">Could not decrypt. Your permit may have expired; hide and reveal again.</p>;
  }

  return (
    <div className="balance-grid" aria-live="polite">
      <Balance label="Private wallet" value={token} suffix="cUSDC" />
      <Balance label="Saving principal" value={principal} suffix="cUSDC" />
      <Balance label="Unclaimed prize" value={winnings} suffix="cUSDC" prize />
      <p className="privacy-note"><EyeOff size={14} /> Values exist only in this browser view.</p>
    </div>
  );
}

function Balance({ label, value, suffix, prize = false }: { label: string; value: unknown; suffix: string; prize?: boolean }) {
  const amount = typeof value === "bigint" ? formatTokenAmount(value) : "—";
  return (
    <div className={prize ? "balance-item prize" : "balance-item"}>
      <span>{label}</span>
      <strong>{prize && <PartyPopper size={18} aria-hidden />} {amount} <small>{suffix}</small></strong>
    </div>
  );
}
