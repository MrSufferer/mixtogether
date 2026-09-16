# ADR 0013: Separate on-chain responsibilities

**Status:** Accepted

## Context

Asset issuance, pool liabilities, randomness, and yield behavior have different security and replacement boundaries. Combining them increases privilege and upgrade blast radius; moving them off-chain would violate Midnight financial authority.

## Decision

Use separate shielded asset and faucet, pool accounting, randomness, and yield-adapter contracts. The pool is the sole authority for Principal and Prize liabilities and registers the exact dependency identifiers it accepts. Off-chain callers may trigger permissionless work but never supply authoritative financial results.

## Consequences

Deployment evidence must snapshot every dependency identifier and source hash observed in the tested Vercel Hosting Configuration. Replacing an economic dependency follows the opt-in migration decision rather than silently changing an existing pool.
