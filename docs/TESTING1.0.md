# Test Report

## Test Session 1

## Date
2026-07-05

## Tester
Liz｜Tianxia

## Scope
Full local run of frontend + backend, verifying signup, login, avatar creation, and chat functionality.

## Environment
- Backend: Python 3.13.9, FastAPI, uvicorn --reload
- Frontend: Next.js 14.2.15, npm run dev
- Database: SQLite (auto-generated locally)

## Results

| Feature | Status | Notes |
|---|---|---|
| Sign up / Login | Pass | Flow works as expected |
| Create Avatar (/avatar/new) | Pass | Form fields work, avatar created successfully |
| Chat | Fail | See bugs below |

## Bugs Found

### Bug #1: API Key Not Configured
- **Symptom**: Chat request fails with `401 - invalid x-api-key`
- **Cause**: `backend/.env` had a placeholder value for `ANTHROPIC_API_KEY` instead of a real key
- **Status**: Resolved after teammate provided the real key

### Bug #2: Insufficient Anthropic Account Balance
- **Symptom**: After adding the real key, chat fails with `400 - Your credit balance is too low to access the Anthropic API`
- **Cause**: Anthropic account has insufficient credit
- **Status**: Open — requires teammate to top up via console.anthropic.com Billing page
- **Impact**: Core chat feature cannot currently be verified; highest-priority blocker

## To Do
- [ ] Re-test full chat flow (including file upload) once resolved
- [ ] Test Dashboard page
---

## Test Session 2

## Date
2026-07-13

## Tester
Liz | Tianxia

## Scope
Full regression test of core features: registration, avatar creation, chat flow, dashboard

## Results

| Feature | Status | Notes |
|---|---|---|
| Sign up | Pass | New account created and redirected correctly |
| Create Avatar (PPdog - tsundere persona) | Pass | Persona voice matched the brief well |
| Basic chat | Pass | Streaming response works, tone matches persona |
| Multi-turn memory | Pass | Avatar correctly recalled earlier context (PyTorch bug mention) |
| File upload (PDF/image/code) | Pass | Tested with tsconfig.json; uploads processed correctly during chat |
| Chat history persistence across avatar switching | Pass | Conversation history retained when switching between avatars |
| Theme switching | Pass | Persisted across sessions (Sepia remembered after re-login); good contrast and readability in dark theme (Midnight) |
| Knowledge Dashboard | Fail | See Bug #3 below |

## Bugs Found

### Bug #3: Topic Mastery Not Tracked
- Symptom: After multiple substantive conversation turns with an avatar (PPdog), the Knowledge Dashboard still shows "No topic mastery data yet."
- Expected: Dashboard should reflect mastery progress based on conversation content, per the topic mastery tracking feature described in the README.
- Possible causes: Backend mastery evaluation logic not yet implemented / not triggering after chat turns / data not persisting / frontend not reading the data correctly.
- Status: Open, needs backend investigation
- Impact: Medium, core chat works, but the "track how well you understand each persona's topics over time" feature is not functional

### Bug #4: "New Chat" Button Non-Functional
- Symptom: Clicking "New Chat" in the sidebar highlights the button but does not create a new session or clear the current conversation. URL remains unchanged (e.g. stays at /chat/3?session=5).
- Expected: Should create a fresh chat session with empty history.
- Status: Open, needs frontend/backend investigation (session creation logic)
- Impact: Medium, blocks users from starting a clean conversation, especially relevant when a session is corrupted (see Bug #5)

### Bug #5: Corrupted Session Blocks All Further Messages
- Symptom: In one specific chat session (avatar_id=3, session=5), every new message triggers: Error code 400, invalid_request_error, "messages.32: user messages must have non-empty content"
- Cause (suspected): An empty-content message exists somewhere in this session's history, and it gets included in every subsequent request to the Anthropic API, causing the whole request to fail.
- Status: Open, needs backend investigation into message storage/retrieval logic
- Impact: High, this session is now completely unusable; likely caused by an edge case during message saving (possibly related to file upload or an interrupted stream)
- Related: Compounded by Bug #4, since users cannot escape the broken session by starting a new chat


## To Do
- [ ] Further investigate why topic mastery isn't being recorded/displayed and fix the bug.

## Test Session 2 Summary
All core features tested pass except topic mastery tracking (Bug #3), which remains open and needs backend investigation. Overall the app is in a solid, mostly functional state for this stage of development.
