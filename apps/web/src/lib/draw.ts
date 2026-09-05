export const DRAW_PHASES = ["Open", "Accruing", "Randomizing", "Selecting"] as const;
export const HISTORY_LABEL = "Confidential outcome";

export type DrawAction =
  | "closeDraw"
  | "processAccrualBatch"
  | "randomizeDraw"
  | "processSelectionBatch";

type DrawActionInput = {
  phase: number;
  now: number;
  scheduledCutoff: number;
};

export function nextDrawAction(input: DrawActionInput): DrawAction | null {
  if (input.phase === 0) return input.now >= input.scheduledCutoff ? "closeDraw" : null;
  if (input.phase === 1) return "processAccrualBatch";
  if (input.phase === 2) return "randomizeDraw";
  if (input.phase === 3) return "processSelectionBatch";
  return null;
}

export const drawActionLabel: Record<DrawAction, string> = {
  closeDraw: "Close saving epoch",
  processAccrualBatch: "Process chance batch",
  randomizeDraw: "Create private ticket",
  processSelectionBatch: "Process selection batch",
};

export function secondsUntil(timestamp: number, now = Date.now() / 1000): number {
  return Math.max(0, Math.ceil(timestamp - now));
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}
