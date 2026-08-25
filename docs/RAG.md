# Retrieval-Augmented Generation (per-avatar knowledge base)

Status: backend implemented (2026-08-25). No dedicated frontend admin UI yet
— retrieval happens automatically in chat; replies show a small "📚
referencing: filename" tag when they drew on it.

## What this is, and what it replaces

Before this, uploading a file in chat (`backend/services/file_service.py`)
just extracted its text and pasted the *entire* thing into that one
message's context — fine for "here's a doc, answer a question about it
right now", but the content was gone the moment the conversation moved on,
and every future message paid the token cost of nothing extra in return.

This adds a real retrieval step: files a user shares with an avatar are
chunked, embedded, and stored permanently in that avatar's own knowledge
base. On every subsequent message (in this session or any future one),
the user's text is embedded the same way and compared against every stored
chunk by cosine similarity — only the handful of chunks that are actually
relevant get added to the system prompt, not the whole document. That
retrieve-then-generate loop is what makes this RAG rather than context
stuffing.

## Why per-avatar, not per-session

An avatar is a persona — the product framing is closer to "give it
knowledge" than "attach a file to this chat". Indexing against
`avatar_id` means a file uploaded once is retrievable in every future
conversation with that avatar, not just the session it was uploaded in.

## Why sentence-transformers over an API-based embedding

- No extra API key or per-call cost — the avatar chat itself already
  depends on the Anthropic API being configured; embeddings don't need to.
- Runs locally, so it works offline and doesn't add latency from an
  external call for every message.

## Why `paraphrase-multilingual-MiniLM-L12-v2`, not the more common `all-MiniLM-L6-v2`

The first version of this used `all-MiniLM-L6-v2` (the default most
tutorials reach for) and retrieval silently returned nothing for every
real query. Root cause: this app's users ask questions in Chinese about
files that are often in English (e.g. academic papers), and
`all-MiniLM-L6-v2` is effectively an English-only model — a Chinese
question and its genuinely relevant English passage don't land close
together in its embedding space, so every similarity score stayed under
the relevance floor and every retrieval came back empty. There was no
exception, no error in the logs -- it just quietly never found anything,
which made this a "the feature does nothing" bug rather than a crash, and
took manual end-to-end testing (not unit tests) to catch.

`paraphrase-multilingual-MiniLM-L12-v2` is trained across 50+ languages so
that semantically equivalent text in *different* languages ends up close
together in the same embedding space — exactly the cross-lingual case this
app needs. It's a larger download than the English-only model (~470MB vs.
~80MB) but the same architecture family and still fast enough to run
locally per-message.

## Why cosine similarity over a plain list, not a vector database

At the scale a handful of users uploading a handful of files per avatar
implies, brute-force cosine similarity over every stored chunk (a few
hundred, at most) is well under a millisecond in Python — a dedicated
vector database (Pinecone, Chroma, pgvector, ...) would be solving a
scaling problem this project doesn't have yet. Embeddings are stored as a
JSON-encoded `list[float]` on `DocumentChunk.embedding_json`, since SQLite
has no native vector column type. If per-avatar corpora ever grew into the
thousands of chunks, that's the point to revisit this.

## Data model

- `DocumentChunk` (`backend/models/document_chunk.py`): one chunk of one
  uploaded file, belonging to one avatar — `source_filename`,
  `chunk_index`, `content`, `embedding_json`.

## Pipeline (`backend/services/rag_service.py`)

1. **Chunk** — `chunk_text`: splits extracted text into ~800-character
   pieces with 100 characters of overlap, so a sentence that lands on a
   chunk boundary is still findable from at least one side of the split.
2. **Embed** — `embed`: `SentenceTransformer.encode(..., normalize_embeddings=True)`.
   Because chunk and query embeddings are both unit-normalized, a plain dot
   product *is* their cosine similarity — no need to divide by magnitudes.
3. **Index** — `index_file_for_avatar`: called from `chat_service.stream_chat_response`
   whenever a message includes an attached file; chunks + embeds + stores it
   against the avatar, on top of (not instead of) still stuffing the full
   text into that one message via the existing `file_service` path.
4. **Retrieve** — `retrieve_relevant_chunks`: embeds the current user
   message, scores it against every chunk stored for that avatar, and
   returns the top 4 whose cosine similarity clears a `0.2` floor (below
   that, a chunk is probably irrelevant noise, not a real match).
5. **Inject** — the retrieved chunks are appended to the system prompt for
   that turn only (not saved into chat history), labeled with which file
   they came from.

A RAG failure (e.g. the embedding model isn't installed/loaded yet) is
caught in `chat_service` and degrades to "no extra context" rather than
breaking the whole chat turn — retrieval is additive, not load-bearing.

## Setup

```
pip install -r requirements.txt   # pulls in sentence-transformers + torch
```

The first call to `_get_model()` downloads `paraphrase-multilingual-MiniLM-L12-v2`
(~470MB) from Hugging Face and caches it locally; after that it loads from
disk.

## Next steps

- A small admin view per avatar (à la `/avatar/[avatarId]/prompt-variants`)
  listing indexed files and letting you delete one.
- Re-chunk/re-index if a file is re-uploaded with the same name (currently
  it just adds a second copy of the chunks).
