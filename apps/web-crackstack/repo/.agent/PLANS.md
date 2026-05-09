# ExecPlan Format

Each plan lives in: `/.agent/execplans/<plan_name>.md`

## Required sections
1) Goal
2) Architecture constraints (tech choices locked)
3) Milestones
   - Description
   - Commands to run
   - Acceptance criteria
   - Tests required
4) Risks & mitigations
5) Rollback strategy
6) Progress log (timestamped)

Milestone acceptance criteria must be demonstrable using commands or UI steps.
