# ADR 0010: Use a personal control plane and split services

**Status:** Accepted

## Context

The release needs static hosting, an online DUST sponsor, automation, and durable non-authoritative data. Organization-owned accounts would reduce key-person risk, but the chosen operating model keeps the current personal accounts.

## Decision

The current maintainer personally owns the GitHub repository and Vercel, Render, Supabase, Resend, Better Stack, DNS, and monitoring accounts, protected with ordinary passwords and authenticator-based MFA. Vercel hosts the static web app. Render hosts the stateless Sponsor Service and the paid Mainnet Automation Service; scheduled or manually dispatched GitHub Actions perform Preprod automation. Supabase stores sponsorship quotas, jobs, verified email/password/TOTP Backup Accounts, and client-encrypted backup blobs behind schema migrations, row-level security, and narrow operations. Resend provides authentication mail from a dedicated subdomain configured with SPF, DKIM, and DMARC. Better Stack provides uptime monitors, automation heartbeats, a public status page, responder routing, and redacted operational logs. Preprod may use the providers' free tiers with documented limits, sleep, pause, reset, expiry, and data-loss behavior. Mainnet requires Vercel Pro, paid always-on Render services, Supabase Pro, a paid Resend production plan, and paid Better Stack responder and retention capabilities.

On-chain governance, emergency, randomness, and sponsor roles remain separately credentialed according to their own authority rules; personal hosting ownership does not merge them.

## Consequences

The personal control plane is a known single-owner recovery, billing, credential-strength, access, and continuity risk. The runbook must document account recovery, exports, backups, billing failure, provider migration, and the exact steps a future maintainer cannot perform without the current owner's cooperation. A Mainnet readiness report must carry this residual risk explicitly until ownership moves to an organization or team and stronger phishing-resistant authentication is adopted.
