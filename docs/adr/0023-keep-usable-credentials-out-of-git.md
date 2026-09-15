# ADR 0023: Keep usable credentials out of Git

**Status:** Accepted

## Context

Deployment requires usable credentials, while the repository also needs a complete environment-variable contract that future maintainers can follow. A phrase such as "repository environment file" is ambiguous between a local file in the working tree and a tracked plaintext secret file.

## Decision

The maintainer may populate `.env.production.local` inside the working copy, but Git excludes it and local permissions restrict it to the maintainer account. `.env.example` contains names, descriptions, and safe placeholders only. Deployment scripts and runbook steps transfer secrets to GitHub, Vercel, Render, Supabase, Resend, Better Stack, DNS, and Midnight stores without printing values. Credentials never enter commits, issues, documentation, logs, browser artifacts, or Evidence Bundles.

## Consequences

The repository alone cannot deploy production and intentionally stops at named `ready-for-human` credential gates. Rotation and revocation procedures must cover both the provider copy and any retained local copy. Secret scanning must fail the release when a usable credential or private key appears in tracked content or generated evidence.
