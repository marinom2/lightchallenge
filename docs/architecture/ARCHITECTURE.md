# LightChallenge Architecture

## Overview

LightChallenge is a decentralized challenge validation system built around:

- ChallengePay smart contracts
- AIVM inference requests
- PoI validation flow
- offchain dispatchers, workers, runners, orchestrators, and indexers
- webapp challenge creation, linked accounts, and challenge views

The system is currently in transition from mixed legacy flows toward a cleaner production-grade architecture.

## Current architectural direction

The active architecture direction is:

challenge creation
→ challenge stored in DB
→ dispatcher decides readiness
→ worker picks queued job
→ runner loads challenge context
→ orchestrator performs request / bind / commit / reveal / PoI
→ indexer syncs on-chain state back into DB

Future target:

challenge
→ evidence upload
→ evidence normalization
→ evaluation
→ verdict generation
→ verdict stored in DB
→ worker submits AIVM job from real verdict
→ indexer syncs final chain status

## Core components

### Dispatcher
Responsible only for deciding whether a challenge is ready to queue.

### Worker
Responsible only for executing queued jobs, retries, and job state transitions.

### Runner
Loads challenge data from DB and prepares execution input for the orchestrator.

### Orchestrator
Owns the AIVM lifecycle:
- request
- bind
- commit
- reveal
- PoI submission

### Indexer
Reads chain events and syncs them back into database state.

## Source of truth

- Challenge state: database
- Job queue state: database
- Chain lifecycle state: blockchain + indexed DB mirrors
- Evidence and verdicts: should become database-first
- File-based identity/evidence flows: legacy, should be phased out

## Active vs legacy direction

### Active
- AIVM + PoI verification path
- dispatcher / worker / runner / orchestrator / indexer separation
- DB-backed challenge and job state

### Legacy / transitional
- file-based bindings
- JSON-based evidence flows
- ZK-first assumptions in UI and offchain code
- ad hoc adapters and scripts not aligned to current flow

## Architecture rules

When adding or changing code:

1. Keep responsibilities separated by layer.
2. Do not place business logic in UI routes if it belongs in offchain services.
3. Do not duplicate evaluation logic in multiple places.
4. Prefer DB-backed state over local JSON/file state.
5. Keep AIVM + PoI as the main validation path unless explicitly replacing it.
6. Remove or archive legacy code instead of leaving parallel half-used paths.

## Near-term roadmap

1. Move evidence to DB-first storage
2. Add verdict generation pipeline
3. Make worker consume real verdicts instead of placeholder results
4. Migrate identity/bindings from file-based storage to DB
5. Remove obsolete ZK / legacy proof assumptions from webapp and offchain layers
