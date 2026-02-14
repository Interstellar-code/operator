# Local Embeddings for Memory — Implementation Proposal

## Problem

OpenClaw's built-in `memory_search` requires external embedding API keys (OpenAI/Google/Voyage). This adds cost and external dependency for a core feature. Local embeddings would make memory search free and self-contained.

---

## Implementation Paths

### Path A: Custom Skill (standalone)

A skill that manages its own local vector store, independent of `memory_search`.

- Indexes `memory/` files and `MEMORY.md`
- Uses Ollama for local embeddings
- Stores vectors in a lightweight file-based DB
- Exposes search as a skill command

**Pros:** No core changes, ships independently, works today
**Cons:** Parallel system to `memory_search`, agent must know when to use which

### Path B: OpenClaw Core Change

Add Ollama as an embedding provider for the existing `memory_search` tool.

- Config: `memory.embeddings.provider: "ollama"`
- Reuses existing memory pipeline, swaps embedding backend
- Ollama already supported for LLM calls — natural extension

**Pros:** Single unified system, clean
**Cons:** Needs upstream acceptance, longer timeline

### Path C: Skill First, Upstream Later (recommended)

Build as a skill to prove the concept, then propose for core integration.

**Pros:** Working prototype fast, de-risks the core proposal
**Cons:** Temporary duplication until merged upstream

---

## Design Decisions

### Embedding Model (via Ollama)

| Model               | Dimensions | Speed   | Quality | Size   |
| ------------------- | ---------- | ------- | ------- | ------ |
| `nomic-embed-text`  | 768        | Fast    | Good    | ~275MB |
| `mxbai-embed-large` | 1024       | Medium  | Better  | ~670MB |
| `all-minilm`        | 384        | Fastest | Decent  | ~45MB  |

**Recommendation:** `nomic-embed-text` — best balance of speed, quality, and size.

### Vector Store

| Store               | Type          | Setup        | Dependencies     |
| ------------------- | ------------- | ------------ | ---------------- |
| LanceDB             | File-based    | Zero-config  | Node.js native   |
| ChromaDB            | Client-server | Needs daemon | Python runtime   |
| SQLite + sqlite-vec | File-based    | Zero-config  | Native extension |

**Recommendation:** LanceDB — zero-config, file-based, Node.js native, no extra processes.

### Indexing Trigger

| Trigger          | When                        | Pros                  | Cons                      |
| ---------------- | --------------------------- | --------------------- | ------------------------- |
| On file save     | Every write to memory files | Always fresh          | May be noisy              |
| On heartbeat     | Periodic (every ~30 min)    | Batched, low overhead | Slight delay              |
| Manual           | Agent or user triggers      | Full control          | Easy to forget            |
| On session start | Each new session            | Fresh at start        | Misses mid-session writes |

**Recommendation:** Heartbeat-based with manual trigger option.

### Scope

| Scope       | Files Indexed                                           |
| ----------- | ------------------------------------------------------- |
| Memory only | `MEMORY.md` + `memory/*.md`                             |
| Workspace   | Above + `SOUL.md`, `USER.md`, `TOOLS.md`, `IDENTITY.md` |
| Extended    | Above + project docs, notes                             |

**Recommendation:** Start with memory only, expand later.

---

## Skill Architecture (Path C)

```
skills/local-memory/
├── SKILL.md          # Skill definition + commands
├── scripts/
│   ├── index.sh      # Index memory files into vector store
│   ├── search.sh     # Semantic search across indexed memory
│   └── status.sh     # Show index stats (file count, last indexed)
├── lib/
│   └── embeddings.ts # Ollama embedding + LanceDB logic
└── store/            # Vector DB files (gitignored)
```

### Commands

- `memory-index` — re-index all memory files
- `memory-query <query>` — semantic search, returns top matches with file + line refs
- `memory-status` — show last indexed time, file count, index size

### Dependencies

- Ollama running locally with an embedding model pulled
- LanceDB (npm package, no external process)

---

## Prerequisites

1. Ollama installed and running (`http://127.0.0.1:11434`)
2. Embedding model pulled: `ollama pull nomic-embed-text`
3. Node.js available for LanceDB

---

## Open Questions

- Should the skill auto-detect if Ollama is available and gracefully fall back to `memory_search`?
- Should indexed vectors persist across gateway restarts or rebuild each time?
- How to handle incremental indexing (only re-embed changed files)?
- Should search results include relevance scores or just ranked matches?
