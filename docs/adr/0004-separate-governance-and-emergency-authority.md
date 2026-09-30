# ADR 0004: Separate governance and emergency authority

**Status:** Accepted

## Context

A single privileged key could otherwise pause service, change maintenance behavior, and redirect or alter financial outcomes.

## Decision

Preprod governance uses a two-of-three Preprod Threshold Set: separately encrypted offline keys, all controlled by the current Operator. Mainnet governance uses a three-of-five threshold plus a timelock, with governance and emergency material kept offline or in an independently audited external signer under independent custodians. Mainnet randomness contributors use independent signers. The only continuously online signing credential is the capped DUST sponsor, which has no Principal authority. A separately held Emergency Authority may apply a Circuit-Scoped Pause but cannot withdraw or redirect value, alter balances, or change Prize outcomes. New contributions, draws, sponsorship, and affected maintenance or yield actions pause by scope; withdrawals and already-valid claims remain available. A full settlement pause requires a demonstrated defect and expires unless timelocked governance renews it.

## Consequences

The Preprod threshold tolerates an isolated key failure but not a malicious, coerced, or compromised Operator. The production runbook must assign distinct Mainnet custodians, recovery procedures, and tests for each authority. Personal ownership of hosting accounts does not make the Operator a sole Mainnet on-chain authority. Deterministic tests must show pause scope, preserved exits and claims, expiry, and renewal behavior; the public Preprod Evidence Bundle need not include those negative paths.
