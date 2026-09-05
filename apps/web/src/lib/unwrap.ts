const KEY_PREFIX = "mixtogether:pending-unwraps";

export function pendingUnwrapStore(storage: Pick<Storage, "getItem" | "setItem">) {
  return {
    load(account: string): `0x${string}`[] {
      const raw = storage.getItem(key(account));
      if (!raw) return [];
      try {
        return JSON.parse(raw) as `0x${string}`[];
      } catch {
        return [];
      }
    },
    save(account: string, ids: `0x${string}`[]) {
      storage.setItem(key(account), JSON.stringify(unique(ids)));
    },
  };
}

export function mergePendingUnwraps(
  stored: `0x${string}`[],
  requested: `0x${string}`[],
  finalized: `0x${string}`[],
): `0x${string}`[] {
  const complete = new Set(finalized);
  return unique([...stored, ...requested]).filter((id) => !complete.has(id));
}

function unique(ids: `0x${string}`[]) {
  return [...new Set(ids)];
}

function key(account: string) {
  return `${KEY_PREFIX}:${account.toLowerCase()}`;
}
