# Track a NEW_PUBLIC_DAB frame in peaksense

## Why
senselink's /feedwatch currently relies on FINAL frames from a watcher room plus polling /api/feed?period=recent. To deliver truly real-time public-feed updates without per-room coupling, peaksense should emit a NEW_PUBLIC_DAB frame whenever a public dab is created.

## Proposed shape
- Frame name: NEW_PUBLIC_DAB
- Direction: server -> client
- Auth: none
- Scope: global
- Payload: same shape as the dab row from GET /api/feed (id, user, score, grade, tempF, durationS, isPerfectDraw, createdAt).
- Emit location: peaksense/server/dabs.ts, immediately after the dab is inserted and isPublic is true.

## Impact on senselink
- /feedwatch replaces the FINAL handler with a NEW_PUBLIC_DAB handler on the site socket.
- Polling becomes a safety net at a much longer interval (e.g. 5 minutes).
- The watcher-room dependency drops.

## Status
Not yet implemented. Tracked here so the cross-repo coupling is visible.
