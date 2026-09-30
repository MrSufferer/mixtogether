# ADR 0005: Publish pool state, not participant data

**Status:** Accepted

## Context

The product must make aggregate solvency, draw progress, and settlement auditable without claiming that public contract execution is invisible or exposing individual financial activity.

## Decision

Private Participant Data includes identity and linkages, individual balances and action amounts, selection weight, and winning identity. Public Pool State includes draw timing and status, commitments and nullifiers, and the occurrence and timing of contract actions. Exact aggregate Principal and Prize values are disclosed only at draw boundaries with at least five eligible commitments; commitments and hiding proofs represent them otherwise, and a sub-threshold draw rolls over. This threshold is not proof of five people or a guarantee of anonymity. Participant Private State is stored encrypted on the participant's device, supports export and import, and may be backed up remotely through a verified email-and-password Backup Account. TOTP is required before reading or deleting ciphertext. A browser-generated high-entropy recovery key encrypts it, and a downloadable Recovery Kit plus a successful local export-and-restore exercise are mandatory before the participant's first contribution. Password, TOTP, or account recovery restores access to ciphertext, not its plaintext. Backup uploads use monotonic generations and reject stale writes rather than merging private state.

## Consequences

The Operator cannot recover lost encryption secrets or decrypt backups, but can associate email accounts with backup presence, size, versions, access metadata, and—on Preprod—sponsorship history. This weakens metadata privacy and must be disclosed. Account deletion removes the live account and ciphertext while provider backup copies follow their documented retention, and it cannot erase public ledger records. Privacy-Safe Telemetry remains aggregate and redacted: it excludes wallet identifiers, commitments, nullifiers, witness or recovery material, complete transaction payloads, and IP-to-transaction correlations. Interfaces, support procedures, and Evidence Bundles must not promise transaction invisibility or unlinkable backup storage.
