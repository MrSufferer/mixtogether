# ADR 0016: Publish happy-path Preprod evidence

**Status:** Accepted

## Context

Comprehensive finalized Preprod evidence would demonstrate both successful and adversarial behavior, but it costs more test assets, operator time, signer coordination, and artifact maintenance.

## Decision

The public Preprod Evidence Bundle uses five isolated wallets to satisfy the Disclosure Cohort. Four setup wallets make documented qualifying contributions and a fifth is visible in the primary automated browser journey. It records every prerequisite contribution transaction, one successful Prize Draw, and the Prize claim made by whichever fixture wallet the real contract selects, without forced selection or randomness retries. It also records one minimal finalized transaction submitted through Lace against the deployed Vercel release and the deployment metadata needed to identify the release. Negative and administrative paths are covered by deterministic local tests rather than finalized public Preprod transactions.

## Consequences

The release may claim a reproducible real-network automated cohort, draw, actual-winner claim, and one supported-wallet transaction, not comprehensive Preprod validation. Only one participant needs the detailed primary browser narrative, but all five qualifying contributions and the actual winner's claim remain traceable finalized evidence. Public evidence will not independently demonstrate withdrawal, participant-funded fallback, invalid randomness rejection, threshold failure, double-claim rejection, rollover, pause scope, or deployer-authority removal.
