# DotGrid

DotGrid is a two-player Dots and Boxes game being built for Lagos Life through the Vatar Games platform.

## Current stage

The project contains a responsive landing page, a **test-only** local turn-taking demo, and a pure TypeScript game engine. The local demo exists solely for development checks; DotGrid's product experience is always two real players on separate devices or browser sessions. Vatar identity, matchmaking, live state synchronisation, and result submission are deliberately not connected yet.

## Run locally

```bash
pnpm install
pnpm dev
```

## Checks

```bash
pnpm test
pnpm build
pnpm lint
```

## Deployment

The repository includes a GitHub Pages workflow at `.github/workflows/deploy-pages.yml`. It runs the test, lint, and production build checks before deploying.

To publish the shareable demo:

1. Create a GitHub repository and push this project to its `master` branch.
2. In **Settings → Pages**, select **GitHub Actions** as the build source.
3. Push to `master`; GitHub will publish the site at `https://<account>.github.io/<repository>/`.

This deploys the current test-only local demo. Do not create a Vatar draft or present the deployed demo as production multiplayer until the owner approves the final game URL and the authoritative server is integrated. The production deployment must use HTTPS and allow framing by the documented Lagos Life/Vatar origins.

## Multiplayer staging server

`workers/match-server` is the Cloudflare Worker/Durable Object service for two-browser staging matches. It is intentionally separate from GitHub Pages because the server—not either browser—is authoritative for match membership, moves, turns, the 30-second timer, scores, and state.

The staging client is configured with the deployed Worker address internally. Players create or join a friend-code match and never enter a server URL.

Route contract:

- `GET /health` checks server availability.
- `POST /matches` creates a two-player match.
- `POST /matches/:code/join` joins a valid friend-code match.
- `GET /matches/:code/connect?token=...` upgrades the verified player to a WebSocket.

Before deployment, set its `ALLOWED_ORIGIN` value in `workers/match-server/wrangler.jsonc` to the Pages **origin** (for this project, `https://trevor0905.github.io`, without `/dotgrid`), then run:

```bash
pnpm worker:check
pnpm exec wrangler deploy --config workers/match-server/wrangler.jsonc
```

Do not deploy until the owner has approved the final Worker and Pages URLs. See [HANDOFF.md](HANDOFF.md) for the complete continuation brief, including the Vatar integration boundary.
