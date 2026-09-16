# ADR 0024: Replace the active legacy stack

**Status:** Accepted

## Context

The repository's active application, package graph, documentation, and Vercel
preview previously described a legacy public-chain demonstration. Keeping both
architectures active would contradict the Midnight-only financial authority
decision and make dependency, configuration, and evidence boundaries ambiguous.

## Decision

Replace the active workspace, default documentation, automation, and
deployments with the Midnight-native Shroudly implementation. Remove the prior
client libraries, public-chain contracts, and their configuration from the
active package graph rather than retaining a runtime network switch or
dual-stack application. Preserve the prior source in Git history and move
useful historical disclosures and deployment references under `docs/legacy`.

The existing legacy contract and immutable Vercel preview may remain reachable
as explicitly unsupported, noncanonical test artifacts. Create distinct
personal-account Vercel projects and domains for Shroudly Preprod and gated
Mainnet; do not overwrite the legacy project or reuse its environment.

## Consequences

The main branch has one supported architecture and one evidence vocabulary.
Legacy test users may consult the historical release, but it receives no new
features or production claims. A clean install, build, test, and secret scan
must prove that no retired runtime package or public-chain configuration remains
in Shroudly artifacts.
