# ADR 0027: Freeze the Shroudly Preprod safety constants

**Status:** Accepted
**Date:** 2026-09-15

## Context

The first native feasibility pass now has a four-component Compact reference
(`TmixAsset`, `RandomnessThreshold`, `YieldAdapter`, and `PrizePool`) and a
deterministic interface runner. A release must not let a deployment, operator,
or browser choose economic limits at runtime. The same values must be visible
in Compact inputs, the reference runner, the participant application, and the
sanitized build profile.

## Decision

The following values are immutable for Shroudly Preprod v1. Amounts are integer
micro-units (`1 tMIX = 1,000,000` micro-units); no floating-point value crosses
the participant seam.

| Rule | Frozen value |
| --- | --- |
| Test asset | `tMIX`, six decimals, valueless Preprod currency |
| Shared issuance cap | `10,000,000 tMIX` |
| Faucet | `1,000 tMIX` once per owner and 24-hour epoch |
| Automation allocation | `25,000 tMIX`, one time, only to the isolated evidence fixture |
| Initial Prize Reserve | `1,000,000 tMIX` |
| Simulated Yield | at most `100 tMIX` per completed 15-minute draw |
| Contribution | inclusive range `1–1,000 tMIX` |
| Prize replenishment | at most `1,000,000 tMIX` per one-hour timelocked action and never beyond the shared cap |
| Disclosure Cohort | five eligible commitments |
| Randomness | three registered contributors, two distinct reveals, canonical ordering, no fallback |
| Prize claim | one-hour expiry, then permissionless rollover |
| Full settlement pause | maximum 24 hours without a two-of-three governance renewal |
| Governance | two of three named Preprod authorities |
| Temporary deployer | automatic submission lock after a 24-hour removal deadline |
| DUST sponsor | eight-second timeout; 20/account/rolling 24 hours; 500/global UTC day; 125% of maximum observed qualification cost; seven-day hot-balance cap |

The four Compact contracts are the on-chain authority. The reference runner is
an executable property matrix, not a substitute for a deployed contract. The
participant facade reports success only after finality, indexer visibility, and
a fresh ledger query. Mainnet interfaces and timings are represented for later
review, but every transactional Mainnet entrypoint is disabled in this release.

## Consequences

Changing a safety constant requires a new ADR, a new source revision, a fresh
Compact compile/key validation, and new Preprod evidence. Build-time variables
may supply deployment IDs, contract IDs, and endpoints only; they cannot enable
Mainnet transactions or override the constants. A failed feasibility or
solvency property is a release blocker and must not be worked around by
weakening the specification.
