# KrakenLabMedia — Engagement Standards (Index)

**Audience:** Everyone (humans + agents). Short map of systems and product AI presence.  
**Detail docs:** [HUMAN.md](./HUMAN.md) · [AGENT.md](./AGENT.md) · [GROKBOT.md](./GROKBOT.md)  
**Company:** KrakenLabMedia / Kraken Lab  
**Encoded:** Sep–Oct 2026 operating norms

---

## Systems map

| System | Role | Naming |
|--------|------|--------|
| **Jira KAN** | Ticket SoT (ONE board) | Epic = product; Task titles `Product · …`; key stays **KAN**. Display rename to KrakenLab = Sebastian-only in Project settings. Board: https://krakenlabmedia.atlassian.net |
| **Drive** | File / docs SoT | `00 Global` (Admin, Brand, Finance, Legal, …) then `01–07` product folders; dated stacks **EN+ES**. Root: https://drive.google.com/drive/folders/1F-0hSVJ9UzUuJi5TU5C2s4Yy0Bh4B-tq |
| **GitHub `krakenlab-it`** | Code SoT | PR titles prefer `Product · KAN-###: …`; repos e.g. `krakenflow`, `AME`, `simulador-llamadas`, `mewe`, `wellness`, `CoverU` |
| **Vercel `kraken-lab-media`** | Deploy / Preview | Project names per product; HOLD merges until Sebastian Preview smoke or explicit GO |
| **Notion Command Center** | **ARCHIVE only** | No live Status/Due. Label pointers `[ARCHIVE Notion]`. Live work stays in Jira + Drive |
| **Supabase** | Data | `*-db` project naming pattern |

---

## Where these rules live

| Location | Use |
|----------|-----|
| **Repo root** `HUMAN.md` `AGENT.md` `GROKBOT.md` `STANDARDS.md` | Code agents + PR reviewers (do not bury under `docs/`) |
| Drive `00 Global/Admin` | Human + contractor SoT copy |
| Jira [KAN-116](https://krakenlabmedia.atlassian.net/browse/KAN-116) (Ops epic KAN-12) | Ticket discoverability + Drive links |
| Notion | Archive pointer only — do not treat as live SoT |

Product Specs template: Drive `00 Global/Admin`. Drive copy is SoT; repo `docs/PRODUCT.md` is a **pointer only**.

---

## Agents (lanes)

| Agent | Lane |
|-------|------|
| **Steve** | CEO / coordination — never launches CloudAgent writers |
| **Sam** | PM / tickets (Jira KAN) |
| **Elon** | CTO / code / writers — launches CloudAgent writers |
| **Warren** | CFO / spend |
| **Ilya** | AI science |
| **Tim** | Creative |
| **Ada** | Ads platforms advice |
| **Mike** | Data |
| **Sentinel** | Read-only drift |

**Hard rule:** One CloudAgent writer per PR/branch. Elon launches; Steve never launches writers. HOLD merges until Sebastian Preview smoke / explicit GO.

---

## Per-product AI presence (best effort)

| Product | AI presence |
|---------|-------------|
| **KrakenFlow** | AI Gateway chat/bg, Ads Hub, agent messenger drafts |
| **Simulador** | AI SDK harness, psych, long-chat |
| **Wellness** | AI SDK coach |
| **MeWe** | Parity port |
| **AME** | Imports, admin invites, portal |
| **CoverU** | Tariffs/data; AI TBD |
| **Dominion Ark** | Lighter / TBD |
| **Golf-Go** | Lighter / TBD |
| **She Gets Grants** | Lighter / TBD |

**AI default stack:** Vercel AI SDK + AI Gateway; use gateway model ids. Do **not** revive per-model provider keys as primary.

---

## Non-negotiables (all audiences)

| **Lookup-first** | Before feature work: check open PRs/branches (gh) + similar KAN tickets; then continue / sub-branch / rebase / new — ask if ambiguous. No parallel writers for the same feature. |
- Never invent spend, ticket status, GitHub facts, or inventory.
- Real CI fixtures / content-based parsers OK; bad-data ≠ schema.
- Migration MS/AWS → Workspace/GCP: **console-HOLD** until Sebastian inventory.
- Secrets/consoles: humans own minting and invites; agents never claim to mint secrets.
- Quiet when nothing to report; no spam Preview emails unless asked.
