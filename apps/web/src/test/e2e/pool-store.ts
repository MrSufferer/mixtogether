import type { Address, Hex } from "viem";

export const MOCK_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
export const MOCK_TX_HASH =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as Hex;
export const MOCK_UNWRAP_ID =
  "0xaa11223344556677889900aabbccddeeff11223344556677889900aabbccddeeff" as Hex;

export interface PoolStoreState {
  account: Address;
  phase: number;
  drawId: bigint;
  epochStartedAt: number;
  cutoff: number;
  scheduledCutoff: number;
  accrualCursor: number;
  selectionCursor: number;
  saverCount: number;
  publicBalance: bigint;
  shielded: bigint;
  principal: bigint;
  winnings: bigint;
  approved: boolean;
  handles: {
    token: Hex;
    principal: Hex;
    winnings: Hex;
  };
  pendingUnwraps: Hex[];
}

const STORAGE_KEY = "__mixtogether_e2e_pool_store__";

function defaultState(): PoolStoreState {
  const now = Math.floor(Date.now() / 1000);
  return {
    account: MOCK_ACCOUNT,
    phase: 0,
    drawId: 1n,
    epochStartedAt: now - 60,
    cutoff: 0,
    scheduledCutoff: now + 300,
    accrualCursor: 0,
    selectionCursor: 0,
    saverCount: 0,
    publicBalance: 0n,
    shielded: 0n,
    principal: 0n,
    winnings: 0n,
    approved: false,
    handles: {
      token: "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex,
      principal: "0x2222222222222222222222222222222222222222222222222222222222222222" as Hex,
      winnings: "0x3333333333333333333333333333333333333333333333333333333333333333" as Hex,
    },
    pendingUnwraps: [],
  };
}

function loadState(): PoolStoreState {
  if (typeof window === "undefined") return defaultState();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return {
      ...parsed,
      drawId: BigInt(parsed.drawId),
      publicBalance: BigInt(parsed.publicBalance),
      shielded: BigInt(parsed.shielded),
      principal: BigInt(parsed.principal),
      winnings: BigInt(parsed.winnings),
    };
  } catch {
    return defaultState();
  }
}

function saveState(state: PoolStoreState): void {
  if (typeof window === "undefined") return;
  try {
    const serialized = JSON.stringify(state, (_, value) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    window.sessionStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    // Ignore storage errors in test
  }
}

export class PoolStore {
  state: PoolStoreState = loadState();
  mockTxHash = MOCK_TX_HASH;
  mockReceipt = {
    status: "success" as const,
    blockNumber: 100n,
    transactionHash: MOCK_TX_HASH,
  };
  save() {
    saveState(this.state);
  }

  getDrawState(): readonly [bigint, number, number, number, number, number, number, number] {
    return [
      this.state.drawId,
      this.state.phase,
      this.state.epochStartedAt,
      this.state.cutoff,
      this.state.scheduledCutoff,
      this.state.accrualCursor,
      this.state.selectionCursor,
      this.state.saverCount,
    ] as const;
  }

  mint(amount: bigint) {
    this.state.publicBalance += amount;
    this.save();
  }

  approve() {
    this.state.approved = true;
    this.save();
  }

  wrap(amount: bigint) {
    if (this.state.publicBalance >= amount) {
      this.state.publicBalance -= amount;
    }
    this.state.shielded += amount;
    this.save();
  }

  deposit(amount: bigint) {
    if (this.state.shielded >= amount) {
      this.state.shielded -= amount;
    }
    this.state.principal += amount;
    this.state.saverCount = 1;
    // Set scheduledCutoff in the past so Close saving epoch appears and Deposit disables
    this.state.scheduledCutoff = Math.floor(Date.now() / 1000) - 10;
    this.save();
  }

  closeSavingEpoch() {
    this.state.phase = 1;
    this.state.accrualCursor = 0;
    this.save();
  }

  processChanceBatch() {
    this.state.phase = 2;
    this.state.accrualCursor = 64;
    this.save();
  }

  createPrivateTicket() {
    this.state.phase = 3;
    // Positive mock prize
    this.state.winnings = 10_000_000n;
    this.save();
  }

  processSelectionBatch() {
    this.state.phase = 0;
    this.state.selectionCursor = 64;
    this.state.drawId += 1n;
    this.state.scheduledCutoff = Math.floor(Date.now() / 1000) + 300;
    this.save();
  }

  claimWinnings() {
    this.state.shielded += this.state.winnings;
    this.state.winnings = 0n;
    this.save();
  }

  withdrawAll() {
    this.state.shielded += this.state.principal;
    this.state.principal = 0n;
    this.save();
  }

  unwrap(amount: bigint): Hex {
    if (this.state.shielded >= amount) {
      this.state.shielded -= amount;
    }
    const id = MOCK_UNWRAP_ID;
    this.state.pendingUnwraps.push(id);
    this.save();
    return id;
  }

  finalizeUnwrap(id: Hex) {
    this.state.pendingUnwraps = this.state.pendingUnwraps.filter((x) => x !== id);
    this.save();
  }
}

// Singleton store instance per window/runtime
export const poolStore = new PoolStore();
