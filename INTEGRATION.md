# Vatar integration notes

Verified from the public Vatar docs on 14 October 2026:

- `Vatar.init()` returns player data and a short-lived session.
- Player panels in a live match will use the permitted Vatar player display names and avatars for the two match participants; the local demo's labels are placeholders only.
- `Vatar.match.quick({ stake: 0 })` supports friendly quick matches; create/join supports private match codes.
- Vatar updates match lifecycle, but DotGrid must run gameplay on its own server.
- The server verifies sessions with `POST /session/verify` and posts the final signed result.
- Production hosting must be HTTPS and send the documented `frame-ancestors` CSP header.

Open questions to resolve during sandbox integration: the exact reliable gameplay transport, the platform's review expectation for a test-only purchase when MVP has no products, and the final handling of match/disconnect states.
