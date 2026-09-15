# ADR 0009: Use a shielded test Principal asset

**Status:** Accepted

## Context

Preprod must exercise private Principal and Prize flows without implying that test NIGHT, a stablecoin, or a production yield asset is under custody.

## Decision

Preprod uses a custom shielded, six-decimal, valueless asset named `tMIX` with a maximum issuance of 10,000,000 units. A bounded faucet is its only issuance path. Participant Faucet Claims provide 1,000 `tMIX` at most once per unlinkable twenty-four-hour epoch nullifier under the global cap; this is not Sybil-proof. Automation receives a separate capped allocation. The Prize Reserve starts with 1,000,000 `tMIX` and releases no more than 100 `tMIX` per completed draw interval as Simulated Yield; public governance replenishment remains within maximum issuance. Preprod accepts between 1 and 1,000 `tMIX` of Principal per participant. Principal and Simulated Yield use the same asset denomination so every contribution, withdrawal, draw, claim, and rollover follows the intended private asset path. Mainnet bounds remain gated on the reviewed asset, strategy capacity, and canary design.

## Consequences

The interface and Evidence Bundle must label `tMIX` as resettable test value. Faucet issuance, supply limits, shielded transfers, and Prize funding require deterministic tests; the public bundle may show only issuance needed for its successful journey. No `tMIX` behavior is evidence that a Mainnet asset or yield integration is safe.
