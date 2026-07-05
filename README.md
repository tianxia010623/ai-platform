# AI Avatar Chat Platform

Create custom AI virtual personas, chat with them (with streaming responses and file
uploads), and track how well you understand each persona's topics over time.

## Stack

- **Backend:** Python, FastAPI, Anthropic SDK (`claude-sonnet-4-6`), SQLAlchemy async +
  SQLite (`aiosqlite`), ChromaDB (bundled for future semantic/RAG extensions — not
  required by the current feature set)
- **Frontend:** Next.js 14 (App Router), TypeScript, TailwindCSS
- **Storage:** local disk (`backend/uploads/`)

## Project layout

```
backend/
  main.py                 FastAPI app entrypoint
  core/                    config, DB engine, security (JWT), Anthropic client
  models/                  SQLAlchemy models (User, Avatar, ChatSession, Message, TopicMastery)
  services/                business logic (avatars, chat streaming, file parsing, mastery tracking)
  api/routes/              auth, avatars, chat, mastery endpoints
frontend/
  app/                     pages (home, login, avatar/new, chat/[avatarId], dashboard)
  components/              chat + avatar UI components, sidebar, auth guard
  lib/                     API client, auth context, shared types
```

## Prerequisites

- Python 3.11+
- Node.js 18.18+ (or 20+) and npm
- An Anthropic API key ([console.anthropic.com](https://console.anthropic.com))

## 1. Backend setup

```bash
cd backend
python -m venv .venv

# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt

# Configure environment
cp .env.example .env
# then edit .env and set ANTHROPIC_API_KEY=sk-ant-...
```

Run the API server:

```bash
uvicorn main:app --reload --port 8000
```

On first run this will create `backend/app.db` (SQLite) automatically and the
`uploads/` subfolders for avatar images and chat file attachments. The interactive
API docs are available at `http://localhost:8000/docs`.

## 2. Frontend setup

```bash
cd frontend
npm install

cp .env.local.example .env.local
# NEXT_PUBLIC_API_URL should point at the backend, default http://localhost:8000
```

Run the dev server:

```bash
npm run dev
```

Open `http://localhost:3000`. You'll be redirected to `/login` — sign up for an
account, then create your first avatar from the sidebar.

## Using the app

1. **Sign up / log in** — accounts are local to your SQLite database.
2. **Create an avatar** (`/avatar/new`) — give it a name, personality, speaking
   style, expertise, topic tags, and optionally an avatar image. A system prompt is
   generated automatically from these traits.
3. **Chat** (`/chat/[avatarId]`) — messages stream token-by-token over SSE. Use the
   paperclip button to attach a PDF, image, or code file; the backend extracts text
   (PDF/code) or sends the image directly to Claude's vision input.
4. **Knowledge dashboard** (`/dashboard`) — after each exchange, Claude analyzes the
   conversation and estimates your mastery (0–1) of the avatar's topic tags. Scores
   are updated with an exponential moving average (`alpha = 0.3`) so mastery reflects
   your most recent performance while smoothing out noise.

## Notes

- All data is local: SQLite database at `backend/app.db`, uploaded files under
  `backend/uploads/`. Nothing is sent anywhere except to the Anthropic API for
  inference.
- The Anthropic model used is configurable via `ANTHROPIC_MODEL` in `backend/.env`
  (defaults to `claude-sonnet-4-6`).
- JWT tokens are stored in `localStorage` on the frontend and expire after 7 days by
  default (`ACCESS_TOKEN_EXPIRE_MINUTES` in backend settings).
