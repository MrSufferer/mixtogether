# Shroudly Context Map

## Contexts

- [Prize Pool](./midnight/CONTEXT.md): defines the private prize-savings product and its economic language
- [Web Experience](./apps/web/CONTEXT.md): defines supported participant journeys and release evidence journeys
- [Release Operations](./docs/operations/CONTEXT.md): defines release environments and operational ownership

## Relationships

- **Prize Pool → Release Operations**: Release Operations determines where the Prize Pool may run and what readiness claim may be made about it.
- **Prize Pool → Web Experience**: Web Experience presents Prize Pool actions without exposing participant-private state.
- **Web Experience → Release Operations**: Release Operations defines which wallet journeys and evidence qualify a release.
- **Release Operations → Prize Pool**: The Operator administers releases but does not redefine participant balances or prize outcomes.
