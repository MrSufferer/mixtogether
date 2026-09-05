import { LogOut, Wallet } from "lucide-react";
import { useAccount, useConnect, useDisconnect } from "wagmi";

export function WalletButton() {
  const account = useAccount();
  const connect = useConnect();
  const disconnect = useDisconnect();

  if (account.address) {
    return (
      <div className="wallet-control">
        <span>{shortAddress(account.address)}</span>
        <button onClick={() => disconnect.disconnect()} aria-label="Disconnect wallet" title="Disconnect wallet">
          <LogOut size={15} />
        </button>
      </div>
    );
  }

  return (
    <button
      className="connect-button"
      onClick={() => connect.connectors[0] && connect.connect({ connector: connect.connectors[0] })}
      disabled={connect.isPending || connect.connectors.length === 0}
    >
      <Wallet size={16} /> {connect.isPending ? "Connecting…" : "Connect wallet"}
    </button>
  );
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
