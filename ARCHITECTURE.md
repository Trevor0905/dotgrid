# Architecture

## Current client

React and TypeScript provide the landing page and local visual demo. `src/game/engine.ts` is intentionally free of React and network code so identical rules can later run on the authoritative server.

## Planned production flow

1. The staging client uses the fixed Cloudflare Worker URL and creates or joins a private friend-code match.
2. The server creates a Durable Object room and gives each participant an opaque, staging-only session token.
3. The server validates, stores, and broadcasts every move; browser state is display-only.
4. The server owns the 30-second deadline and persists the current match state.

Vatar integration is intentionally not part of this staging architecture. It will be designed only after the owner supplies official sandbox documentation and credentials.

The client receives the final authoritative state and determines its presentation from its verified participant ID: the winner sees the winner animation and the other player sees the loss animation.

When Vatar is later added, its secrets will remain server-side. Browsers will never receive them.
