# Architecture

## Current client

React and TypeScript provide the landing page and local visual demo. `src/game/engine.ts` is intentionally free of React and network code so identical rules can later run on the authoritative server.

## Planned production flow

1. The browser calls the Vatar SDK for the current player and match lifecycle.
2. The browser presents a fresh Vatar session token and match ID to the DotGrid server.
3. The server verifies the session with Vatar and confirms match membership before opening a live game connection.
4. The server validates, stores, and broadcasts every move; browser state is display-only.
5. At completion, the server submits exactly one signed winner or draw result to Vatar.

The client receives the final authoritative state and determines its presentation from its verified participant ID: a player whose ID matches the winner sees the winner animation; the other player sees the loss animation; a draw receives a neutral result treatment.

The server will hold all Vatar secrets. Browsers will never receive them.
