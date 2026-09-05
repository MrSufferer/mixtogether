import type { QueryClient } from "@tanstack/react-query";
import { zamaQueryKeys } from "@zama-fhe/sdk/query";

/** Remove only wallet-sensitive Zama query data, leaving public chain reads intact. */
export function clearPrivateQueryCache(queryClient: QueryClient) {
  queryClient.removeQueries({ queryKey: zamaQueryKeys.decryption.all });
  queryClient.removeQueries({ queryKey: zamaQueryKeys.hasPermit.all });
}
