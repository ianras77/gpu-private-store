# AGENTS.md (Repository Rules for Codex)

You are Codex operating inside this repository.

## Prime Directive
Build a production-grade multi-tenant agentic data platform powering two branded clients (XLCRACK and TAPECRACK). Backend first, then web, then iOS.

## Planning Rule (ExecPlans)
For any milestone beyond trivial changes, you MUST:
1) Create or update an ExecPlan in `/.agent/execplans/<name>.md`
2) Break work into milestones with:
   - explicit commands to run
   - acceptance criteria (observable behaviors)
   - tests to add

## Quality Rules
- Multi-tenant isolation must be enforced in the database (RLS) and tested.
- Keep secrets out of git.
- Any new endpoint must have:
  - request/response models
  - validation
  - tests
- Prefer small PR-sized changes; run tests + lint after each milestone.

## Stop Rule
After each milestone:
- run checks
- fix failures
- update the ExecPlan with completion status and evidence
Then stop.
