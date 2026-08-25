---
name: ads-roadmap-docs
description: How to maintain this project's roadmap/docs — the three docs/ files (ROADMAP.md, CHANGELOG.md, IMPROVEMENTS.md), which are owned by the roadkeep CLI and never hand-edited, plus their single-responsibility split and the cross-file update rules. Also the one-task-one-commit rule and the block-completion check. Use whenever adding a new task, choosing which block a task goes under (reuse an existing block; open a new one only when nothing can hold it, and title it generically), marking a task shipped, shipping, retiring, linting, editing any of those files, picking the next RK-number, or finishing a block. Covers roadkeep, roadkeep.toml, task numbering, non-goals, keeping the files in sync, and batching under /loop.
---

# Roadmap & docs maintenance

## ⛔ READ FIRST — one task, one commit (non-negotiable)

**You may NOT do more than one task before committing.** This is the single most
violated rule, so it is stated up front and it is absolute:

- **One task → one `run-commit.cmd`.** The moment a task is complete and validated,
  do the doc sync + `cd` to the repo root + `run-commit.cmd -m "<ascii title>"`
  **before touching the next task.** Finishing a task means *the commit landed* —
  code + `ROADMAP`/`CHANGELOG`/`IMPROVEMENTS` sync in that one commit.
- **A multi-task request (e.g. "execute Block C", or a list of `RK<n>`s) is NOT
  permission to batch.** It is a request to run tasks **one-at-a-time, committing
  after each.** Never implement task 2 while task 1 is uncommitted. A single giant
  diff spanning many tasks with one commit (or no commit) at the end is the failure
  this rule exists to prevent.
- **For any batch of ≥2 tasks you MUST drive it with the `/loop` skill**
  (self-paced): exactly one task per iteration, `run-commit.cmd` at the end of the
  iteration, then let the loop advance. Do not hand-roll a loop that defers commits.
- **Self-check before starting task N+1:** run `git status`/`git log -1`. If the
  previous task's work is not already committed, STOP and commit it first. If you are
  about to edit files for a new task and the working tree still shows the prior task's
  changes, you have already broken this rule — commit now.

The full commit + batch mechanics are rules 6–7 below.

---

## ⛔ READ SECOND — the three files are owned by `roadkeep`

[`roadkeep.toml`](../../../roadkeep.toml) declares this project's format, and the roadkeep
plugin (declared in `.claude/settings.json`, so a clone gets it) carries the rest: a hook that
**denies a hand-edit** to any of the three and names the command, the `mcp__roadkeep__*` tools
whose input schema *is* this schema, and its own skill with the write path
([`../roadkeep/SKILL.md`](../roadkeep/SKILL.md)). Start a task with `brief`, not by reading the
files; `lint` is the gate. The rules below are the reasoning.

**This project's declared format** (read `roadkeep.toml` rather than trusting this
paragraph when they disagree): prefix `RK`, `ref_scheme = "id"` — so the rationale
anchor is **derived from the task's own id** and is never hand-numbered — and the three
files at `docs/ROADMAP.md`, `docs/CHANGELOG.md`, `docs/IMPROVEMENTS.md`.

**Language.** The docs are written in **Portuguese, without accented characters** —
match the lines already there (`Nao existe schema JSON que descreva uma campanha`).
Commit titles are ASCII too, per `run-commit.cmd`.

---

The roadmap is **split across three files in `docs/`** that must be kept in sync.
Each has one job — never duplicate content between them, and when you touch one,
check whether a sibling needs updating:

| File | Single responsibility | Granularity |
|---|---|---|
| [`docs/ROADMAP.md`](../../../docs/ROADMAP.md) | **Task status** — the *only* source of truth for what's unshipped. Active backlog only (📋 designed · 💭 idea · ⏳ partial · 🛠 in-progress). | one line per task |
| [`docs/CHANGELOG.md`](../../../docs/CHANGELOG.md) | What has **shipped** — a searchable "Shipped Ledger" indexed by Block; `git log` is authoritative for detail. | one entry per shipped task, under its block |
| [`docs/IMPROVEMENTS.md`](../../../docs/IMPROVEMENTS.md) | **Design rationale** (the what/why) for *unshipped* sections only. No status tables, no shipped implementation reports. | prose per active section |

**Task numbering — `add` derives it, and `next-id` prints it.** It scans the same
sources and never fills a gap, so never infer the next number from a block's contents.
Retired ids are never reused. Because the roadmap is periodically pruned of
fully-shipped blocks, **`CHANGELOG.md` (not `ROADMAP.md`) is authoritative for the
real maximum block letter** — grep it to confirm before creating a block.

**The cross-file update rules — follow these every time:**

1. **When a task ships: `ship <id>`** — one transaction (ledger entry, roadmap line deleted,
   rationale section dropped, dependents re-annotated) or none of it. A follow-up names its
   shipped parent in `(deps: RK7)`, which `roadkeep deps` resolves. **Then ask whether that
   was the block's last task** — `stats` answers it, see "When a block completes".
2. **Adding a task starts with its block — and the block is nearly always one that
   already exists.** `add --block` refuses a label no heading declares, so "which
   block?" is the first decision, and the way it goes wrong is by inventing a letter
   instead of reading the headings. **Reuse is the default; a new block is the
   exception you have to justify — and `block add` is not yours to run unprompted:
   propose the label and title to the user and wait, the way you would for any
   irreversible outward-facing change.** A wrong task line is one `amend`; a wrong
   block is a heading, a ledger region that keeps it forever, and a sweep when it
   empties.
   - **Read the candidates first.** `stats` lists the blocks that still hold open
     lines. `grep -nE '^## Block' docs/CHANGELOG.md` lists **every** block ever
     opened — including the ones the roadmap was pruned of, which are still
     legitimate homes: a block emptied by a completed sweep is reopened simply by
     adding a line to it. `list --block <x>` prints what an ambiguously-titled block
     actually holds.
   - **Match on the *job*, not the surface.** A block groups work by what it
     accomplishes, not by which directory it edits. If a reader would accept an
     existing title as covering the task, that is the block — even if the fit is loose.
   - **A new block requires a job no existing heading can honestly hold**, not merely
     work that feels new. Two tasks of a kind is not a block; it is two lines under
     an existing one.
   - **When you genuinely must open one, name it for the capability, not for the
     task in hand.** `block add <label> --title "…"` (`--after` places it; the
     **CHANGELOG** is authoritative for the highest letter, and retired labels are
     never reused). **The test is answerable before you type the title: name three
     plausible *future* tasks the heading would hold. If the second and third are the
     same task worded differently, the title is a deliverable and the block is really
     a task line under an existing heading.** A block named after a single deliverable
     empties on its first `ship` and drags a completion sweep behind it for one task.

   **Then one command, because the anchor is derived.** This project declares
   `ref_scheme = "id"`, so the pointer is **not** yours to choose and the rationale is
   written in the same transaction as the line:
   `add --block <x> --symptom "…" --why "…" --section-body "…"` (or
   `--section-body-file <path>` for prose you drafted in a file — prefer the path over a
   heredoc, since a refusal then re-reads it and costs only the corrected field). The
   `deps:` group and the status marker are `add`'s own flags (`--dep`, `--status`);
   markers live **only** in `ROADMAP.md`.
3. **Status belongs to exactly one file.** If a marker in `IMPROVEMENTS.md` disagrees
   with `ROADMAP.md`/`CHANGELOG.md`, the roadmap files win — fix it.
4. **Keep entries terse.** A ROADMAP entry is **one sentence: what + why + `→`
   pointer.** The reasoning belongs in IMPROVEMENTS, which is what the pointer
   addresses; a line that restates it makes the roadmap a history instead of a queue,
   and lets two files disagree about one design. Never put multi-paragraph release
   notes in a task line.
   **And the same rule about the file, not the line: `ROADMAP.md` holds block headings,
   open task lines and the non-goals — nothing else.** No `> ✅ … shipped` note, no
   block description, no priority prose, no numbering history, no marker legend. The
   test is that **roadkeep has a verb for every kind of content the file may hold** —
   `add`, `block add`, `non-goal add` — so a sentence no verb writes is one that belongs
   in the ledger, at the `→ §` pointer, in `priority` in `roadkeep.toml`, or in `git log`
   (`show`, `brief`, `pick`, `gaps` are what read them back). `lint` cannot see this: it
   reads task lines and prose sections, and a blockquote is neither.
5. **Non-goals are binding.** `ROADMAP.md` → "Non-goals" lists things deliberately
   *not* to build — check them before proposing new work, and add one with
   `non-goal add`, never by hand.
6. **Commit the instant a task finishes — before starting the next (see the ⛔ block
   at the top).** A task is not "done" until `run-commit.cmd -m
   "<conventional-commits title>"` has landed. Do the doc sync (rules 1–2) **in the
   same commit** as the code so the docs never drift from what actually shipped. `cd`
   to the repo root first, and keep the `-m` title ASCII. **Always pass `-m`** — the
   tool otherwise infers the message from the diff, and for a docs/ROADMAP commit that
   means prose about already-shipped work gets misread as `feat: implement <feature>`.
7. **A batch of ≥2 tasks MUST run under `/loop` — mandatory, not a suggestion.** When
   the ask covers multiple tasks (a whole block, or an explicit list of `RK<n>`s),
   drive it with the `/loop` skill self-paced: **exactly one task per iteration,
   `run-commit.cmd` at the end of that iteration (rule 6), then advance.** Do not
   implement task 2 while task 1 is uncommitted, and do not hand-roll a loop that
   defers commits to the end. Only a genuinely single-task ask skips `/loop`.

## The drift these rules exist to prevent

A roadmap line grows into an essay in the same session that writes it — a sibling
project measured 95 active lines averaging **142** words, worst **555**, six of the
worst eight written in one sitting. Treat it as a drift the process *invites*, not a
lapse: **if the analysis feels too big for the line, that is the signal it goes in
IMPROVEMENTS.** The same drift is what makes a rationale file grow without bound —
`ship` dropping the section is what keeps it to the *unshipped* design only.

---

## When a block completes

**After every `ship`, ask `stats` whether the shipped task's block is now empty.**
A block printing **`0`** with no markers has no open lines left — that is the
completion signal. Do not infer completion from "I finished the tasks the user
listed": a block routinely holds lines nobody named in this session, and `stats` is
the only thing that counts them.

- **`block drop <x>` is the roadkeep half.** A heading standing over nothing is what
  that verb removes, and it is the only thing allowed to remove it — the guard denies
  the hand-edit. Do it in the same commit as whatever public text the block's
  completion changed, and remember `CHANGELOG.md` keeps the block forever, which is
  why it (not `ROADMAP.md`) is authoritative for the highest block letter.
- **A block emptied by `retire`/`defer` still completes.** The check is about what the
  project's public text claims, and a retired line changes that claim as much as a
  shipped one — usually by removing a promise.
- **The public surfaces get one pass at the boundary.** A block, not a task, is what a
  reader meets first: ten tasks each correctly folded into an existing page still leave
  a README or a landing page describing the product as it was before the block existed.
  When this project grows such a surface (`README.md`, the site under
  `ads.japode.com`), bring it up to date here, in its own final `/loop` iteration —
  **not** as a merge of the previous ten. It is not a place for rationale:
  `IMPROVEMENTS.md` prose is never pasted into user-facing text. The block's *why*
  stays internal; the public text says what the reader can now do.
