# Testing

Run `pnpm test` for the deterministic game engine checks. Current automated coverage includes initial state, ordinary turn alternation, duplicate/out-of-turn rejection, a completed box, scoring, and the extra-turn rule.

Before release, add coverage for multi-box moves, all-board completion, draws, server timer expiry, reconnection, concurrent move requests, result idempotency, Vatar session failures, and two-device matches.

Manually verify the result animation on two separate player sessions: the winner sees the win treatment, the other player sees the loss treatment, draws are neutral, and reduced-motion mode does not use distracting movement.
