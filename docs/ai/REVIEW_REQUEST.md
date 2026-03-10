# Full Architecture Review Request

Please perform a full architecture review of this repository.

## Goals

1. Understand the full end-to-end architecture
2. Identify active vs legacy code
3. Produce a cleanup and consolidation plan
4. Refactor toward a cleaner production-grade architecture

## Review scope

Focus especially on:

- offchain dispatchers
- workers
- runners
- orchestrators
- indexers
- adapters / connectors
- identity / bindings
- evidence ingestion
- challenge evaluation
- verdict generation
- AIVM + PoI integration
- webapp challenge and validator flows
- API routes
- schemas / model registries

## Architectural direction to preserve

The target direction is:

challenge
→ evidence
→ evaluation
→ verdict
→ AIVM job
→ PoI validation
→ indexed results

And operationally:

- Dispatcher decides readiness
- Worker executes queued jobs
- Runner prepares job inputs
- Orchestrator handles chain lifecycle
- Indexer syncs chain results into DB

## What I want in the review

Please return:

1. Executive summary
2. File classification:
   - keep
   - keep but refactor
   - archive
   - delete
   - replace
3. Major architecture problems
4. Target architecture
5. Safe migration plan
6. Highest-value first implementation pass

## Important constraints

- Inspect the actual repo before proposing changes
- Do not assume file purpose from filename alone
- Be explicit and opinionated
- Prefer full-file replacements over snippets
- Remove dead or conflicting paths instead of keeping multiple competing architectures
- Keep the AIVM + PoI path as the primary architecture
