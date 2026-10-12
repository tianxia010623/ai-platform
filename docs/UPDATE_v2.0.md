# Update v2.0 — Security, Reliability & UX Overhaul

Date: 2026-10-12

This update came out of a full review of the design and architecture. It fixes
three security issues and several functional bugs, switches login to email,
and reworks the chat experience, theming, and app structure. Verified with a new
backend test suite (28 tests), frontend unit tests (7 tests), a production
build, and a manual pass through every page in the browser.

> **Upgrading an existing install:** `JWT_SECRET_KEY` in `backend/.env` is now
> **required** and must be a strong private value (the server refuses to start
> otherwise — see [Bug #2](#bug-2-publicly-known-jwt-secret)). Changing it signs
> everyone out once. Your existing `app.db` is migrated automatically on startup.

---

## Security fixes

### Bug #1: Unauthenticated arbitrary file read

**Symptom:** `GET /api/avatars/image/..%5C..%5C.env` returned the backend's
`.env` file (including `ANTHROPIC_API_KEY`); the same trick read `app.db` with
every user's data. No login was required.

**Root cause:** The avatar image endpoint joined the URL's `filename` onto the
upload directory without validation. On Windows, `\` is a path separator, so an
encoded `..\` escaped the directory.

**Fix:** New [`backend/core/uploads.py`](../backend/core/uploads.py) only accepts
names the server itself generates (`<32 hex chars>.<ext>`), resolves the path and
checks it stays inside the upload directory. Images are served with an explicit
`Content-Type` and `X-Content-Type-Options: nosniff`.

**Verification:** `test_image_endpoint_blocks_path_traversal`; the request above
now returns `404` against the running server.

### Bug #2: Publicly known JWT secret

**Symptom:** Login tokens were signed with `change-me-to-a-random-secret` — the
value from `.env.example` in this public repository — so anyone could forge a
token for any user.

**Fix:** [`backend/core/config.py`](../backend/core/config.py) refuses to start if
`JWT_SECRET_KEY` is empty, shorter than 32 characters, or any value that has
ever shipped in the repo, and prints the command to generate one.

### Bug #3: Rating other users' messages

**Symptom:** `POST /api/feedback/{message_id}` accepted any message id, so a user
could rate (and skew the prompt-variant bandit for) another user's replies.

**Fix:** Feedback is only accepted on assistant messages in the caller's own
sessions; anything else returns `404`.

### Hardening

- **Upload validation:** images are decoded with Pillow (a renamed `.html` is
  rejected), PDFs must start with `%PDF`, other attachments must have an allowed
  extension. Limits: avatar image 5 MB; chat files 20 MB each, 5 per message.
  Stored extensions come from the detected content, never the client filename.
- **Rate limiting** on login, sign-up, forgot- and reset-password
  ([`backend/core/ratelimit.py`](../backend/core/ratelimit.py)).

---

## Functional bug fixes

### Bug #4: First message in a new chat crashed the stream

**Symptom:** Sending the first message of a new session failed while
auto-naming it (`InvalidRequestError: Instance '<ChatSession>' is not persistent
within this Session`).

**Root cause:** A `StreamingResponse` body runs after the endpoint returns, by
which time FastAPI has closed the request-scoped DB session. The generator kept
using the detached `ChatSession`/`Avatar` objects.

**Fix:** `stream_chat_response` in
[`backend/services/chat_service.py`](../backend/services/chat_service.py) opens its
own DB session and reloads the session and avatar inside it.

**Verification:** Every streaming test in `tests/test_chat.py` failed before the
fix and passes after it; also confirmed with a live message.

### Bug #5: Mastery grading incompatible with current models

**Symptom:** Upgrading the chat model would silently stop topic-mastery
tracking.

**Root cause:** Grading forced a tool call with `tool_choice: {"type": "tool"}`,
which current Claude models reject with a `400`; the error was swallowed.

**Fix:** Uses `tool_choice: "auto"` with a `strict` tool schema and an explicit
instruction to call it, on a dedicated cheaper model (`MASTERY_MODEL`, default
`claude-haiku-5-5`). Verified live: a mastery record was written after a real
exchange.

### Bug #6: Deleting an avatar left orphaned data

**Symptom:** After deleting an avatar, its RAG chunks, avatar image, and chat
attachments stayed on disk/in the database; feedback rows could block the delete.

**Fix:** New [`backend/services/cleanup_service.py`](../backend/services/cleanup_service.py)
removes sessions, messages, feedback, chunks, mastery, prompt variants, and the
files they reference. The same code powers the new "delete chat" feature.

### Bug #7: Attachments forgotten after the first turn

**Symptom:** Follow-up questions about an uploaded image or file got answers as
if it had never been shared.

**Root cause:** Only the message text was stored; history replayed to the model
dropped attachment content.

**Fix:** Extracted text of non-image attachments is stored on the message
(`attachment_context`); stored images are re-sent for the two most recent turns
that had any (older ones become a one-line placeholder). Large images are
downscaled to fit the API's limits.

### Bug #8: Embedding work froze the whole server

**Symptom:** The first upload hung for a long time (≈470 MB model download) and
every other request stalled meanwhile; if the download failed, file search
silently stopped working.

**Fix:** Encoding runs in a worker thread, the model is preloaded in the
background at startup (`GET /api/health` reports its state), failures surface
as a notice in chat, and `HF_ENDPOINT` can point at a mirror.

### Bug #9: Validation errors shown as `[object Object]`

**Fix:** FastAPI's validation-error lists are turned into sentences, e.g.
"Password must be at least 6 characters." ([`frontend/lib/errors.ts`](../frontend/lib/errors.ts)).

### Other fixes

- Input stayed locked for several seconds after a reply finished (it waited for
  mastery grading) — it now unlocks as soon as the reply is complete.
- Auto-scroll yanked the view back down while reading earlier messages.
- Opening an avatar or clicking "New Chat" created empty sessions.
- Re-uploading the same file indexed duplicate RAG chunks.
- Dark ("Midnight") theme left the chat, dashboard, and profile pages white,
  and every load flashed the light theme first.
- Raw API exceptions were shown to users; they are now mapped to readable
  messages (bad API key, out of credits, rate limited, overloaded, offline).

---

## New features & UX

- **Email login.** Log in with email + password (case-insensitive). Sign-up shows
  a confirmation dialog and returns to the login form.
- **Your username across the app:** time-of-day greeting on Home, user chip
  (name + email) at the bottom of the sidebar, your initial on your messages.
- **Chat:** Markdown rendering with copyable code blocks; stop generating (the
  partial reply is kept); regenerate; copy; retry on failure; drag-and-drop and
  paste attachments; "Jump to latest" button.
- **Chats:** created on first message; rename and delete from the sidebar.
- **Avatars:** edit page (all fields + image); delete with confirmation.
- **Navigation:** Home button; shared layout so the sidebar no longer reloads on
  every page; smooth page, dialog, and card transitions (respects reduced
  motion); mobile drawer navigation.
- **Labs section:** Feedback Insights and per-avatar Prompt experiments are
  grouped as research tools, away from everyday navigation.
- **Self-hosted fonts** (no Google Fonts requests), consistent SVG icons instead
  of emoji, accessible labels on icon buttons.

## Architecture & cost

- **Model:** chat defaults to `claude-sonnet-5-5` with server-side refusal
  fallbacks; reasoning effort configurable via `CHAT_EFFORT`.
- **Prompt caching** on the system prompt and conversation history; retrieved
  RAG passages go into the latest user turn so the cached prefix stays stable.
- **History budget:** the oldest turns are dropped once a conversation exceeds
  `MAX_HISTORY_CHARS`.
- **RAG:** per-avatar vectors cached in memory as one numpy matrix; duplicate
  files detected by content hash.
- **Migrations:** Alembic replaces ad-hoc `ALTER TABLE`s. Databases created
  before Alembic are detected, brought to the baseline, stamped, and upgraded.
- **Tests:** `backend/tests/` (pytest, temp DB, fake Claude client — no network)
  and `frontend/lib/__tests__/` (Vitest).

## Configuration changes (`backend/.env`)

| Variable | Change |
|---|---|
| `JWT_SECRET_KEY` | **Required**, ≥ 32 chars, not a known default |
| `ANTHROPIC_MODEL` | Default now `claude-sonnet-5-5` |
| `MASTERY_MODEL` | New, default `claude-haiku-5-5` |
| `CHAT_EFFORT` | New, default `medium` |
| `HF_ENDPOINT` | New, optional HuggingFace mirror |

## API changes

- `POST /api/auth/login` takes `{"email", "password"}` (was `username`).
- `DELETE /api/chat/sessions/{id}` — delete a chat.
- `POST /api/chat/stream` accepts `regenerate=true`; new SSE events
  `user_saved` and `notice`; `mastery_update` was removed (grading is now
  background work).
- `PUT` / `DELETE /api/avatars/{id}/image` — replace or remove an avatar image.
