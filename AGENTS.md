# DotGrid contributor instructions

- Keep Dots and Boxes rules deterministic and independently testable.
- Treat the server as authoritative for identity, match membership, turns, timers, scoring, and results.
- Treat the local turn-taking board only as a developer test harness. Never present shared-browser play as a DotGrid product mode.
- Never expose Vatar secrets in browser code, repository history, or client environment variables.
- Use documented Vatar SDK/API capabilities only; do not invent endpoints or flows.
- Do not create a Vatar draft, accept agreements, submit for review, publish, or add payments without explicit owner approval.
- Run relevant tests, build, and lint checks before reporting work complete.
