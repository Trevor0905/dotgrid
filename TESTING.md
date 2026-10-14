# Testing

Run `pnpm test` for deterministic game-engine checks and Worker/client route checks. Current automated coverage includes initial state, ordinary turn alternation, duplicate/out-of-turn rejection, box completion, scoring, extra turns, timer expiry, health checks, match creation, joining, invalid codes, CORS preflight, the exact Worker-to-Durable-Object request method, and the waiting-lobby contract (no deadline until both player connections exist).

Before release, add integration coverage using a Workers runtime for WebSocket reconnect timing, concurrent move requests, and two-device matches. The unit suite already verifies the deterministic engine paths, but a deployed staging Worker still needs two real browser sessions before release.

Manually verify the result animation on two separate player sessions: the winner sees the win treatment, the other player sees the loss treatment, draws are neutral, and reduced-motion mode does not use distracting movement.
