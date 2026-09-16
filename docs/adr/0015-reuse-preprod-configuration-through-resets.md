# ADR 0015: Reuse Preprod configuration through resets

**Status:** Accepted

## Context

Midnight Preprod may reset, invalidating deployed contract identifiers, indexed history, test balances, and evidence tied to the prior network instance.

## Decision

Keep the published web configuration and old contract identifiers after a Preprod reset until ordinary failures alert the Operator and a maintainer manually deploys and configures replacements. Contract and indexer health checks run every five minutes. After detecting failure, disable transaction submissions and show an outage banner, but do not proactively replace or gate configuration on a network-genesis identity.

Private state from the retired deployment remains a read-only archive labeled with its former network and deployment. A participant may export it, but the application never imports it into or interprets it against the replacement deployment.

## Consequences

For up to the detection interval the public site may appear available while network actions fail, and old Participant Private State may no longer correspond to the configured contracts. From reset until repair, the release and its transaction evidence are invalid. The runbook must provide detection, incident messaging, redeployment, refauceting, state-disposition, and evidence-regeneration steps.
