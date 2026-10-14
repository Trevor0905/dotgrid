# DotGrid continuation handoff

## Goal

Ship DotGrid as a two-player Dots and Boxes game: the static browser client is hosted on GitHub Pages under the `Trevor0905` account, while a Cloudflare Worker and Durable Object run the authoritative multiplayer match server. The owner has not provided Vatar sandbox credentials. Do not request or invent them until the owner is ready.

## What is complete

- React/Vite client with the purple lightning identity, a 6 by 6 dot board, a visible 30-second countdown, and a developer-only local demo.
- Pure deterministic game rules in `src/game/engine.ts`, with unit tests covering turn flow, invalid moves, box completion, multi-box moves, completion, and draws.
- GitHub Pages workflow at `.github/workflows/deploy-pages.yml`; it builds relative asset paths so it can publish under `/dotgrid/`.
- Cloudflare Worker source at `workers/match-server/src/index.ts`:
  - A Durable Object is authoritative for a match.
  - `POST /matches` creates a two-player room and returns a staging player session token and share code.
  - `POST /matches/:code/join` admits the second player.
  - `GET /matches/:code/connect?token=...` upgrades to a WebSocket.
  - The object validates moves with the shared engine, persists state, broadcasts state, and uses an alarm for the 30-second deadline.
  - WebSockets use the Cloudflare hibernation API.
- The browser has a “Play with a friend” lobby. It requests the Worker URL, creates a match/share code, or joins a code. This staging flow is intentionally temporary until Vatar identity and matchmaking replace it.

## Important rules

- The server must remain authoritative for identity, membership, moves, turns, timers, scoring, and results. Do not reintroduce browser-authoritative shared play.
- The local demo is developer-only. Do not describe it as a product multiplayer mode.
- Never place Vatar credentials in the frontend, Git history, or Vite environment variables.
- Do not create a Vatar draft, agree to terms, submit review, publish a Vatar game, or add payments without specific owner approval.

## Current blockers / owner actions required

1. Create a public repository named `dotgrid` under `Trevor0905`, or explicitly approve a different repository name.
2. Create/sign in to Cloudflare. The owner must authenticate Wrangler or connect GitHub in Cloudflare; another AI may guide this but must not accept terms or create account keys without the owner completing that action.
3. Deploy Worker only after the final GitHub Pages URL is known. Set Worker `ALLOWED_ORIGIN` to `https://trevor0905.github.io/dotgrid` (or the final Pages URL) before deployment.
4. Enable GitHub Pages with **GitHub Actions** as its source after pushing.
5. Obtain Vatar sandbox documentation and credentials later. Replace the temporary opaque staging tokens with documented Vatar session verification and match lifecycle flow; use Worker secrets only.

## Verification to run

```bash
pnpm test
pnpm lint
pnpm build
pnpm worker:check
```

`pnpm worker:check` is a Cloudflare dry-run and must not deploy. If pnpm reports an EPERM package-store symlink error in this OneDrive workspace, run the local binary instead:

```powershell
.\node_modules\.bin\wrangler.cmd deploy --dry-run --config workers\match-server\wrangler.jsonc
```

`pnpm-workspace.yaml` explicitly permits the `esbuild` and `workerd` build scripts required by Vite and Wrangler. Do not change it to prompt placeholders; doing so blocks routine package checks.

## Suggested next implementation tasks

1. Add Cloudflare Durable Object integration tests for create, join, WebSocket moves, timers, and reconnects.
2. Add a small deployment guide after the owner creates the GitHub repo and signs into Cloudflare.
3. Replace staging session tokens with Vatar integration only after credentials and official docs are available.
4. Test with two separate browser sessions against a deployed Worker before sharing the Pages URL broadly.
