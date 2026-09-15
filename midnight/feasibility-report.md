# Preprod feasibility gate

This is the reproducible result of the first Shroudly Preprod gate. It is
checked in so the parent issue can link to the exact blocker without exposing
credentials or generated proving material.

## Reproducer

From a clean checkout at the review baseline plus the implementation commits:

```text
pnpm install --frozen-lockfile
pnpm midnight:compile:keys
pnpm midnight:profile
```

The four Compact sources compile and proving keys can be generated with the
installed toolchain. The installed versions reported by `compact compile` are:

```json
{
  "compiler": "0.31.1",
  "runtime": "0.16.0",
  "language": "0.23.0"
}
```

The accepted release profile requires Compact language `0.5.1` (compiler
`0.31.1`, runtime `0.16.0`). Therefore the profile reports
`compatibilityMatch: false` and `readyForPreprod: false`. The source compile
and key result does not waive this compatibility gate.

## Safety result

The TypeScript reference ledger and deterministic adapter exercise the
financial, privacy, randomness, authority, migration, and timing invariants
locally. Compact compilation is a syntax/artifact check only until the exact
profile is installed and the generated contract interface is reviewed against
the reference properties. No provider, browser, authority, or production
evidence gate is claimed by this report.

Contract-dependent deployment and qualification remain blocked with
`needs-info` until the maintainer supplies the exact Compact language/runtime
profile (or accepts a reviewed compatibility update). Mainnet transactional
entrypoints remain absent.
