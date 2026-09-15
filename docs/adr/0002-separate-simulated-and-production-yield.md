# ADR 0002: Separate simulated and production yield

**Status:** Accepted

## Context

Preprod must demonstrate a complete Prize-Savings Pool before a suitable audited Midnight-native yield strategy is available. Treating injected test value as yield would overstate production readiness.

## Decision

Preprod uses clearly labeled Simulated Yield released deterministically from a separately funded, capped Prize Reserve. Anyone may checkpoint accrued yield. Replenishment is a public governance action; neither the Operator nor automation may mint a Prize during a draw. Mainnet remains blocked until the Operator selects an audited Midnight-native yield protocol and the integration passes the Mainnet security and operational gates.

## Consequences

Preprod evidence validates product and transaction behavior, reserve exhaustion, and governance replenishment, not investment performance. Production documentation may not claim yield, APY, or Mainnet readiness from the simulation.
