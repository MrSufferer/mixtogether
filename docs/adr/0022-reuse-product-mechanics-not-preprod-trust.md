# ADR 0022: Reuse product mechanics, not Preprod trust

**Status:** Accepted

## Context

The Mainnet design should preserve the qualified Preprod experience, but replacing `tMIX` with an unspecified real asset does not make simulated economics, single-maintainer threshold keys, or free-tier operations production-safe.

## Decision

Mainnet reuses the reviewed pool accounting, privacy boundaries, participant journeys, and contract interfaces from Preprod. It does not promote the `tMIX` faucet, Simulated Yield, same-maintainer randomness or governance custody, or free-tier service assumptions. Mainnet remains disabled until the Mainnet Readiness Gate selects a real-value shielded Mainnet Principal Asset and audited Production Yield Strategy, qualifies independently operated audited randomness, establishes independent three-of-five timelocked governance and separate emergency authority, completes independent security and legal review, provisions paid production services, removes deployer authority, and approves a bounded canary.

## Consequences

The implementation can deliver a production-operated Preprod release and a reproducible Mainnet-ready deployment path, but it cannot honestly claim a working real-value Mainnet pool until every external gate has evidence. NIGHT is not the default Principal asset because its balances and transfers are unshielded. No environment-variable change may convert Preprod assumptions into a Mainnet launch.
