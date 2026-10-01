# KrakenLabMedia — Human Engagement Rules

**Audience:** Sebastian, Jaime, contractors, and other humans working with the agent team.  
**Company:** KrakenLabMedia / Kraken Lab  
**Companion docs:** [STANDARDS.md](./STANDARDS.md) · [AGENT.md](./AGENT.md) · [GROKBOT.md](./GROKBOT.md)  
**Encoded:** Sep–Oct 2026

---

## 1. How to work with agents

| Agent | Ask them for | Do not ask them for |
|-------|--------------|---------------------|
| **Steve** | Coordination, priorities, routing across lanes | Launching CloudAgent writers (Elon’s job) |
| **Sam** | Jira tickets, Epic/Task structure, status truth | Inventing ticket status; Notion as live SoT |
| **Elon** | Code, PRs, writers, CI fixtures, Preview deploys | Merging without your Preview smoke / GO |
| **Warren** | Spend questions, budget framing | Invented dollar figures |
| **Ilya** | AI science / model approach | Reviving per-model provider keys as primary |
| **Tim** | Creative direction | Shipping code merges |
| **Ada** | Ads platform advice | Live ad spend changes without you |
| **Mike** | Data / analytics framing | Invented inventory or metrics |
| **Sentinel** | Drift / read-only checks | Writes of any kind |

**Practical habits**

- Name the product and ticket (`KAN-###`) when you ask for work.
- Prefer one clear ask per message; agents stay in lane.
- If you need a writer on a PR/branch, say so to **Elon** — Steve will not launch writers.
- Agents must not invent spend, ticket status, GitHub facts, or inventory. If they don’t know, they should say so and ask.

---

## 2. When to smoke Preview (HOLD merges)

**Default:** Merges stay on **HOLD** until you (Sebastian) smoke the Vercel Preview **or** give an explicit **GO**.

Do this when:

- A PR changed UI, auth, imports, invites, payments-adjacent flows, or agent-facing chat.
- Elon / a CloudAgent writer reports Preview ready.
- Sam links a ticket that says “Preview smoke needed.”

Skip or shorten smoke only when **you** say GO for a narrow, low-risk change.

**How to smoke**

1. Open the Preview URL from the PR / Vercel (`kraken-lab-media` team).
2. Hit the path that the PR actually changed.
3. Reply on the PR or to Steve/Elon: smoke **pass** / **fail** + what’s broken.
4. Only then approve merge (or let them merge after your GO).

Agents should not nag with Preview email spam. If you want email, ask for it.

---

## 3. Jira (ticket SoT) — KAN board

- **One board:** [Jira KAN](https://krakenlabmedia.atlassian.net) — project key stays **KAN**.
- **Products = Epics.** Tasks/stories live under the product Epic.
- **Display name “KrakenLab”:** Sebastian-only rename in **Project settings**. Key remains `KAN`. Do not ask agents to rename the project key.
- **Bug type:** Use Jira’s Bug issue type for defects. Include repro, expected vs actual, Preview/env if relevant, and `KAN-###` in agent asks.
- **Titles:** Prefer `Product · short description` (agents mirror this on PRs as `Product · KAN-###: …`).
- **Notion Command Center = ARCHIVE only.** No live Status/Due in Notion. If you see Notion status, treat it as historical; update **Jira**.

---

## 4. Drive vs Jira vs Notion — what goes where

| Put it in… | What |
|------------|------|
| **Drive** (file SoT) | Specs, decks, legal, brand, finance docs, dated EN+ES stacks, Product Specs copies |
| **Jira KAN** | Live Status, Due, assignees, Bugs, acceptance criteria pointers |
| **Notion** | Archive / historical only — label `[ARCHIVE Notion]`; do not run the week from Notion |

**Drive root:** https://drive.google.com/drive/folders/1F-0hSVJ9UzUuJi5TU5C2s4Yy0Bh4B-tq  

**Structure**

- `00 Global` — Admin, Brand, Finance, Legal, …
- `01–07` — product folders: KrakenFlow, Dominion Ark, MeWe, Wellness Challenge, She Gets Grants, Golf-Go, CoverU
- **AME** / **Simulador** — product homes when present (alongside or as named product folders)

**Product Specs:** Template in `00 Global/Admin`. **Drive copy is SoT.** Repo `docs/PRODUCT.md` is a pointer only — edit the Drive spec, not a long duplicate in git.

---

## 5. File naming (Drive stacks)

- Prefer **dated** filenames: `YYYY-MM-DD_Topic_EN` / `YYYY-MM-DD_Topic_ES` (or clear EN+ES pair).
- Keep language in the name when you maintain both stacks.
- Avoid “final_final_v3”; date + short topic wins.
- Product work lives under that product’s folder; cross-cutting admin under `00 Global`.

---

## 6. Secrets, consoles, migrations

- **Humans mint and rotate secrets.** Agents must never claim to mint secrets or invent console access.
- Consoles (Vercel, Supabase, GCP, AWS, Microsoft, ads platforms, etc.): you (or designated ops) own invite + access.
- **MS/AWS → Workspace/GCP migration:** **console-HOLD** until Sebastian completes inventory. Do not cut over or invent inventory lists.

---

## 7. How to ask for invites / imports

Be explicit and name the surface:

- **Vercel team** `kraken-lab-media` — email + role.
- **GitHub org** `krakenlab-it` — GitHub username + repo(s) if not whole-org.
- **Jira** — Atlassian email + project KAN access level.
- **Drive folder** — email + view/edit; say which folder path.
- **Supabase / product DB** — email + project (`*-db` naming); never paste production secrets in chat.
- **AME admin invites / imports** — say product **AME**, environment, and whether Preview or prod; Elon/Sam route the ticket.

Agents draft the ask; you (or Steve with your approval) send invites when required.

---

## 8. GitHub & Vercel (human view)

- Org: **`krakenlab-it`** (repos: `krakenflow`, `AME`, `simulador-llamadas`, `mewe`, `wellness`, `CoverU`, etc.).
- Vercel team: **`kraken-lab-media`**.
- PR titles: prefer `Product · KAN-###: …`. AME may use `AME #{n}` with KAN in the body when Sam directs.
- One writer per PR/branch; don’t spawn parallel writers on the same branch.

---

## 9. AI stack (what humans should expect)

- Default: **Vercel AI SDK + AI Gateway**; gateway model ids.
- Do **not** push the team to revive per-model provider keys as the primary path.
- Product AI presence (best effort): see [STANDARDS.md](./STANDARDS.md) table (KrakenFlow Gateway chat/Ads Hub; Simulador harness/psych; Wellness coach; MeWe parity; AME imports/invites; CoverU tariffs TBD; others lighter/TBD).

---

## 10. Engagement do / don’t

**Do**

- Put live work in Jira; files in Drive; archive in Notion.
- Smoke Preview before merge (or give explicit GO).
- Name `KAN-###` and product in asks.
- Ask Elon for writers; Steve for coordination.
- Keep EN+ES dated naming on Drive stacks.
- Correct agents when they invent status or spend — that is a hard rule.

**Don’t**

- Treat Notion Status/Due as live.
- Rename Jira project key from KAN (display name only, Sebastian-only).
- Ask Steve to launch CloudAgent writers.
- Expect agents to mint secrets or invent inventory/spend.
- Merge past HOLD without smoke / GO.
- Dump secrets into tickets, Notion, or chat.
- Revive per-model API keys as primary AI config.
- Email-blast humans about every Preview unless you asked for it.

---

## 11. Quick links

| System | Link / id |
|--------|-----------|
| Jira KAN | https://krakenlabmedia.atlassian.net |
| Drive SoT | https://drive.google.com/drive/folders/1F-0hSVJ9UzUuJi5TU5C2s4Yy0Bh4B-tq |
| GitHub | org `krakenlab-it` |
| Vercel | team `kraken-lab-media` |

## When you ask for a feature

Agents must **check GitHub + Jira first** for an open PR/branch or similar ticket before starting new work. They should tell you whether they’ll continue, stack/sub-branch, rebase, or open new — and ask you when it’s ambiguous. Prefer continuing an open stack over a duplicate PR.

