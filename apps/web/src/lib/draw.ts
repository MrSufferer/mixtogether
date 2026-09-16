export const DRAW_PHASES = ["Open", "Revealing", "Finalized", "Rolled over"] as const;
export const HISTORY_LABEL = "Private draw outcome";
export type DrawAction = "checkpointYield" | "finalizeDraw" | "claimPrize";

export function nextDrawAction(input: { phase: string; now: bigint; revealClosesAt: bigint; hasPrize: boolean }): DrawAction | null {
  // The pool transitions from open to closed/revealing before the reveal
  // deadline.  Keep finalization permissionless once that deadline has
  // elapsed, regardless of which post-close phase a snapshot reports.
  if ((input.phase === "closed" || input.phase === "revealing") && input.now >= input.revealClosesAt) return "finalizeDraw";
  if (input.phase === "finalized" && input.hasPrize) return "claimPrize";
  return null;
}

export const drawActionLabel: Record<DrawAction, string> = { checkpointYield: "Checkpoint simulated yield", finalizeDraw: "Finalize draw", claimPrize: "Claim private prize" };
export function secondsUntil(timestamp: bigint, now = BigInt(Math.floor(Date.now() / 1000))): bigint { return timestamp > now ? timestamp - now : 0n; }
export function formatDuration(seconds: bigint | number): string { const value = typeof seconds === "number" ? Math.max(0, Math.ceil(seconds)) : Number(seconds); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`; }
