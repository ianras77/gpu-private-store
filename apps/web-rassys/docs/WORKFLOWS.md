# Workflows

The migration currently exposes a canonical channel-chat boundary and keeps
radio and DM deterministic orchestration in their existing services. Live
radio queue commits and DM state commits must remain workflow-gated additions;
their production cutover is pending live parity qualification.
