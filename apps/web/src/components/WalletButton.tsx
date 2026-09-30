import { LogOut, Wallet } from "lucide-react";

export function WalletButton({ address, pending = false, onConnect, onDisconnect }: { address?: string; pending?: boolean; onConnect: () => void; onDisconnect: () => void }) {
  if (address) return <div className="wallet-control"><span>{shortAddress(address)}</span><button onClick={onDisconnect} aria-label="Disconnect wallet" title="Disconnect wallet"><LogOut size={15} /></button></div>;
  return <button className="connect-button" onClick={onConnect} disabled={pending}><Wallet size={16} /> {pending ? "Connecting…" : "Connect Lace"}</button>;
}

function shortAddress(address: string): string { return address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address; }
