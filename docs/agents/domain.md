# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- `CONTEXT-MAP.md` at the repo root. Read each context file relevant to the topic.
- `docs/adr/`: read system-wide ADRs that touch the area you're about to work in.
- In a multi-context repo, also check each context's `docs/adr/` directory for context-scoped decisions.

If any of these files don't exist, proceed silently. The `/domain-modeling` skill creates them lazily when terms or decisions are resolved.

## File structure

This repo uses a multi-context layout:

```text
/
├── CONTEXT-MAP.md
├── docs/adr/                  # system-wide decisions
├── apps/
│   └── web/
│       ├── CONTEXT.md
│       └── docs/adr/          # web-specific decisions
└── packages/
    └── contracts/
        ├── CONTEXT.md
        └── docs/adr/          # contract-specific decisions
```

## Use the glossary's vocabulary

When output names a domain concept, use the term as defined in the relevant `CONTEXT.md`. If the concept is not in the glossary, note the gap for `/domain-modeling`.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding.
