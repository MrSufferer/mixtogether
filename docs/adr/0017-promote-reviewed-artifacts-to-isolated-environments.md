# ADR 0017: Promote reviewed artifacts to isolated environments

**Status:** Accepted

## Context

Preprod qualification is useful only if Mainnet uses the reviewed code and proof artifacts without inheriting resettable assets, test credentials, or mutable test data.

## Decision

Promotion starts from an immutable reviewed source tag and its verified contract, proof, and web hashes. Preprod and Mainnet use separate Vercel projects and domains with network and contract identifiers fixed at build time and persistent environment labels. Mainnet receives its own deployment configuration and never copies Preprod keys, balances, database rows, Participant Private State, or test-asset state.

## Consequences

The interface has no runtime network switch. A source or dependency change requires a new Preprod qualification. Environment-specific deployment records must identify the common reviewed inputs and the distinct network outputs.
