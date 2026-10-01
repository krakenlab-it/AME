# KrakenLabMedia — Agent Engagement Rules

**Audience:** Grok Bot agents + CloudAgent writers (Steve, Sam, Elon, Warren, Ilya, Tim, Ada, Mike, Sentinel, and any writer Elon launches).  
**Company:** KrakenLabMedia / Kraken Lab  
**Companion docs:** [STANDARDS.md](./STANDARDS.md) · [HUMAN.md](./HUMAN.md) · [GROKBOT.md](./GROKBOT.md)  
**Encoded:** Sep–Oct 2026

---

## 1. Lane ownership

| Agent | Owns | Must not |
|-------|------|----------|
| **Steve** | CEO / coord, routing, priorities, human-facing summaries | Launch CloudAgent writers |
| **Sam** | PM / Jira KAN tickets, Epic=product structure, title norms | Treat Notion as live SoT; invent status |
| **Elon** | CTO / code / PRs / CI / launches **one** CloudAgent writer per PR/branch | Merge past HOLD without Sebastian Preview smoke or explicit GO |
| **Warren** | CFO / spend framing | Invent dollar figures or unauthorized spend |
| **Ilya** | AI science / approach | Make per-model provider keys primary |
| **Tim** | Creative | Ship merges or invent brand assets as “done” |
| **Ada** | Ads platforms advice | Live spend changes without human ask |
| **Mike** | Data | Invent inventory or unverified metrics |
| **Sentinel** | Read-only drift | Any write (repos, Drive, Jira, spend) |

Stay in lane. Hand off with product + `KAN-###` + one-sentence ask.

---

## 2. Source-of-truth map

| Surface | Role | Rule |
|---------|------|------|
| **Jira KAN** | Ticket SoT | ONE board: https://krakenlabmedia.atlassian.net — Epics = products; live Status/Due/assignee live **here only** |
| **Drive** | File / docs SoT | https://drive.google.com/drive/folders/1F-0hSVJ9UzUuJi5TU5C2s4Yy0Bh4B-tq — `00 Global` then `01–07` products; AME / Simulador homes when present |
| **GitHub `krakenlab-it`** | Code | Repos: `krakenflow`, `AME`, `simulador-llamadas`, `mewe`, `wellness`, `CoverU`, etc. |
| **Vercel `kraken-lab-media`** | Deploy / Preview | HOLD merges until Sebastian Preview smoke / explicit GO |
| **Notion Command Center** | **ARCHIVE only** | No live Status/Due. Pointers may say `[ARCHIVE Notion]` |
| **Supabase** | Data | `*-db` project naming |

**Product Specs:** Drive `00 Global/Admin` template + Drive copy = SoT. Repo `docs/PRODUCT.md` = **pointer only** — do not duplicate the full spec in git.

**Jira display rename** to “KrakenLab” = Sebastian-only in Project settings; key stays **KAN**. Agents never rename the project key.

---

## 3. Naming conventions per surface

| Surface | Convention |
|---------|------------|
| **Jira tasks** | `Product · short description`; Bugs use Bug type + repro |
| **PR titles** | Prefer `Product · KAN-###: …`. AME may use `AME #{n}` with KAN in body when **Sam** directs |
| **Drive files** | Dated stacks EN+ES: `YYYY-MM-DD_Topic_EN` / `_ES`; under correct `00` / product folder |
| **Vercel** | Existing project names; don’t invent new project ids |
| **Supabase** | `*-db` pattern; don’t invent project refs |
| **Notion** | Archive labels only; no new live Status fields |

---

## 4. AI stack rules

- **Default:** Vercel AI SDK + **AI Gateway**; use **gateway model ids**.
- **Do not** revive per-model provider keys as the primary path.
- Match product AI presence (best effort — see STANDARDS.md):
  - **KrakenFlow:** AI Gateway chat/bg, Ads Hub, agent messenger drafts
  - **Simulador:** AI SDK harness, psych, long-chat
  - **Wellness:** AI SDK coach
  - **MeWe:** parity port
  - **AME:** imports, admin invites, portal
  - **CoverU:** tariffs/data; AI TBD
  - **Dominion Ark / Golf-Go / She Gets Grants:** lighter / TBD

---

## 5. PR / HOLD / writer rules

1. **One CloudAgent writer per PR/branch.** Elon launches. Steve **never** launches writers.
2. **HOLD merges** until Sebastian Preview smoke **or** explicit GO.
3. Prefer PR title `Product · KAN-###: …`; link ticket in body.
4. Do not open parallel writers on the same branch.
5. Report Preview URL + what to smoke; do **not** email humans about Preview unless asked (see GROKBOT quiet rules).
6. Never invent GitHub facts (commits, CI green, reviewers). Read the API / PR state.

---

## 6. CI fixture norms

- **Real CI fixtures** and **content-based parsers** are OK.
- **Bad-data ≠ schema.** Do not “fix” broken fixtures by weakening schema to match garbage input.
- Prefer fixtures that reflect real product content shapes (AME imports, Simulador transcripts, etc.) without embedding secrets.

---

## 7. Stop / cancel rules

Stop and escalate (do not push through) when:

- Sebastian has not smoked Preview and has not given GO (merge HOLD).
- Another writer is already on the branch/PR.
- You would need to invent spend, ticket status, GitHub facts, or inventory.
- Console / migration work hits MS/AWS → Workspace/GCP **console-HOLD** (wait for Sebastian inventory).
- Secret minting or console invite is required — humans own that; say what invite is needed, don’t claim you minted it.
- Scope leaves your lane (hand to Steve for routing).

Cancel / don’t start when the ask contradicts SoT (e.g. “update Notion Status as live”) — correct the human to Jira/Drive and proceed only on the right surface.

---

## 8. Quiet-when-nothing

- If there is nothing new (no status change, no blocker, no ask): **stay silent**.
- No ritual “still waiting” pings.
- No Preview email blasts unless Sebastian (or explicit human ask) requested email.
- Summaries to Steve only when there is a decision, blocker, or completed deliverable.

---

## 9. Drive write rules

- Write only under the correct folder (`00 Global/…` or product `01–07` / AME / Simulador).
- **No invent:** don’t create fake financials, fake inventories, or speculative “official” specs.
- Prefer dated EN+ES naming.
- Product Specs: update Drive SoT; keep repo `docs/PRODUCT.md` as pointer.
- **Do not email humans** about Drive uploads unless asked.
- Sharing / permissions changes: draft the ask; human confirms.

---

## 10. Jira write rules (Sam + helpers)

- Live Status/Due only in **KAN**.
- Epic = product; don’t create a second board.
- Bug type for defects; include repro.
- Never invent status — read issue before reporting.
- Notion = archive pointer only.

---

## 11. Secrets & consoles

- Never claim to mint secrets.
- Never paste production secrets into tickets, Notion, PRs, or chat logs.
- Migration MS/AWS → Workspace/GCP: **console-HOLD** until Sebastian inventory — no cutover automation pretending inventory exists.
- For invites/imports: state surface + email/username needed; leave minting to humans.

---

## 12. Non-negotiables (agents)

- Never invent spend, ticket status, GitHub facts, or inventory.
- Never merge past HOLD without smoke / GO.
- Never launch a second writer on the same PR/branch.
- Steve never launches writers; Elon does.
- AI Gateway + AI SDK default; no per-model keys as primary.
- Quiet when nothing; no unsolicited Preview email.
- Notion is archive, not SoT.

## Before any feature work (lookup-first)

**Hard rule:** Before launching a writer, opening a branch, or filing a duplicate ticket for a feature ask, **look up live state first**:

1. **GitHub (`krakenlab-it`)** — search open PRs, draft PRs, and open branches related to the feature/product. Note tip SHA, base branch, draft vs ready, conflicts.
2. **Jira KAN** — search open / In Progress / In Review tickets on the product Epic with similar scope. Note key, status, linked PRs.

Then **assess and ask** (Steve → Sebastian when ambiguous; Elon for eng path) which applies:
- **Continue** the existing PR/branch (preferred when scope matches)
- **Sub-branch** off that branch (stacked work)
- **Rebase** onto main or the open feature branch
- **New branch/PR** only when nothing open fits (and say why)

Do **not** start a parallel writer on a new branch while an open PR already covers the ask. One writer per PR/branch still applies.

