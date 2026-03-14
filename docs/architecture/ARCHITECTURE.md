# LightChallenge Architecture

> **Canonical documentation lives in the top-level [README.md](../../README.md).**
> This file is retained for reference only.

The architecture diagram, component descriptions, core concepts, and data flow documentation
are maintained in the project root:

- [README.md](../../README.md) — architecture overview, system components, core concepts
- [db/DATABASE.md](../../db/DATABASE.md) — database schema, data flow, write sources, authoritative sources
- [OPERATIONS.md](../../OPERATIONS.md) — off-chain pipeline, worker documentation, troubleshooting
- [DEPLOY.md](../../DEPLOY.md) — contract deployment sequence, post-deploy configuration

## Architecture Rules

When adding or changing code:

1. Keep responsibilities separated by layer (contract / offchain worker / API / frontend).
2. Do not place business logic in API routes if it belongs in offchain services.
3. Do not duplicate evaluation logic in multiple places.
4. Prefer DB-backed state over local JSON/file state.
5. Keep AIVM + PoI as the main validation path.
6. Archive legacy code instead of leaving parallel half-used paths.
7. Update documentation (see Documentation Rules in README.md).
