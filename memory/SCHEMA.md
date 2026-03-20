# Total Recall Memory Schema

> Protocol documentation. Loaded every session. Teaches Claude how the memory system works.

## Four-Tier Architecture

```
CLAUDE.local.md         ← Working memory (auto-loaded, ~1500 words, session-ready facts)
memory/registers/       ← Domain registers (load on-demand by topic)
memory/daily/           ← Daily logs (append-only, raw captures)
memory/archive/         ← Superseded/completed items (cold storage)
```

### Tier 1: Working Memory (`CLAUDE.local.md`)

- Auto-loaded every session
- ~1500 word limit — ruthlessly curated
- Only behavior-changing facts: active context, critical preferences, key decisions, open loops
- Updated at end of session or when facts change

### Tier 2: Registers (`memory/registers/`)

- Domain-specific files loaded on-demand
- Load when the topic comes up (see `_index.md`)
- More detail than working memory, less than daily logs
- Updated when decisions solidify or preferences are confirmed

### Tier 3: Daily Logs (`memory/daily/`)

- Append-only chronological captures
- Raw notes, observations, learnings from each session
- Never edited after writing (except corrections marked clearly)
- Source material for register promotion

### Tier 4: Archive (`memory/archive/`)

- Completed projects, superseded decisions, old daily logs
- Cold storage — rarely accessed
- Move here when content is no longer actionable

---

## Write Gate Rules

Before writing to memory, ask: **"Does this change future behavior?"**

| Condition                        | Action                                               |
| -------------------------------- | ---------------------------------------------------- |
| New preference discovered        | Write to daily log → promote to preferences register |
| Decision made with rationale     | Write to daily log → promote to decisions register   |
| Project state changes            | Update projects register directly                    |
| Person context learned           | Write to people register                             |
| Technical constraint discovered  | Write to tech-stack register                         |
| Deadline or commitment           | Write to open-loops register immediately             |
| Casual observation, one-off fact | Skip — don't pollute memory                          |

---

## Read Rules

| Tier                             | When Loaded                              |
| -------------------------------- | ---------------------------------------- |
| `CLAUDE.local.md`                | Every session (auto)                     |
| `memory/registers/_index.md`     | Every session (auto)                     |
| `memory/registers/open-loops.md` | Every session (auto)                     |
| Other registers                  | On-demand when topic arises              |
| Daily logs                       | Rarely — only for historical research    |
| Archive                          | Almost never — only for deep archaeology |

---

## Routing Table

| Trigger                                   | Destination    |
| ----------------------------------------- | -------------- |
| "I prefer...", "always do...", "never..." | preferences.md |
| Decision with tradeoffs                   | decisions.md   |
| Person mentioned by name                  | people.md      |
| Project discussed                         | projects.md    |
| Tech choice, language, framework          | tech-stack.md  |
| Follow-up needed, deadline, commitment    | open-loops.md  |
| Everything else                           | daily log      |

---

## Contradiction Protocol

**Never silently overwrite.** When new information conflicts with existing memory:

1. Keep the old entry, mark it `~~superseded~~`
2. Add new entry with date and reason for change
3. Note what changed and why

Example:

```markdown
~~Prefers tabs for indentation~~ (superseded 2026-02-22)
Prefers 2-space indentation — confirmed explicitly during TypeScript refactor
```

---

## Correction Handling

Corrections have highest priority and must propagate:

1. Immediately update working memory (`CLAUDE.local.md`)
2. Update relevant register
3. Add correction note to today's daily log
4. Search and update any other tiers that contain the wrong information

---

## Maintenance Cadences

| Cadence           | Action                                               |
| ----------------- | ---------------------------------------------------- |
| Immediate         | Write open loops, deadlines, critical decisions      |
| End of session    | Update working memory, promote key daily log entries |
| Periodic (weekly) | Review open-loops register, close completed items    |
| Quarterly         | Archive old daily logs, prune stale register entries |

---

## File Locations

- **Working memory**: `CLAUDE.local.md` (project root, auto-loaded)
- **Protocol**: `.claude/rules/total-recall.md` (auto-loaded if configured)
- **Registers**: `memory/registers/`
- **Daily logs**: `memory/daily/YYYY-MM-DD.md`
- **Archive**: `memory/archive/`
