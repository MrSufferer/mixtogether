# Shroudly incident record

Copy this template into the private incident tracker and publish only the
sanitized status updates. Never include credentials, Recovery Kit material,
wallet identifiers, commitments, nullifiers, backup IDs, or full transaction
payloads.

## Summary

- Incident ID:
- Severity: `SEV-1` financial safety / `SEV-2` release or privacy / `SEV-3` degraded service
- Environment and deployment ID:
- Detected at (UTC):
- Detected by (health check, provider, participant report):
- Incident commander:
- Current status: investigating / contained / monitoring / resolved

## Timeline (UTC)

| Time | Event | Action / owner |
| --- | --- | --- |
| | | |

## Safety assessment

- Solvency Invariant status:
- Principal withdrawals remain available:
- Settlement/contribution/yield/sponsorship scopes paused:
- Deployer deadline and submission-lock status:
- Any participant-private data exposed? (yes/no; describe only aggregate impact):

## Containment

1. Stop the affected automation submission path and preserve the same
   participant-authorized action for the participant-funded fallback.
2. Use only the narrow Circuit-Scoped Pause required by the evidence. A full
   settlement pause must have two-of-three governance approval and expires in
   24 hours unless renewed.
3. Preserve redacted logs and health snapshots. Do not copy raw provider
   responses into chat or issues.

## Communications

- Better Stack alert acknowledged at:
- Status-page update URL:
- In-product disclosure/banner update:
- Next update due:

## Resolution and follow-up

- Root cause:
- Corrective change and source revision:
- Rotation/revocation completed:
- Evidence bundle and checksum:
- Independent review required:
- Post-incident review owner and due date:
