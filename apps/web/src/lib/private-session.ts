/** Remove wallet-private snapshots without touching public draw data. */
export function clearPrivateQueryCache(store: { clear?: () => void } | Map<string, unknown>): void {
  if (store instanceof Map) {
    for (const key of store.keys()) if (key.startsWith("private:")) store.delete(key);
  } else store.clear?.();
}
