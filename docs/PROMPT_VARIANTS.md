# Prompt Variants & the Bandit Selector (方案一)

Status: backend implemented and tested (2026-08-04). No frontend UI yet — see
"Next steps" below.

## What this is

Because avatar replies come from the Anthropic Claude API (closed-source,
not something we can fine-tune), "reinforcement learning from feedback" in
this project doesn't mean training a model. It means using the 👍/👎
feedback we already collect (see `docs/TESTING2.0.md` and the feedback
system) to automatically prefer the system-prompt phrasing that gets better
reactions, for each avatar independently.

The mechanism is a **multi-armed bandit**: every avatar can have several
`PromptVariant`s — small additions to its base system prompt (e.g. "be
extra warm and encouraging", "ask more Socratic follow-up questions", "keep
replies shorter"). Each time a user starts a message with that avatar, we
pick one variant to use, and the resulting reply's thumbs up/down feeds
back into how likely that variant is to get picked next time.

## Why Thompson Sampling (not a fixed A/B split or epsilon-greedy)

Our real per-avatar feedback volume is small — a handful of ratings a day,
not the thousands a typical product A/B test would run on. Thompson
Sampling is the standard bandit algorithm for exactly this regime:

- Each variant has a `Beta(alpha, beta)` posterior over its true win rate,
  starting at `alpha=1, beta=1` (uniform — "no opinion yet").
- To pick a variant, draw one random sample from each variant's posterior
  and choose the variant with the highest sample.
- Early on, with little data, the posteriors are wide and the draws are
  noisy, so variants get chosen roughly evenly (exploration happens
  automatically).
- As thumbs up/down accumulate, each variant's posterior narrows around its
  real win rate, and the highest-sample variant is increasingly the
  actually-best one (exploitation), without a hand-tuned exploration rate
  like epsilon-greedy needs.

`backend/scripts/simulate_bandit.py` demonstrates this on synthetic data
(see below) since real traffic isn't yet large enough to show it directly.

## Data model

- `PromptVariant` (`backend/models/prompt_variant.py`): belongs to one
  avatar. `prompt_modifier` is appended to the avatar's `system_prompt` when
  this variant is selected (empty string = the original prompt, unchanged).
  Tracks `alpha`, `beta`, and raw counts (`times_shown`,
  `times_positive`, `times_negative`).
- `Message.prompt_variant_id` (nullable): which variant produced an
  assistant reply, so a later thumbs up/down on that message can be
  attributed back to the variant that generated it.

Creating the first custom variant for an avatar automatically creates a
"Baseline (original)" variant (empty modifier) alongside it, so the bandit
always has the original prompt as one of the arms it's comparing against —
adding a variant never silently replaces the original.

Avatars with no variants configured behave exactly as before: chat_service
falls back to the avatar's `system_prompt` untouched. This feature is
opt-in per avatar.

## Request flow

1. `POST /api/chat/stream` → `chat_service.stream_chat_response` calls
   `bandit_service.select_variant_for_avatar`, which does the Thompson
   Sampling draw over the avatar's active variants (or returns `None` if
   there aren't any yet).
2. The chosen variant's modifier is appended to the system prompt for that
   one Claude API call; the resulting assistant `Message` is saved with
   `prompt_variant_id` set, and the variant's `times_shown` is incremented.
3. `POST /api/feedback/{message_id}` → `feedback_service.submit_feedback`
   looks up which variant (if any) produced that message and calls
   `bandit_service.apply_reward` (thumbs up = success, thumbs down =
   failure). Feedback is an upsert (a user can change their rating), so
   changing an existing rating first reverts the old reward before applying
   the new one — variant stats always reflect the latest opinion, never
   double-counted.

## API endpoints (no frontend yet — use `/docs` or curl for now)

- `GET /api/avatars/{avatar_id}/prompt-variants` — list variants + live
  stats (`alpha`, `beta`, `times_shown`, `estimated_win_rate`).
- `POST /api/avatars/{avatar_id}/prompt-variants` — create a variant
  (`{"name": "...", "prompt_modifier": "..."}`); auto-creates the baseline
  on the first call for an avatar.
- `PATCH /api/avatars/{avatar_id}/prompt-variants/{variant_id}` — toggle
  `is_active` (deactivating a variant removes it from selection without
  deleting its history).

## The simulation demo

Run:

```
cd backend && python scripts/simulate_bandit.py
```

This runs 300 independent simulated trials of 400 rounds each against 4
synthetic variants with fixed true win rates (52% / 61% / 70% / 47%),
averages the results, and writes `backend/scripts/bandit_simulation.html`
— open it in a browser. It shows cumulative regret (Thompson Sampling vs.
epsilon-greedy vs. random selection) and how Thompson Sampling's selection
share shifts toward the best variant over time. It doesn't touch the real
database — pure simulation, safe to re-run any time.

## Migration note

`Message.prompt_variant_id` is a new column on an existing table.
SQLite's `create_all` only creates missing tables, not new columns on
tables that already exist on disk, so `core/database.py` now also runs a
small idempotent `ALTER TABLE messages ADD COLUMN prompt_variant_id
INTEGER` guarded by a `PRAGMA`-based column check on every startup. Existing
`app.db` files pick up the new column automatically — no need to delete and
recreate the database.

## Next steps

1. Frontend: a small admin view per avatar to create/toggle variants and
   see live win rates, instead of using `/docs` directly.
2. Decide whether feedback should also inform `mastery_service`'s topic
   mastery scoring (separate discussion, see the main progress doc).
3. Once real variant usage builds up, revisit whether Thompson Sampling's
   assumptions (Bernoulli reward, stationary true rate) still fit, or
   whether replies should be weighted differently (e.g. no-feedback
   messages currently contribute no signal at all).
