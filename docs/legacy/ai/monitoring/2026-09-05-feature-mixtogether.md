---
phase: monitoring
feature: mixtogether
title: MixTogether monitoring notes
status: ready
---

# MixTogether monitoring notes

No hosted keeper or backend is required. A resumable CLI reports phase, cursor, next valid operation, transaction hash, receipt, and actionable revert. Operators watch public draw-progress events, deposit-pause state, wrapper/registry validity, relayer health, and the age of an unfinished phase. Encrypted handles and values are never logged.

Operational alerts are advisory: phase stalled beyond two epochs, deposit pause active, registry pair revoked, repeated relayer errors, or keeper reverts caused by stale state. Users always retain direct claim and withdrawal controls.
