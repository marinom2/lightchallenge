I need you to perform a full-architecture review and cleanup of my project.

This is not a narrow bug fix. I want you to inspect the ENTIRE codebase, understand how the system works end-to-end, identify legacy pieces, remove or archive what is no longer needed, and upgrade the project into a cleaner production-grade architecture.

You must be extremely thorough, conservative, and explicit.

# Claude Architecture Review Brief

Purpose: perform a full end-to-end architecture audit, cleanup, consolidation, and modernization of the LightChallenge repository.

Instructions:
- Read the entire relevant codebase first
- Do not jump straight into code edits
- First produce architecture diagnosis and file classification
- Then propose migration plan
- Then implement only the highest-value safe changes
- Prefer full-file replacements
- Be explicit about delete / archive / rewrite / keep
- 
==================================================
PROJECT CONTEXT
==================================================

This project is a LightChallenge / ChallengePay style system with:

- webapp (Next.js / TypeScript frontend + API routes)
- offchain workers / dispatchers / indexers / runners / orchestrators
- AIVM + PoI flow for challenge verification
- challenge creation / proof / claims / validation flows
- legacy ZK / legacy file-based identity / legacy adapters still present
- mixed old and new architecture that now needs consolidation

We recently moved toward this architecture:

1. Dispatcher decides whether a challenge is ready
2. Worker executes the AIVM flow
3. Runner loads challenge data and prepares the AIVM job input
4. Orchestrator handles request / bind / commit / reveal / PoI submission
5. Indexer syncs chain events back into DB
6. We want to move to DB-first evidence + verdict storage
7. We want to eliminate old file-based / JSON-based / legacy paths that are no longer correct

Important current direction:
- AIVM + PoI is the active method
- We are moving away from legacy ZK-first assumptions
- We want evidence ingestion, evaluation, verdict storage, and then AIVM submission
- We want production-grade code, not patched legacy code

==================================================
WHAT I NEED FROM YOU
==================================================

I want a FULL review of the repository with these goals:

1. Understand the project architecture end-to-end
2. Identify which files are:
   - active core files
   - outdated but reusable
   - obsolete / legacy / should be deleted
   - dangerous or architecturally inconsistent
3. Propose a production-grade target architecture
4. Refactor toward that target architecture
5. Remove duplication, dead code, and obsolete flows
6. Standardize naming, module boundaries, and responsibilities
7. Ensure the new architecture is coherent and future-proof
8. Keep the current working AIVM + PoI direction intact
9. Prepare the codebase for DB-backed evidence and verdicts
10. Avoid partial cleanup — I want a real consolidation

==================================================
NON-NEGOTIABLE RULES
==================================================

You must follow these rules exactly:

- FIRST inspect all relevant files before proposing changes
- Do not assume file purpose from filename only
- Do not invent architecture disconnected from the current codebase
- Do not rename major concepts unnecessarily
- Do not break working paths unless replacing them with a better fully-wired solution
- Prefer full-file replacements over snippets
- Be explicit about what should be deleted, archived, rewritten, or kept
- If something is legacy, say it directly
- If multiple competing architectures exist in the repo, choose one and explain why
- Keep the final recommendation aligned with the current AIVM + PoI model
- Do not leave “half migrated” code paths
- Every recommendation must be tied to actual repo structure

==================================================
SPECIFIC AREAS TO REVIEW
==================================================

Please inspect and reason about all of these areas carefully:

### A. Offchain architecture
Review:
- dispatchers
- workers
- runners
- orchestrators
- indexers
- adapters
- connectors
- identity
- inference
- scripts

Determine:
- what is still valid
- what is legacy
- what should move to DB-backed flows
- what should be removed entirely

### B. Webapp architecture
Review:
- challenge creation pages
- proof submission flows
- claims flow
- validators
- API routes
- models registry
- shared schemas
- any route still tied to old proof assumptions

Determine:
- what is aligned with AIVM + PoI
- what is still ZK/legacy-oriented
- what should be simplified or removed

### C. Evidence pipeline
I want the system to move toward:
- real evidence upload / ingestion
- normalized evidence stored in DB
- verdict generation from evidence
- verdict stored cleanly in DB
- worker consuming verdict/evidence instead of fabricating responses

Inspect current evidence-related files and determine:
- which are still useful
- which should be replaced
- what the clean implementation path is

### D. Identity / linked accounts
We have old file-based identity bindings and legacy scripts.
Review all identity/bindings related files and determine:
- what to remove
- what to migrate to DB
- what should remain only as compatibility helpers

### E. Schemas / models / templates
Inspect:
- public models registry
- canonical schemas
- challenge schemas
- activity schemas
- any old proof envelope / zk schema

Determine:
- what remains useful
- what should become DB-backed later
- what should be removed now

==================================================
EXPECTED OUTPUT FORMAT
==================================================

I want your answer in the following structure:

## 1. Executive Summary
A concise but direct summary of the current state of the codebase:
- what is good
- what is messy
- what is dangerous
- what architecture should win

## 2. File Classification
A categorized list:
- Keep as core
- Keep but refactor
- Archive
- Delete
- Replace completely

Include exact paths.

## 3. Architecture Diagnosis
Explain the major architectural problems in the current project.

Examples:
- mixed legacy/new flows
- duplicated responsibility
- proof logic in wrong layer
- evidence not first-class
- JSON/file-based storage where DB should be used
- UI coupled to outdated assumptions

## 4. Target Architecture
Give the target production-grade architecture:
- folder structure
- responsibility per layer
- data flow from challenge creation to evidence to verdict to AIVM to indexing

## 5. Migration Plan
Give an ordered step-by-step implementation plan.
This should be practical and safe.

## 6. Concrete Refactors
For the most important files, tell me exactly:
- why they need change
- whether to rewrite or delete
- what the new version should do

## 7. Code Changes
When you provide implementation, give FULL FILES, not partial snippets.

==================================================
IMPORTANT CURRENT DIRECTION
==================================================

The current direction we want is this:

- Dispatcher:
  only decides if a challenge is ready to queue

- Worker:
  only executes queued jobs and manages retries / status

- Runner:
  loads challenge data and prepares the execution input

- Orchestrator:
  interacts with chain for request / bind / commit / reveal / PoI

- Indexer:
  reads chain events and syncs DB state

- Evidence pipeline:
  should become DB-first

- Verdict pipeline:
  should be explicit and stored in DB

- AIVM job:
  should consume real evidence / verdict, not a fake hardcoded “verified: true”

This direction should be preserved and strengthened.

==================================================
CRITICAL REVIEW MINDSET
==================================================

Please be opinionated and direct.

I do NOT want:
- generic praise
- superficial style feedback
- vague architecture advice
- tiny isolated patches

I DO want:
- a real repo audit
- ruthless identification of legacy code
- clear decisions
- practical production-grade cleanup

If two files do the same thing, tell me which one should survive.
If something is obsolete, say delete it.
If something should be archived instead of kept live, say so.

==================================================
IMPLEMENTATION STYLE
==================================================

When implementing:
- prefer modular TypeScript
- use explicit types
- reduce “any”
- isolate DB access into dedicated files
- remove dead branching logic
- keep logs useful but not noisy
- avoid hidden coupling across unrelated layers
- keep code readable and maintainable

==================================================
FINAL REQUEST
==================================================

Start by reading and understanding the whole project structure.
Then produce the architecture review.
Then propose the cleanup.
Then implement the highest-value changes in a safe order.

Do not jump straight into code without first showing that you understood the architecture.

If you need to make assumptions, state them clearly.
If you find broken or contradictory paths, point them out explicitly.

## Mandatory Working Style

Before changing code, produce these files in the response:

1. Repo map
2. File classification table
3. Target architecture
4. Migration order
5. Risk list

Only after that begin implementation.

For implementation:
- do not modify more files than necessary in a single pass
- keep each pass coherent
- explain why each changed file belongs in that pass
- when deleting a file, explicitly justify deletion
- when archiving a file, propose the archive location
