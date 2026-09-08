# Backend Task 1 report

Status: ready-for-human

Implemented `server/domain.mjs`, `server/store.mjs`, `server/index.mjs`, and `tests/api.test.mjs`.

## Delivered

- Native Node 24 HTTP server and SQLite, with exported `createApp({dbPath, staticDir, clock}) => {server, close}`. CLI listens only at `127.0.0.1:3000`, defaults to `data/jobkanban.sqlite` and `dist`.
- Empty first launch; GET list, POST create, PATCH basics/action, POST commands. All changes return a complete Job; create returns 201, successful updates 200. Validation/not-found/conflict return 400/404/409 with `{error:string}`; unexpected storage failures return a generic 500 message.
- Stable UUIDs, version checks inside a SQLite transaction, append-only history table, per-round table, and persisted record JSON. Record, history and round changes commit together.
- Preview-compatible stage IDs and Chinese statuses. Offer result aliases map to authoritative Chinese statuses. Action completion in assessment/interview changes nonwaiting status to 待反馈; cancellation preserves status; Offer decisions clear pending action and retain the prior snapshot. Archive requires result stage and restore preserves state.
- History includes `title`, `text`, `date`, `action:{text,date,dateType,round}`, prior/current stages and statuses, and previous/current round snapshots. Rescheduling preserves the previous appointment and updates the current round date.
- Input object/field allowlists, string length bounds, real dates and clock times, http/https links only, 64 KiB body limit, hostile Host/Origin rejection, safe static extension allowlist, real-path containment, and no database/static traversal exposure.

## Verification

Started with a missing `server/index.mjs` failure for the creation HTTP test. Added each subsequent HTTP slice before its implementation, observed missing routes or behavior failures, and then passed it.

`node --test tests/api.test.mjs`: 13 passed, 0 failed. Covers reopen persistence, old action and round history, concurrent version conflicts, malformed/oversized JSON, invalid states/links/dates, Offer, archive/restore, and static/API access boundaries. Follow-up regressions first reproduced cross-stage feedback action retention and edit cancellation outcome errors; both now pass.

`node --check server/domain.mjs`, `server/store.mjs`, and `server/index.mjs` passed. Node 24.14 emits its expected experimental SQLite notice.

## Integration notes

- All record text fields use strings, missing dates use `''`, and no-date type is `none`. Send ISO appointment times with explicit offset, e.g. `2026-09-10T10:00:00+08:00`, or plain YYYY-MM-DD.
- Date and dateType must agree; nonblank dates require an action. Clearing action should send `action:'', date:'', dateType:'none'` together.
- Progress payload supports `resultType` or `status:'offer'|'rejected'|'withdrawn'` in result stage. Existing Offer decisions are preserved when staying in Offer.
- Newly entering assessment/interview 待反馈, including crossing stages, completes and clears an existing action while preserving its old stage, date and round snapshot. It never infers a passed round. Clearing an action through PATCH records a cancellation and preserves status.
- No frontend files or package files changed; no commits made by this agent.
