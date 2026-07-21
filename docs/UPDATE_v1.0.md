# Update v1.0 — Bug Fixes

Date: 2026-07-21

This update resolves three open bugs tracked in [TESTING1.0.md](TESTING1.0.md) — topic mastery not being tracked, a non-functional "New Chat" flow, and a corrupted chat session that permanently blocked further messages — plus a related robustness fix for expired/invalid auth tokens discovered while verifying those fixes.

## Bug #3: Topic Mastery Not Tracked

**Symptom:** After multiple substantive conversation turns, the Knowledge Dashboard still showed "No topic mastery data yet."

**Root cause:** [`backend/services/mastery_service.py`](../backend/services/mastery_service.py) called the Anthropic SDK with an `output_config` parameter for structured JSON output. That parameter does not exist in the installed SDK version (`anthropic==0.69.0`), so every call raised a `TypeError`. The error was caught by a blanket `except Exception` and silently discarded, so mastery analysis always returned nothing — the trigger wiring (`chat_service.py`) and the dashboard's fetch/render logic were both already correct.

**Fix:** Replaced the invalid `output_config` call with the SDK's supported structured-output pattern: a forced tool-use call (`tools=[...]`, `tool_choice={"type": "tool", "name": "record_topic_mastery"}`), reading the parsed result directly from `tool_use.input` instead of `json.loads`-ing a text block.

**Verification:** Mocked an Anthropic tool-use response and confirmed `analyze_and_update_mastery` now parses and persists `TopicMastery` records correctly, and that `output_config` is no longer sent.

## Bug #4: "New Chat" Button Non-Functional

**Symptom:** Clicking "New Chat" highlighted the control but did not create a new session or clear the current conversation; the URL stayed on the old session.

**Root cause:** There was no "New Chat" control in the UI at all. The only code path that created a session (`resolveSession()` in `frontend/app/chat/[avatarId]/page.tsx`) was a fallback used exclusively when an avatar had zero existing sessions — once any session existed, it always reused the most recent one.

**Fix:** Added a "+ New Chat" button to [`frontend/components/Sidebar.tsx`](../frontend/components/Sidebar.tsx) that calls `api.createSession(avatarId)` directly and navigates to `/chat/{avatarId}?session={newId}`, bypassing the session-reuse logic entirely.

**Verification:** Ran the app locally, created a test avatar and session, sent a message, then clicked "+ New Chat." Confirmed the URL moved from `?session=2` to a newly created `?session=3` and the conversation view reset to the empty state, while the original session remained intact in Chat History.

## Bug #5: Corrupted Session Blocks All Further Messages

**Symptom:** In an affected session, every new message triggered `400 invalid_request_error: "messages.N: user messages must have non-empty content"`, making the session permanently unusable.

**Root cause:** `stream_chat_response` in [`backend/services/chat_service.py`](../backend/services/chat_service.py) built a non-empty `content` payload for the outgoing Anthropic API call (falling back to `"(see attached file)"` for file-only, text-less sends), but persisted the raw, possibly-empty `user_text` to the database instead. A file-only message with no typed text therefore saved a message row with `content=""`. On every subsequent turn, the full session history — including that empty-content row — was resent to Anthropic, which rejects empty user message content, permanently breaking the session.

**Fix:**
1. The message actually saved to the database now uses the same non-empty fallback text (`"(see attached file)"`) as the API payload, so new empty-content rows can no longer be created.
2. As defense in depth, message history is now filtered to drop any empty-content entries before being sent to the Anthropic API — this also self-heals sessions that were already corrupted prior to this fix, without requiring a data migration.

**Verification:**
- Sent a file-only, text-less message via the API and confirmed the persisted message content is `"(see attached file)"` rather than empty.
- Manually inserted an empty-content row into an existing session (simulating pre-fix corruption) and sent a follow-up message; the request no longer failed with the `400 "non-empty content"` error — it passed Anthropic's request validation (only hitting an unrelated test-account billing limit), confirming the corrupted row is filtered out before it reaches the API.

## Bonus fix: Unhandled crash on expired/invalid auth token

**Symptom:** If a stored JWT became invalid (expired, or the referenced user no longer exists — e.g. after a database reset), any authenticated page crashed with a Next.js "Unhandled Runtime Error: Could not validate credentials," pointing at `request` in `lib/api.ts`, instead of returning the user to the login screen.

**Root cause:** `AuthProvider` ([`frontend/lib/auth-context.tsx`](../frontend/lib/auth-context.tsx)) trusted `localStorage` at face value and never validated the token against the backend. `RequireAuth` let the user through based on that trust, and the shared `request()` helper in [`frontend/lib/api.ts`](../frontend/lib/api.ts) had no handling for `401` responses — it just threw, and several call sites (e.g. `resolveSession()` in the chat page) had no `try/catch`, so the exception went unhandled.

**Fix:** `request()` now detects a `401` on an authenticated call, clears the stored token/user, and redirects to `/login`, instead of throwing into the void. Login and register calls are explicitly exempted (`skipAuthRedirect`) so invalid-credentials errors still surface in the form rather than triggering a silent redirect.

**Verification:** Seeded a stale/invalid token into `localStorage` against a fresh backend and loaded a protected page — confirmed it now redirects cleanly to `/login` with the stale token cleared and no console errors, while a genuine wrong-password login attempt still shows "Invalid username or password" in the form as before.

## Files Changed

- `backend/services/mastery_service.py`
- `backend/services/chat_service.py`
- `frontend/components/Sidebar.tsx`
- `frontend/lib/api.ts`

## Notes

- No pre-existing corrupted session data was found in this environment (no `app.db` was present at the start of this work), so no manual data cleanup was required. The Bug #5 fix heals any existing corrupted sessions automatically the next time their history is loaded.
