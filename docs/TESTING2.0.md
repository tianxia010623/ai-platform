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
## Test Session 3: Post-Bugfix Regression + New Finding

### Date
2026-07-22

### Scope
Regression check after teammate's bug fixes (Bug #3, #4, #5), plus new registration flow test

### Bug #6: Registration Error Displays "[object Object]" Instead of Actual Message
- Symptom: When registration fails validation (e.g. password too short), the frontend displays the literal text "[object Object]" instead of a readable error message.
- Cause: The frontend is rendering the raw error object returned by the backend (a 422 Unprocessable Content response) directly as a string, instead of extracting and displaying the actual validation message (e.g. "password must be at least X characters").
- Reproduction: Try to sign up with a short password (e.g. 4 characters); registration fails but the error shown is unhelpful.
- Status: Open
- Impact: Medium, users have no way to understand why their registration failed, leading to confusion and repeated failed attempts

### Bug #7: Chat Sessions Not Auto-Titled, Making History Indistinguishable
- Symptom: All chat sessions in the sidebar history are labeled generically as "New Chat" (e.g. two entries both showing "New Chat"), even after real conversations have taken place. There is no way to tell them apart.
- Expected: Similar to ChatGPT-style apps, each session should be auto-titled based on its first message/content once a conversation starts (e.g. "PyTorch bug troubleshooting").
- Related observation: Clicking "New Chat" while already in an empty new session produces no visible change; this may be intentional (no content to save yet), but it is hard to confirm without proper session titles to distinguish state.
- Status: Open
- Impact: Medium, chat history becomes unusable at scale since users cannot identify past conversations by name

## Product Discussion: Knowledge Dashboard / Topic Mastery Feature

After team discussion, we agreed this feature does not fit naturally with the product's actual use case. Users are having casual/roleplay conversations with personas (including entertainment-oriented ones like tsundere characters), and being "graded" on topic mastery feels disconnected from that experience.

Decision: This feature will be adjusted/redesigned in a future iteration, rather than treated as a bug fix.

## Test Session 4: Feedback Infrastructure Implementation

### Date
2026-07-31

### Scope
Built the foundation for feedback-driven prompt optimization (in lieu of true RL fine-tuning, since the project uses the closed-source Claude API rather than a self-hosted/trainable model).

### Rationale
Since Claude is accessed via API and cannot be fine-tuned directly by the team, "reinforcement learning" for this project is reframed as a feedback-driven prompt optimization loop:
1. Collect user feedback (thumbs up/down) on AI responses
2. (Next) Maintain multiple system prompt variants per persona
3. (Next) Dynamically favor better-performing variants based on feedback data (A/B testing, potentially evolving into a multi-armed bandit approach)

### What Was Built

**Backend:**
- New model `MessageFeedback` (models/message_feedback.py): stores message_id, user_id, rating (-1/1), with a unique constraint per (message_id, user_id) enabling upsert behavior
- New service `feedback_service.submit_feedback()`: creates or updates a feedback record
- New route `POST /api/feedback/{message_id}` (api/routes/feedback.py), registered in main.py
- New schemas `MessageFeedbackCreate` / `MessageFeedbackOut`

**Frontend:**
- New type `MessageFeedback` in lib/types.ts
- New API call `submitFeedback()` in lib/api.ts
- Updated `MessageList.tsx`: added thumbs up/down buttons under each assistant message, with local state tracking and optimistic UI update (reverts on request failure)

### Verification
- Confirmed `message_feedback` table created via `sqlite3 app.db ".tables"`
- Confirmed new endpoint appears in `/docs` (Swagger UI)
- End-to-end test: clicked feedback buttons in the UI, confirmed records were correctly written to the database via direct SQL query

### Status
Feedback collection infrastructure: Complete
Prompt variant system: Not yet started
Dynamic selection algorithm: Not yet started

### Next Steps
- [ ] Discuss and confirm this direction with teammate
- [ ] Design PromptVariant data model (per-avatar, multiple prompt versions)
- [ ] Design variant selection logic (start simple: track win-rate per variant; consider bandit algorithm later)
- [ ] Decide whether feedback should also apply to mastery scoring accuracy, per earlier discussion
