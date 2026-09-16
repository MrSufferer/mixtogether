# ADR 0008: Bound DUST sponsorship

**Status:** Accepted

## Context

DUST sponsorship improves onboarding but exposes an operator-funded public resource that can be exhausted or abused independently of participant authorization.

## Decision

The stateless Sponsor Service may add DUST only to participant-authorized transactions that match allowlisted network, contract, circuit, cost, and lifetime rules. Its sole online signing credential is capped and has no Principal, Prize, governance, emergency, or randomness authority. Preprod uses strict quotas associated with the participant's email-linked Backup Account and retains that sponsorship history. Mainnet requires a separately reviewed quota design that avoids permanent public wallet identifiers. Participants retain a direct, participant-funded DUST path.

## Consequences

The sponsor is an availability service, not a financial authority. It cannot supply or redirect Principal, change a circuit call, or become the only path to transact. After a rejection, the interface preserves the authorized action and offers a participant-funded DUST submission with its cost and reason. A timeout is different: until the provider result is reconciled, the same idempotency key must not be resubmitted because the sponsor may still have paid for it. The Preprod choice deliberately lets the Operator correlate a Backup Account's email with sponsored requests and retained sponsorship history, so enrollment must disclose that privacy loss. Monitoring, rate limits, credential rotation, depletion procedures, and proof that unrelated secrets are absent from its runtime are production requirements.
