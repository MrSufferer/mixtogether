# ADR 0014: Retain temporary deployer authority

**Status:** Accepted

## Context

Removing deployer privileges before public availability minimizes hidden authority, but the selected operating model keeps the deployer temporarily privileged after launch for manual follow-up.

## Decision

For no more than twenty-four hours after a Preprod Release becomes publicly available, the deployer may transfer defined roles, edit non-economic metadata and allowlists, and invoke Circuit-Scoped Pause. It cannot withdraw or settle value, select a winner, replace economic dependencies, or mint discretionary assets. The interface discloses the exact retained powers. The Operator removes or transfers every power in a manual transaction. A Mainnet deployment may be publicly visible but cannot accept contributions until removal is finalized.

## Consequences

Until the removal transaction is finalized, the deployer remains a bounded privileged role and the stated threshold model is incomplete. Monitoring alerts before the Preprod deadline; missing it disables new submissions and starts a Public Incident. The app and runbook must disclose the authority and track its final removal transaction, but the happy-path Preprod Evidence Bundle need not demonstrate that administrative path.
