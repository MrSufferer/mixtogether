import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useApproveUnderlying,
  useConfidentialTransferAndCall,
  useFinalizeUnwrap,
  useGrantPermit,
  useUnwrap,
  useWrap,
} from "@zama-fhe/react-sdk";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  CircleDollarSign,
  Clock3,
  Droplets,
  Eye,
  EyeOff,
  Gift,
  Info,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  Trophy,
  WalletCards,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  encodeAbiParameters,
  type Address,
  type Hex,
  zeroHash,
} from "viem";
import {
  useAccount,
  usePublicClient,
  useReadContracts,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { PrivateBalances } from "./components/PrivateBalances";
import { WalletButton } from "./components/WalletButton";
import { formatPublicCompact, parseTokenAmount } from "./lib/amount";
import {
  CHAIN_ID,
  CUSDC_ADDRESS,
  POOL_ADDRESS,
  POOL_CONFIGURED,
  USDC_ADDRESS,
} from "./lib/config";
import { poolAbi, tokenAbi, wrapperEventsAbi } from "./lib/contracts";
import {
  DRAW_PHASES,
  HISTORY_LABEL,
  drawActionLabel,
  formatDuration,
  nextDrawAction,
  secondsUntil,
  type DrawAction,
} from "./lib/draw";
import { mergePendingUnwraps, pendingUnwrapStore } from "./lib/unwrap";
import { clearPrivateQueryCache } from "./lib/private-session";
import { friendlyWalletError, transactionHashOf } from "./lib/transaction";

type DrawState = readonly [bigint, number, number, number, number, number, number, number];
type Handles = { token?: Hex; principal?: Hex; winnings?: Hex };
type ReceiptState = {
  label: string;
  status: "pending" | "confirmed" | "error";
  hash?: Hex;
};

const DEPOSIT_DATA = encodeAbiParameters([{ type: "uint8" }], [1]);
const FAUCET_AMOUNT = 100_000_000n;

export default function App() {
  const reduceMotion = useReducedMotion();
  const queryClient = useQueryClient();
  const account = useAccount();
  const publicClient = usePublicClient();
  const { switchChainAsync, isPending: switching } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const grantPermit = useGrantPermit();
  const approve = useApproveUnderlying(CUSDC_ADDRESS);
  const wrap = useWrap(CUSDC_ADDRESS);
  const deposit = useConfidentialTransferAndCall({ address: CUSDC_ADDRESS });
  const unwrap = useUnwrap(CUSDC_ADDRESS);
  const finalizeUnwrap = useFinalizeUnwrap(CUSDC_ADDRESS);

  const [amount, setAmount] = useState("10");
  const [revealed, setRevealed] = useState(false);
  const [now, setNow] = useState(() => Date.now() / 1000);
  const [notice, setNotice] = useState("Ready when you are.");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confetti, setConfetti] = useState(false);
  const [pendingUnwraps, setPendingUnwraps] = useState<Hex[]>([]);
  const [receiptState, setReceiptState] = useState<ReceiptState | null>(null);
  const [retryOperation, setRetryOperation] = useState<{
    label: string;
    operation: () => Promise<unknown>;
  } | null>(null);

  const correctChain = account.chainId === CHAIN_ID;
  const canTransact = Boolean(account.address && correctChain && POOL_CONFIGURED);

  const reads = useReadContracts({
    contracts: [
      { address: POOL_ADDRESS, abi: poolAbi, functionName: "drawState" },
      { address: USDC_ADDRESS, abi: tokenAbi, functionName: "balanceOf", args: [account.address ?? POOL_ADDRESS] },
      { address: CUSDC_ADDRESS, abi: tokenAbi, functionName: "confidentialBalanceOf", args: [account.address ?? POOL_ADDRESS] },
      { address: POOL_ADDRESS, abi: poolAbi, functionName: "principalOf", args: [account.address ?? POOL_ADDRESS] },
      { address: POOL_ADDRESS, abi: poolAbi, functionName: "winningsOf", args: [account.address ?? POOL_ADDRESS] },
    ],
    query: {
      enabled: Boolean(account.address && correctChain && POOL_CONFIGURED),
      refetchInterval: 12_000,
    },
  });

  const draw = reads.data?.[0]?.result as DrawState | undefined;
  const publicBalance = reads.data?.[1]?.result as bigint | undefined;
  const handles: Handles = useMemo(() => ({
    token: reads.data?.[2]?.result as Hex | undefined,
    principal: reads.data?.[3]?.result as Hex | undefined,
    winnings: reads.data?.[4]?.result as Hex | undefined,
  }), [reads.data]);

  const drawId = Number(draw?.[0] ?? 1n);
  const phase = Number(draw?.[1] ?? 0);
  const scheduledCutoff = Number(draw?.[4] ?? 0);
  const saverCount = Number(draw?.[7] ?? 0);
  const remaining = scheduledCutoff ? secondsUntil(scheduledCutoff, now) : 300;
  const action = draw ? nextDrawAction({ phase, now, scheduledCutoff }) : null;
  const completedDraws = Array.from(
    { length: Math.min(3, Math.max(0, drawId - 1)) },
    (_, index) => drawId - index - 1,
  );

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now() / 1000), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setRevealed(false);
    setConfetti(false);
    setError(null);
    setReceiptState(null);
    setRetryOperation(null);
    clearPrivateQueryCache(queryClient);
  }, [account.address, account.chainId, queryClient]);

  useEffect(() => {
    if (!account.address || !publicClient) {
      setPendingUnwraps([]);
      return;
    }
    const walletAddress = account.address;
    let cancelled = false;
    void (async () => {
      const latest = await publicClient.getBlockNumber();
      const fromBlock = latest > 100_000n ? latest - 100_000n : 0n;
      const logs = await publicClient.getLogs({
        address: CUSDC_ADDRESS,
        events: wrapperEventsAbi,
        fromBlock,
        toBlock: "latest",
      });
      const requested: Hex[] = [];
      const finalized: Hex[] = [];
      for (const log of logs) {
        const id = log.args.unwrapRequestId as Hex | undefined;
        if (!id) continue;
        if (log.args.receiver?.toLowerCase() !== walletAddress.toLowerCase()) continue;
        if (log.eventName === "UnwrapRequested") requested.push(id);
        if (log.eventName === "UnwrapFinalized") finalized.push(id);
      }
      const store = pendingUnwrapStore(window.localStorage);
      const merged = mergePendingUnwraps(store.load(walletAddress), requested, finalized);
      store.save(walletAddress, merged);
      if (!cancelled) setPendingUnwraps(merged);
    })().catch(() => {
      const saved = pendingUnwrapStore(window.localStorage).load(walletAddress);
      if (!cancelled) setPendingUnwraps(saved);
    });
    return () => { cancelled = true; };
  }, [account.address, publicClient]);

  const run = useCallback(async (label: string, operation: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    setNotice(`${label}…`);
    setReceiptState({ label, status: "pending" });
    setRetryOperation(null);
    try {
      const result = await operation();
      setReceiptState({
        label,
        status: "confirmed",
        hash: transactionHashOf(result),
      });
      setNotice(`${label} confirmed.`);
      await reads.refetch();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The wallet operation failed.";
      setError(friendlyWalletError(message));
      setReceiptState({ label, status: "error" });
      setRetryOperation({ label, operation });
      setNotice("Nothing changed.");
    } finally {
      setBusy(null);
    }
  }, [reads]);

  async function parsedAmount() {
    return parseTokenAmount(amount);
  }

  function faucet() {
    if (!account.address) return;
    void run("Minting 100 mock USDC", async () => {
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: tokenAbi,
        functionName: "mint",
        args: [account.address!, FAUCET_AMOUNT],
        chainId: CHAIN_ID,
      });
      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      return receipt ?? hash;
    });
  }

  function approveExact() {
    void run("Approving the exact public amount", async () => {
      return approve.mutateAsync({ amount: await parsedAmount() });
    });
  }

  function shield() {
    void run("Shielding into cUSDC", async () => {
      return wrap.mutateAsync({ amount: await parsedAmount() });
    });
  }

  function savePrivately() {
    void run("Adding private savings", async () => {
      const result = await deposit.mutateAsync({
        to: POOL_ADDRESS,
        amount: await parsedAmount(),
        data: DEPOSIT_DATA,
      });
      setRevealed(false);
      return result;
    });
  }

  function poolWrite(functionName: DrawAction | "withdrawAll" | "claimWinnings") {
    void run(drawActionLabel[functionName as DrawAction] ?? humanize(functionName), async () => {
      const hash = await writeContractAsync({
        address: POOL_ADDRESS,
        abi: poolAbi,
        functionName,
        chainId: CHAIN_ID,
      });
      const receipt = await publicClient?.waitForTransactionReceipt({ hash });
      setRevealed(false);
      return receipt ?? hash;
    });
  }

  function reveal() {
    void run("Authorizing private reveal", async () => {
      const result = await grantPermit.mutateAsync([CUSDC_ADDRESS, POOL_ADDRESS]);
      setRevealed(true);
      return result;
    });
  }

  function requestUnwrap() {
    if (!account.address) return;
    void run("Requesting public cash-out", async () => {
      const result = await unwrap.mutateAsync({ amount: await parsedAmount() });
      const updated = mergePendingUnwraps(pendingUnwraps, [result.unwrapRequestId], []);
      pendingUnwrapStore(window.localStorage).save(account.address!, updated);
      setPendingUnwraps(updated);
      setRevealed(false);
      return result;
    });
  }

  function finalize(id: Hex) {
    if (!account.address) return;
    void run("Finalizing public cash-out", async () => {
      const result = await finalizeUnwrap.mutateAsync({ unwrapRequestId: id });
      const updated = pendingUnwraps.filter((value) => value !== id);
      pendingUnwrapStore(window.localStorage).save(account.address!, updated);
      setPendingUnwraps(updated);
      return result;
    });
  }

  const celebrate = useCallback(() => {
    setConfetti(true);
    window.setTimeout(() => setConfetti(false), 2_800);
  }, []);

  return (
    <main className="app-shell">
      <TicketMotes reduced={Boolean(reduceMotion)} />
      <header className="site-header">
        <a className="wordmark" href="#top" aria-label="MixTogether home">
          <span className="mark"><Droplets size={17} /></span>
          MixTogether
        </a>
        <div className="header-actions">
          <span className="network-pill"><i /> Sepolia</span>
          <WalletButton />
        </div>
      </header>

      <section className="hero" id="top">
        <motion.div
          className="hero-copy"
          initial={reduceMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="eyebrow"><ShieldCheck size={16} /> Confidential prize savings</p>
          <h1>Private savings.<br /><em>Provable chances.</em></h1>
          <p className="lede">Save together. Win in secret. Your principal stays withdrawable while encrypted time-weighted chances choose one saver each draw.</p>
          <div className="trust-row">
            <span><LockKeyhole size={15} /> FHE encrypted</span>
            <span><ShieldCheck size={15} /> No-loss principal</span>
            <span><RefreshCw size={15} /> Permissionless draws</span>
          </div>
        </motion.div>
        <PrizeOrb drawId={drawId} phase={phase} reduced={Boolean(reduceMotion)} />
      </section>

      {!POOL_CONFIGURED && (
        <div className="deployment-banner" role="status">
          <Info size={17} />
          <span>Contract preview mode. Set <code>VITE_POOL_ADDRESS</code> after Sepolia deployment to enable transactions.</span>
        </div>
      )}
      {account.isConnected && !correctChain && (
        <div className="wrong-network" role="alert">
          MixTogether only supports Sepolia.
          <button onClick={() => void switchChainAsync({ chainId: CHAIN_ID })} disabled={switching}>Switch network</button>
        </div>
      )}

      <section className="dashboard" aria-label="Savings dashboard">
        <motion.article className="panel savings-panel" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
          <div className="panel-heading">
            <div><p className="kicker">Your position</p><h2>Private balance room</h2></div>
            <LockKeyhole className="panel-icon" aria-hidden />
          </div>

          {!account.isConnected ? (
            <div className="empty-state"><WalletCards /><h3>Connect to enter the pool</h3><p>Balances stay hidden until you explicitly sign a private reveal.</p></div>
          ) : revealed ? (
            <>
              <PrivateBalances handles={handles} tokenAddress={CUSDC_ADDRESS} poolAddress={POOL_ADDRESS} onPositivePrize={celebrate} />
              <button className="text-button" onClick={() => setRevealed(false)}><LockKeyhole size={15} /> Hide private balances</button>
            </>
          ) : (
            <button className="reveal-card" onClick={reveal} disabled={!canTransact || Boolean(busy)}>
              <span className="reveal-icon"><Eye /></span>
              <span><strong>Reveal my private balances</strong><small>One EIP-712 signature decrypts wallet cUSDC, principal, and winnings together.</small></span>
              <ArrowRight />
            </button>
          )}

          <div className="amount-control">
            <label htmlFor="amount">Amount</label>
            <div className="amount-input"><input id="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-describedby="amount-help" /><span>USDC</span></div>
            <p id="amount-help">Six decimals maximum. Shield and unshield amounts are public.</p>
          </div>

          <div className="journey" aria-label="Deposit steps">
            <JourneyStep number="1" title="Faucet" detail={publicBalance === undefined ? "Get mock USDC" : `${formatPublicCompact(publicBalance)} public USDC`} action="Mint 100" onClick={faucet} disabled={!account.isConnected || !correctChain || Boolean(busy)} icon={<CircleDollarSign />} />
            <JourneyStep number="2" title="Approve" detail="Exact amount only" action="Approve" onClick={approveExact} disabled={!canTransact || Boolean(busy)} icon={<Check />} />
            <JourneyStep number="3" title="Shield" detail="Public → private" action="Shield" onClick={shield} disabled={!canTransact || Boolean(busy)} icon={<ShieldCheck />} />
            <JourneyStep number="4" title="Save" detail="Private transfer" action="Deposit" onClick={savePrivately} disabled={!canTransact || Boolean(busy) || phase !== 0 || remaining === 0} icon={<ArrowDownToLine />} primary />
          </div>

          <div className="secondary-actions">
            <button onClick={() => poolWrite("withdrawAll")} disabled={!canTransact || Boolean(busy)}>Withdraw all principal</button>
            <button onClick={() => poolWrite("claimWinnings")} disabled={!canTransact || Boolean(busy)}>Claim private winnings</button>
            <button onClick={requestUnwrap} disabled={!canTransact || Boolean(busy)}>Request public cash-out</button>
          </div>

          {pendingUnwraps.length > 0 && (
            <div className="pending-list">
              <p><Clock3 size={15} /> Pending public cash-out</p>
              {pendingUnwraps.map((id) => <button key={id} onClick={() => finalize(id)} disabled={Boolean(busy)}>Finalize {shortId(id)}</button>)}
            </div>
          )}
        </motion.article>

        <motion.aside className="side-column" initial={reduceMotion ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <article className="panel draw-panel">
            <div className="panel-heading"><div><p className="kicker">Draw #{drawId}</p><h2>{DRAW_PHASES[phase] ?? "Loading"}</h2></div><TicketCheck className="panel-icon" /></div>
            <div className="phase-track" aria-label={`Draw phase: ${DRAW_PHASES[phase] ?? "loading"}`}>
              {DRAW_PHASES.map((name, index) => <div key={name} className={index <= phase ? "phase active" : "phase"}><span>{index < phase ? <Check /> : index + 1}</span><small>{name}</small></div>)}
            </div>
            <div className="timer-row"><div><span>{phase === 0 ? "Saving closes in" : "Draw processing"}</span><strong>{phase === 0 ? formatDuration(remaining) : `${Math.max(Number(draw?.[5] ?? 0), Number(draw?.[6] ?? 0))}/64 slots`}</strong></div><Clock3 /></div>
            {action ? (
              <button className="primary-button full" onClick={() => poolWrite(action)} disabled={!canTransact || Boolean(busy)}><RefreshCw size={17} /> {drawActionLabel[action]}</button>
            ) : (
              <p className="draw-hint">Anyone can advance the draw when this phase is ready.</p>
            )}
          </article>

          <article className="panel pool-panel">
            <div className="pool-visual" style={{ "--pool-fill": `${Math.max(8, saverCount / 64 * 100)}%` } as React.CSSProperties}><span className="wave" /><Gift /></div>
            <div className="pool-copy"><p className="kicker">Shared pool</p><h2>{saverCount} / 64 savers</h2><p>Exact pool size, weights, odds, ticket, reserve, and selected interval stay encrypted.</p></div>
          </article>

          <article className="privacy-card">
            <Trophy />
            <div><strong>Nominal prize: up to 10 cUSDC.</strong><p>Actual award depends on the private reserve and may be lower, including zero. Saver principal never funds prizes.</p></div>
          </article>

          <article className="panel history-panel" aria-label="Recent draw history">
            <div className="panel-heading"><div><p className="kicker">Recent draws</p><h2>Private results</h2></div><EyeOff className="panel-icon" /></div>
            {completedDraws.length > 0 ? (
              <ol>{completedDraws.map((id) => <li key={id}><span>Draw #{id}</span><strong>{HISTORY_LABEL}</strong></li>)}</ol>
            ) : (
              <p className="history-empty">Completed draws will appear here without exposing private outcomes.</p>
            )}
          </article>
        </motion.aside>
      </section>

      <div className={error ? "status-bar error" : "status-bar"} role={error ? "alert" : "status"}>
        <span>{busy ? <span className="spinner" /> : error ? "!" : <Sparkles size={15} />}</span>
        <div className="status-copy">
          <strong>{error ?? notice}</strong>
          {receiptState?.hash && (
            <a href={`https://sepolia.etherscan.io/tx/${receiptState.hash}`} target="_blank" rel="noreferrer">
              View confirmed receipt <ArrowRight size={13} />
            </a>
          )}
        </div>
        {receiptState?.status === "error" && retryOperation && (
          <button onClick={() => void run(retryOperation.label, retryOperation.operation)}>Retry</button>
        )}
      </div>

      <section className="disclosure">
        <LockKeyhole />
        <div><h2>Private amounts, public participation.</h2><p>Wallet addresses, registry membership, transaction timing, shield/unshield amounts, and claim or withdrawal calls remain public. A zero-value encrypted claim is valid, so claiming does not prove a win. MixTogether does not provide wallet anonymity.</p></div>
      </section>

      <footer><span>MixTogether</span><p>Experimental Sepolia software. Not audited. Mock assets have no monetary value.</p><a href="https://docs.zama.org/protocol" target="_blank" rel="noreferrer">Powered by Zama FHE <ArrowRight size={14} /></a></footer>

      <AnimatePresence>{confetti && <Confetti reduced={Boolean(reduceMotion)} />}</AnimatePresence>
    </main>
  );
}

function JourneyStep({ number, title, detail, action, onClick, disabled, icon, primary = false }: { number: string; title: string; detail: string; action: string; onClick: () => void; disabled: boolean; icon: React.ReactNode; primary?: boolean }) {
  return <div className="journey-step"><span className="step-number">{number}</span><span className="step-icon">{icon}</span><span className="step-copy"><strong>{title}</strong><small>{detail}</small></span><button className={primary ? "primary-button" : "soft-button"} onClick={onClick} disabled={disabled}>{action}</button></div>;
}

function PrizeOrb({ drawId, phase, reduced }: { drawId: number; phase: number; reduced: boolean }) {
  return <motion.div className="orb-stage" initial={reduced ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.14, duration: 0.7 }}><div className="orb-halo" /><div className="prize-orb"><div className="orb-glint" /><Sparkles /><span>Nominal prize</span><strong>10</strong><small>cUSDC</small></div><p><i /> Draw #{drawId} · {DRAW_PHASES[phase] ?? "Loading"}</p></motion.div>;
}

function TicketMotes({ reduced }: { reduced: boolean }) {
  if (reduced) return null;
  return <div className="motes" aria-hidden>{Array.from({ length: 9 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}</div>;
}

function Confetti({ reduced }: { reduced: boolean }) {
  return <motion.div className="confetti" aria-hidden initial={{ opacity: 1 }} exit={{ opacity: 0 }}>{Array.from({ length: reduced ? 0 : 20 }, (_, index) => <i key={index} style={{ "--i": index } as React.CSSProperties} />)}</motion.div>;
}

function humanize(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function shortId(value: Hex) {
  return value === zeroHash ? "unknown" : `${value.slice(0, 8)}…${value.slice(-4)}`;
}
