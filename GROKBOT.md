# KrakenLabMedia — Grok Bot / Cursor Bot Operating Rules

**Audience:** Operating Grok Bot and Cursor bots in this workspace (executor + parent agents, routines, chat).  
**Company:** KrakenLabMedia / Kraken Lab  
**Companion docs:** [STANDARDS.md](./STANDARDS.md) · [HUMAN.md](./HUMAN.md) · [AGENT.md](./AGENT.md)  
**Encoded:** Sep–Oct 2026

---

## 1. Engagement map

| Doc | Who | Purpose |
|-----|-----|---------|
| **HUMAN.md** | Sebastian, Jaime, contractors | How humans work with agents, Preview smoke, Drive/Jira/Notion, secrets |
| **AGENT.md** | Steve / Sam / Elon / writers / other lanes | Lanes, SoT, PR HOLD, AI stack, quiet rules |
| **GROKBOT.md** (this file) | Grok Bot / Cursor bots in-workspace | Routines vs chat, fan-out, email drafts, box vs machine, silence |
| **STANDARDS.md** | Everyone | Short systems + AI presence index |

Read AGENT.md for lane/SoT detail; this file is **how the bot operates** those rules.

---

## 2. Where these three files live

Publish / mirror as needed (same content):

| Location | Notes |
|----------|--------|
| **Repos** — **root** `HUMAN.md` `AGENT.md` `GROKBOT.md` `STANDARDS.md` | For code agents + PR reviewers under `krakenlab-it` (do not bury under `docs/`) |
| **Drive** `00 Global/Admin` | Human + contractor SoT copy |
| **Jira** | Link from Ops epic (discoverability) |
| **Notion** | **Archive pointer only** — do not make Notion the live home for these rules’ Status |

Workspace copy for bots: `/workspace/engagement-rules/` (`HUMAN.md`, `AGENT.md`, `GROKBOT.md`, `STANDARDS.md`).

---

## 3. Routines vs chat

| Mode | Use for | Don’t use for |
|------|---------|----------------|
| **Chat / delegated task** | One-off asks, investigations, drafts, ticket updates Sam requested, PR review help | Unsolicited fan-out to every agent |
| **Routines / scheduled** | Drift checks (Sentinel), agreed standup digests Steve asked for | Inventing new recurring email; Preview spam |

If a routine finds **nothing** material: **stay silent** (no “all clear” spam unless Steve configured an explicit heartbeat).

---

## 4. SendToAgent vs fan-out

- Prefer **SendToAgent** (or equivalent single-target handoff) to the **owning lane**: Sam for tickets, Elon for code/writers, Warren for spend questions, etc.
- **Do not fan-out** the same ask to Steve + Elon + Sam + writers by default.
- Steve coordinates; **Steve never launches CloudAgent writers** — route writer launches to **Elon**.
- One CloudAgent writer per PR/branch; if a writer is already on it, stop and report — don’t spawn another.

Handoff payload should include: product, `KAN-###` (if any), goal, SoT links, HOLD/Preview constraint.

---

## 5. Draft-before-send email

Irreversible / externally visible sends (email, Slack-as-user, tickets that notify broadly) need **explicit user approval**.

- **Draft first:** recipients, subject, body — put the full draft in the result for the parent / Sebastian.
- Do **not** send via Gmail/Resend/Slack/etc. unless Sebastian (or the user named in the task) explicitly asked for **that** send.
- Prefer parent `DraftExternalMessage` path when speaking as Sebastian under connected accounts.
- Never invent CC lists or “FYI all contractors” blasts.

---

## 6. Preview email silence rules

- Default: **no email** when a Preview is ready. Report Preview URL in-agent / on the PR / to Steve-Elon channel the team already uses.
- Email about Preview **only** when Sebastian (or an explicit human ask) requested it.
- Never batch-email humans for routine CI green or “still on HOLD.”

Merges remain **HOLD** until Sebastian Preview smoke or explicit GO (see AGENT.md / HUMAN.md).

---

## 7. When to stay silent

Stay silent when:

- No status change, no blocker, no completed deliverable.
- Routine drift check is clean and no one asked for a heartbeat.
- Preview is ready but no one asked for email (in-band report only if the active thread expects it).
- You would only repeat “waiting on Sebastian smoke.”

Speak when:

- Blocker, decision needed, security/secret issue, HOLD violated, second writer conflict, or a deliverable is ready for human action.

---

## 8. Box vs user computer

| Surface | Use |
|---------|-----|
| **Box** (`/workspace`, Shell/Read without machineId) | Scratch, generated markdown, clones for analysis, browser isolation — shared machine FS across agents; per-agent desktop |
| **User registered computer** (ListMachines + machineId) | Only when the task needs their local files/apps; requires approval for local tools |
| **CopyToBox / CopyFromBox** | Move files across; never assume a box path exists on the user’s disk |

Do not claim a path on the box is on Sebastian’s laptop. Do not run destructive local commands without clear task scope + approval norms.

---

## 9. Secrets — never claim minting

- Never claim you minted API keys, rotated secrets, or created console access.
- Never paste production secrets into chat, tickets, Notion, or Drive docs.
- For invites (Vercel `kraken-lab-media`, GitHub `krakenlab-it`, Jira KAN, Drive, Supabase `*-db`): state **what** invite is needed; humans mint/approve.
- MS/AWS → Workspace/GCP: **console-HOLD** until Sebastian inventory — no fake inventory lists.

---

## 10. SoT reminders for bot actions

| Action | Write to |
|--------|----------|
| Ticket status / Due | Jira KAN only |
| Specs / decks / admin docs | Drive (`00 Global` / product folders); dated EN+ES |
| Code / PR | GitHub `krakenlab-it`; title `Product · KAN-###: …` (AME `AME #{n}` + KAN in body when Sam directs) |
| Deploy / Preview | Vercel `kraken-lab-media`; HOLD merge |
| Historical notes | Notion with `[ARCHIVE Notion]` — never live Status |

Product Specs: Drive SoT; `docs/PRODUCT.md` pointer only.

---

## 11. AI stack (bot implementation)

- Prefer **Vercel AI SDK + AI Gateway** and gateway model ids in code changes.
- Do not reintroduce per-model provider keys as primary config.
- Align with product AI presence in STANDARDS.md (KrakenFlow Gateway/Ads Hub; Simulador harness; Wellness coach; MeWe parity; AME imports/invites; CoverU TBD; others lighter).

---

## 12. CI / fixtures (bot)

- Real fixtures OK; content-based parsers OK.
- Bad-data ≠ schema — don’t “green” CI by lying about types.
- Don’t invent GitHub check conclusions; read checks/PR state.

---

## 13. Stop conditions (bot)

Stop and report rather than workaround when:

- Auto-review blocks a tool — escalate honest same-action approval or safer lower-privilege path; never cookie/token scraping.
- Writer already on branch; Steve asked to launch a writer (redirect to Elon).
- Merge requested without smoke/GO.
- Task requires inventing spend/status/inventory.
- Email send without explicit approval — draft only.

---

## 14. Quick operating checklist

1. Identify product + `KAN-###` + owning lane.
2. Read/write the correct SoT (Jira / Drive / GitHub / Vercel) — Notion archive only.
3. One writer; Elon launches; HOLD merge.
4. Draft email; don’t send unless asked.
5. Silent if nothing; no Preview email spam.
6. Never invent facts; never claim secret minting.
7. Point humans to HUMAN.md; agents to AGENT.md; keep STANDARDS.md as the index.

## Lookup-first before eng dispatch

Before briefing Elon or filing with Sam for a feature: require (or perform) a **live gh + Jira lookup** for open PRs/branches and similar tickets. Include findings in the brief. Default recommendation order: continue → sub-branch/stack → rebase → new. Never fan out a second writer on a parallel branch for the same feature.

