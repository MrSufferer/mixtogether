# ADR 0018: Use Vercel variables as configuration authority

**Status:** Accepted

## Context

A signed, reviewed release manifest would make configuration changes tamper-evident. The selected operating model instead treats the current personal Vercel project settings as canonical.

## Decision

Vercel project environment variables are the authoritative source for network, contract, dependency, and Compatibility Profile configuration at build time. Repository files and GitHub Release records are not authoritative for those values. The deployed app exposes a sanitized build-time configuration endpoint, and each Evidence Bundle captures those non-secret values for comparison with the current Vercel variables. A canonical variable change requires a new deployment and fresh release evidence.

## Consequences

The Operator or a compromised Vercel account can change configuration outside source review, and changing a variable does not prove which values were embedded in an already deployed build. Evidence attests only to its captured deployment snapshot. The runbook must include export, comparison, redeployment, and configuration-drift checks and cannot claim cryptographically bound release configuration.
