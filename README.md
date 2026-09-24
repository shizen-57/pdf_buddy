# 📖 PDF Buddy

A desktop reading companion for PDFs. It is **not a PDF chatbot.**

Chatbots store your thinking as a growing list of chat transcripts, and after a few dozen you can't find anything.
PDF Buddy has **no chat list at all**. Everything you think about while reading can be found again in three ways:

| Way back | How it works |
|---|---|
| **Place** | Select a passage (or ask about a page). The conversation is **pinned to that spot** as a ✦ in the margin. To find it again, go back to where you read it, the way you'd find a margin note. |
| **Meaning** | When a conversation settles, it's **distilled into atomic notes** (concept / insight / definition / question). A near-duplicate is **merged** into the existing note instead of being added again, so the notebook grows in depth, not length. Notes **auto-link across documents** (`explains`, `example_of`, `contradicts`, `related`). Press **Ctrl/Cmd+K** and describe what you remember, e.g. *"that entropy thing in the physics paper"*. |
| **Time** | Every document keeps a **reading journal**: time per page, a short summary per session, and the questions that were still open. When you reopen a document, a **Welcome back** card tells you where you were and what's unresolved. |

While you read, the side panel also shows **"You've thought about this before"**: notes from your *other* PDFs that relate
to the current page. This is where connections between books show up.

## Stack

- **Electron + React + TypeScript** (electron-vite), cross-platform (Windows / macOS / Linux)
- **pdf.js** for rendering, the selectable text layer, and highlights
- **LLM:** [SleepyAI](https://www.sleepyai.org) OpenAI-compatible gateway (default model `deepseek-v4`). Any OpenAI-compatible endpoint works.
- **Embeddings:** run **locally** (`bge-small-en-v1.5`, 384-d, via transformers.js). They're free, private, and work offline. (DeepSeek has no embeddings API.)
- **Supabase:** accounts, Postgres + **pgvector**, and Storage for the PDFs. Row-level security isolates every user's data.
- Your API key is encrypted with the OS keychain (Electron `safeStorage`) and never uploaded.

## Setup

1. **Supabase:** create a project at supabase.com. In *SQL Editor*, run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).
   It creates the tables, RLS policies, search functions, and the private `pdfs` storage bucket.
   (With the Supabase CLI: `supabase db push`.)
2. **Env:** `cp .env.example .env` and fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
3. **Install & run:**
   ```bash
   npm install
   npm run dev
   ```
4. Sign up in the app, then open **⚙ Settings** and paste your SleepyAI key. Click **Fetch models** to pick the exact
   DeepSeek model ID your plan exposes, then **Test connection**.

The first time embeddings run, the ~35 MB embedding model downloads once into the app's data folder.

### Build installers

```bash
npm run dist:win     # .exe (NSIS)
npm run dist:mac     # .dmg
npm run dist:linux   # AppImage + .deb
```
Build each platform on that OS (or in CI) because of native modules.

## Scripts

| | |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm test` | Unit tests (chunking, distill parsing, merge/link decisions, session dwell, prompts) |
| `npm run typecheck` | TypeScript for main, preload and renderer |
| `npm run build` | Production bundle into `out/` |

## How it works

```
select text ─▶ pin (anchor) ─▶ ask ─▶ answer grounded in: the page, related passages from the PDF (pgvector),
                                       and your own past notes from any PDF
leave pin / 90s idle ─▶ distil ─▶ notes ─▶ merge if ≥0.90 similar (same kind), else insert + link if ≥0.75
page change ─▶ embed page ─▶ match_notes(excluding this PDF) ─▶ "You've thought about this before"
Ctrl+K ─▶ hybrid_search: vector + full-text (reciprocal rank fusion) over notes, pins and all PDF text
reading ─▶ session dwell per page ─▶ close after 10 min idle / switch / quit ─▶ journal summary + open questions
```

Work left unfinished by a crash or quit is caught up on the next launch: journal entries are written and any
un-distilled pins are processed. A session still active on another device isn't touched, because the heartbeat check skips it.

```
src/main/        Electron main: SleepyAI client, local embeddings, keychain-backed settings, IPC
src/preload/     window.buddy bridge
src/shared/      pure logic + prompts (unit-tested): chunking, distill/merge/link decisions, sessions
src/renderer/    React UI: Viewer (pdf.js + pins), BuddyPanel, Notebook, CommandPalette, Library, Settings
supabase/        schema, RLS, pgvector search functions
```
