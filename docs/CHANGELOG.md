# Changelog

All notable changes to this project are documented here.

## [2.0.0] - 2026-10-12

Full write-up: [UPDATE_v2.0.md](UPDATE_v2.0.md).

### Security
- Fixed unauthenticated arbitrary file read through `/api/avatars/image/{filename}` (Windows `..\` path traversal could read `.env` and `app.db`).
- Server refuses to start with a missing, short, or publicly known `JWT_SECRET_KEY`.
- Feedback can only be given on the user's own assistant messages.
- Uploads are validated by content (real images, real PDFs, allowed extensions) with size and count limits.
- Rate limiting on login, sign-up, forgot- and reset-password.

### Fixed
- First message in a new chat crashed the stream (detached DB session in the streaming response).
- Topic-mastery grading used forced `tool_choice`, which current models reject.
- Deleting an avatar left RAG chunks, images, and attachment files behind.
- Attachments (text and images) were forgotten after the first turn.
- Embedding work blocked the event loop; file-search failures were silent.
- Validation errors displayed as `[object Object]`.
- Input stayed locked until background grading finished; auto-scroll fought manual scrolling.
- Visiting an avatar or clicking "New Chat" created empty sessions.
- Duplicate RAG chunks when the same file was uploaded twice.
- Dark theme left several pages white; theme flashed on load.
- Raw API exceptions shown to users.

### Added
- Email login; sign-up confirmation dialog.
- Username shown across the app (home greeting, sidebar user chip, message avatars).
- Markdown replies, stop / regenerate / copy / retry, drag-and-drop and paste attachments.
- Delete and rename chats; edit and delete avatars.
- Home button, shared app layout, page and dialog transitions, mobile drawer navigation.
- Labs section for Feedback Insights and Prompt experiments.
- Alembic migrations; backend pytest suite; frontend Vitest tests.

### Changed
- Default chat model `claude-sonnet-5-5` (with refusal fallbacks); mastery grading on `claude-haiku-5-5` in the background.
- Prompt caching and a history budget for long conversations.
- Self-hosted fonts and SVG icons.
- `POST /api/auth/login` now takes `email` instead of `username`.

## [1.0.0] - 2026-07-21

See [UPDATE_v1.0.md](UPDATE_v1.0.md).

### Added
- User authentication: signup, login, JWT-based auth
- AI avatar creation and management (/avatar/new)
- Streaming chat (SSE), with file upload support (PDF/image/code)
- Topic mastery tracking
- Dashboard page
