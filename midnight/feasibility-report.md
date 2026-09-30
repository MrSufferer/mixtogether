# Preprod feasibility gate

This is the reproducible result of the first Shroudly Preprod gate and its
reviewed compatibility correction. It is checked in so the parent issue can
link to the exact gate state without exposing credentials or generated proving
material.

## Reproducer

From a clean checkout at the review baseline plus the implementation commits:

```text
pnpm install --frozen-lockfile
pnpm midnight:compile:keys
pnpm midnight:profile
```

The four Compact sources compile and proving keys can be generated with the
installed toolchain. The installed versions reported by the Compact CLI are:

```json
{
  "cli": "0.5.2",
  "compiler": "0.31.1",
  "runtime": "0.16.0",
  "language": "0.23.0"
}
```

The corrected release profile pins Compact CLI `0.5.2`, language `0.23.0`,
compiler `0.31.1`, and runtime `0.16.0`. Therefore the profile reports
`compactCompile: true` and `compatibilityMatch: true` on this workstation.
`readyForPreprod` remains false because the provider, browser, authority, and
production-operated evidence gates are still incomplete.

## Safety result

The TypeScript reference ledger and deterministic adapter exercise the
financial, privacy, randomness, authority, migration, and timing invariants
locally. Compact compilation is a syntax/artifact check only until the exact
profile is installed and the generated contract interface is reviewed against
the reference properties. No provider, browser, authority, or production
evidence gate is claimed by this report.

Contract-dependent deployment and qualification remain blocked until the
maintainer completes the remaining human gates and accepts the checked-in
Compatibility Profile. Mainnet transactional entrypoints remain absent.
