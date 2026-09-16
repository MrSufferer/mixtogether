import { EyeOff, Trophy } from "lucide-react";
import { formatTokenAmount } from "../lib/amount";

export function PrivateBalances({ balance, principal, prize }: { balance: bigint; principal: bigint; prize: bigint }) {
  return <div className="balance-grid" aria-live="polite"><Balance label="Private wallet" value={balance} /><Balance label="Time-Weighted Principal" value={principal} /><Balance label="Unclaimed prize" value={prize} prize /><p className="privacy-note"><EyeOff size={14} /> Values are decrypted only in this browser view.</p></div>;
}

function Balance({ label, value, prize = false }: { label: string; value: bigint; prize?: boolean }) {
  return <div className={prize ? "balance-item prize" : "balance-item"}><span>{label}</span><strong>{prize && <Trophy size={17} />} {formatTokenAmount(value)} <small>tMIX</small></strong></div>;
}
