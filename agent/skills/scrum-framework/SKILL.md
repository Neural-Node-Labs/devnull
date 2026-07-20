---
name: scrum-framework
role: Scrum Coach / Framework Reference
description: >
  Reference and coaching knowledge for Scrum — the four roles (Product Owner, Scrum Master,
  Developers, Architect), the five events (Sprint Planning, Daily Scrum, Backlog Refinement,
  Sprint Review, Retrospective), the three artifacts and commitments (Product Backlog/Product
  Goal, Sprint Backlog/Sprint Goal, Increment/Definition of Done), sprint rules, INVEST story
  quality, and Definition of Ready/Done. Load whenever the task involves explaining or coaching
  Scrum roles and accountabilities, running or facilitating a Scrum event, writing or critiquing
  a Sprint Goal or user story, checking a story against INVEST or Definition of Ready/Done,
  evaluating "is this good Scrum" or spotting anti-patterns, or drafting product backlog items,
  acceptance criteria, or facilitation agendas.
triggers: [scrum, sprint, "product backlog", "sprint goal", "user story", "acceptance criteria", invest, "definition of done", "definition of ready", retrospective, "daily scrum", "sprint planning", "sprint review", "product owner", "scrum master"]
version: 1.0
requires_tools: []
composes_with: [scrum-master-agent]
---

# Scrum Framework

Reference knowledge for coaching, explaining, and applying Scrum correctly. Ground every answer in accountability: each role owns exactly one thing and cannot delegate it, each artifact carries exactly one commitment, and every event is a timeboxed inspect-and-adapt opportunity, not a status meeting.

## When to go deeper

- Full role responsibilities, sprint cycle, and event-by-event agendas: `references/roles_and_events.md`
- Artifacts, commitments, DoR/DoD, INVEST, and Scrum anti-patterns: `references/artifacts_and_quality.md`

Read the relevant reference file before writing detailed coaching content (e.g. a full Sprint Planning agenda, a DoD checklist, or an INVEST review) — don't reconstruct these from memory alone, since the specifics (timeboxes, question sets, checklist items) matter.

## Core mental model

**Four roles, one accountability each** (Architect is not a canonical Scrum Guide role but is commonly added in technical/CBD-style teams):
- **Product Owner** — accountable for the *value* of the product. Owns the Product Backlog: content, ordering, clarity. Says what and why, never how.
- **Scrum Master** — accountable for the *effectiveness of the Scrum Team*. Servant-leader: facilitates events, removes impediments, coaches — not a project manager and has no authority over the backlog or the team's work.
- **Developers** — accountable for a *usable Increment* every Sprint. Self-organizing, cross-functional, own the Sprint Backlog and estimation collectively.
- **Architect** (non-canonical, common in technical orgs) — owns the technical blueprint/design decisions and architectural review; not a source of process authority.

No one holds more than one primary accountability, and accountabilities are non-transferable — don't recommend workarounds that blur them (e.g. a Scrum Master accepting stories, or a PO estimating).

**Five events, each with a hard timebox (a maximum, not a target):**
1. Sprint Planning (≤8 hrs/4-wk sprint) — produces the Sprint Goal + Sprint Backlog
2. Daily Scrum (15 min, daily) — inspects progress, replans next 24h; not a status report
3. Backlog Refinement (≤10% of sprint capacity, continuous, not a formal timeboxed event) — gets items to "Ready"
4. Sprint Review (≤4 hrs/4-wk sprint) — demonstrates the *working* Increment, gathers stakeholder feedback
5. Sprint Retrospective (≤3 hrs/4-wk sprint) — produces 1–3 specific, owned improvement actions for the next sprint

**Three artifacts, three commitments:**
| Artifact | Owner | Commitment |
|---|---|---|
| Product Backlog | Product Owner | Product Goal |
| Sprint Backlog | Developers | Sprint Goal |
| Increment | Developers | Definition of Done |

## Non-negotiable sprint rules

- Only the PO can cancel a Sprint, and only if the Sprint Goal becomes obsolete — this is rare.
- No scope changes that endanger the Sprint Goal mid-sprint.
- Sprint length is fixed; never extend to finish late work.
- Unfinished stories return openly to the Product Backlog — never silently carried over.
- If an item doesn't meet the Definition of Done, it is not Done. No partial credit.

## Writing a good Sprint Goal

A Sprint Goal answers "why are we doing this Sprint?" and gives Developers flexibility in *what exactly* they build to get there.
- Good: "Enable customers to check out via Stripe so we can launch payments to beta users."
- Bad: "Complete stories SP-142, SP-144, SP-145, SP-147." (a task list, not a goal — gives no room to adapt)

## Quick answers vs. deep answers

For a simple factual question ("what's the Daily Scrum timebox?", "who owns the Sprint Backlog?") answer directly and briefly from the core mental model above — no need to open the reference files.

For anything requiring a full checklist, agenda, or scored evaluation (drafting a Sprint Planning agenda, checking a story against DoR/DoD, scoring INVEST, listing anti-patterns), open the relevant reference file first so specifics are accurate rather than reconstructed from memory.


# Artifacts, Quality Gates, and Anti-Patterns

## The three artifacts

### Product Backlog — owned by the Product Owner, commitment: Product Goal
The single, ordered list of everything known to be needed in the product. Dynamic — always exists as long as the product does, never "complete." The PO alone is responsible for its content, availability, and ordering.

A good Product Backlog Item (PBI) contains:
- User Story (As a / I want / So that)
- Acceptance Criteria (Given/When/Then)
- Story Points estimate
- Priority / business value
- Epic linkage (if applicable)
- Definition of Ready status

### Sprint Backlog — owned by the Developers, commitment: Sprint Goal
The Sprint Goal, the PBIs selected for the Sprint, and an actionable delivery plan. A highly visible, real-time snapshot of the Developers' plan. Only Developers modify it during the Sprint.

Components: Sprint Goal (the "why") · Selected PBIs (the "what") · Task breakdown ≤1 day each (the "how") · daily updates reflecting actual remaining work · burndown showing progress to goal.

### Increment — owned by the Developers, commitment: Definition of Done
A concrete, usable stepping stone toward the Product Goal. Additive to all prior Increments, verified working. Multiple Increments may be created within a single Sprint. Delivered at Sprint Review, not merely demoed.

Quality gates for an Increment:
- Meets Definition of Done without exception
- All acceptance criteria verified by the PO
- Integrates cleanly with previous Increments
- Deployable to production at any time
- No known defects above the agreed threshold

## Definition of Ready (DoR) — gate before Sprint Planning
A story is Ready when it has: Title · Description · Acceptance Criteria · Estimate · No open questions. Stories that skip this gate derail Sprint Planning.

## Definition of Done (DoD) — gate before a story counts as Done
A formal, team-agreed quality bar. If an item doesn't meet it, it is not Done — no exceptions and no partial credit. A representative DoD:
- Code reviewed and approved
- Unit tests written and passing (commonly ≥80% coverage)
- Integration tests passing
- No new linting or type errors
- Deployed to staging environment
- Acceptance criteria verified by the PO

When reviewing a real story against DoD, list the specific unmet items rather than a pass/fail verdict — e.g. "missing: integration tests, staging deploy" is actionable; "not Done" is not.

## The Three Commitments

- **Product Goal** — commits the team to a long-term vision (backs the Product Backlog).
- **Sprint Goal** — commits the team to what they'll achieve this Sprint (backs the Sprint Backlog).
- **Definition of Done** — commits the team to the quality standard applied to every Increment.

These give the artifacts context and prevent misinterpretation — Scrum's transparency only works if all three are explicit and shared.

## INVEST — evaluating story quality

Score each criterion individually rather than giving one aggregate pass/fail; name the specific gap.

- **Independent** — can be built and delivered without hard dependency on another unscheduled story
- **Negotiable** — describes outcome, not a rigid spec; room for the how to be worked out
- **Valuable** — delivers value to a user or the business, not just a technical task
- **Estimable** — the team has enough clarity to size it
- **Small** — fits comfortably within a single Sprint (common flag: >13 points signals a split is needed)
- **Testable** — has clear, verifiable acceptance criteria (Given/When/Then is the standard structure)

When a story fails a criterion, suggest a concrete rewrite rather than just naming the failure — e.g. for a missing Testable criterion: draft the Given/When/Then acceptance criteria yourself as a starting point.

## Common Scrum anti-patterns to watch for and name

- **Zombie sprints** — sprints that continue in form (events happen) but have lost real inspect-and-adapt substance; teams go through the motions without changing behavior based on what they learn.
- **Sprint padding** — inflating estimates or scope to guarantee an easy "success," which erodes the value of velocity as a planning signal.
- **Cargo-cult Scrum** — following the mechanics (standups, sprints, boards) without understanding or honoring the underlying purpose (transparency, inspection, adaptation).
- **Silent carryover** — unfinished work rolling to the next sprint without being explicitly returned to and re-prioritized in the Product Backlog.
- **Status-report Daily Scrum** — reporting to a manager instead of replanning as a team.
- **PO absentee** — Developers making value/priority calls the PO should own, or accepting their own work.
- **Scope creep endangering the Sprint Goal** — adding work mid-sprint without evaluating impact on the committed goal.
- **Task-list Sprint Goals** — a Sprint Goal that's just an enumerated list of ticket IDs, giving no flexibility or "why."

## Scaled Scrum (brief context only)

For organizations running multiple Scrum teams on one product, common scaling frameworks include **Nexus**, **LeSS** (Large-Scale Scrum), and **SAFe** (Scaled Agile Framework). These add cross-team coordination events and roles on top of — not instead of — the core Scrum framework above. Give only a brief pointer unless the user specifically wants scaling guidance; the core framework applies at the single-team level regardless.




# Roles, Sprint Cycle, and Event Detail

## Roles — full responsibility lists

### Product Owner — Value Maximiser
The single voice of the customer. Owns the Product Backlog's content, ordering, and clarity.
- Define and communicate the Product Goal
- Create, refine, and order Product Backlog Items
- Write acceptance criteria for every story
- Accept or reject completed Sprint work (formal acceptance is the PO's alone)
- Manage stakeholder expectations and feedback
- Prioritise by business value, risk, and dependencies
- Attend Sprint Review and provide direction
- Ensure the backlog is transparent and understood by everyone

### Scrum Master — Process Guardian
The servant-leader. Coaches on Scrum, removes impediments, protects team focus. Not a project manager.
- Facilitate all five Scrum events
- Remove blockers and impediments daily
- Coach the team on Scrum theory and practice
- Protect the team from external interruptions
- Coach the PO on backlog management
- Identify and escalate organisational impediments
- Track sprint health and surface risks early
- Foster a culture of continuous improvement

### Developers — Increment Builders
Anyone who creates any aspect of a usable Increment — not just coders; testers, designers, analysts are Developers in Scrum. Own the Sprint Backlog collectively.
- Create the Sprint Backlog plan in Sprint Planning
- Deliver a Done Increment each Sprint
- Adapt the daily plan at the Daily Scrum
- Hold each other accountable as professionals
- Refine Product Backlog items with the PO
- Estimate stories using the team's agreed pointing scale
- Uphold the Definition of Done
- Collaborate — no silos within the team

### Architect — Technical Authority (non-canonical but common in technical orgs)
Owns the blueprint, makes technical design decisions, reviews stories for architectural compliance.
- Produce and maintain the Master Blueprint
- Review all architectural components for compliance
- Define and approve all interface/schema contracts
- Write Architecture Decision Records (ADRs)
- Identify and schedule technical debt stories
- Advise on risk levels for components
- Set and enforce the technical-quality bar within Definition of Done
- Lead Sprint Planning discussion for technical stories

## The Sprint Cycle (heartbeat of Scrum)

A Sprint is a fixed-length container (≤1 month, commonly 2 weeks) holding all other events and all the work. You cannot skip a Sprint or extend one without effectively starting over.

| Day | Event | Purpose |
|---|---|---|
| Day 1 | Sprint Planning | Select stories, define Sprint Goal, create Sprint Backlog |
| Days 2–N | Development | Daily Scrum each morning; build, test, integrate daily |
| Every day | Daily Scrum | 15-min sync: inspect progress, adapt next-24h plan |
| Mid-sprint | Backlog Refinement | PO + Devs sharpen upcoming stories, re-estimate |
| Last day | Sprint Review | Demo the Done Increment to stakeholders |
| Last day | Retrospective | Team reflects on process, plans improvements |

There is no gap between sprints — the day after the Retrospective is Day 1 of the next Sprint.

## Event-by-event detail

### 1. Sprint Planning — ≤8 hrs / 4-week sprint
Answers three questions: *Why* is this Sprint valuable? *What* can be Done? *How* will it get Done?
- **Attends:** PO, Scrum Master, all Developers, Architect (if role exists)
- **Outputs:** Sprint Goal, Sprint Backlog, initial task breakdown
- **Sample agenda (2-week sprint, 4 hrs total):**
    1. 0:00–0:30 — PO presents Sprint Goal and top backlog items
    2. 0:30–1:00 — Team reviews capacity (leaves, meetings, last velocity)
    3. 1:00–2:30 — Team selects items, clarifies acceptance criteria with PO
    4. 2:30–3:30 — Developers break selected items into tasks (≤1 day each)
    5. 3:30–4:00 — Confirm Sprint Goal wording, finalize Sprint Backlog

### 2. Daily Scrum — 15 minutes, every day
For Developers, to inspect progress toward the Sprint Goal and adapt the next 24 hours. Not a status report to management.
- **Attends:** all Developers; Scrum Master optional
- **Format:** classic 3-question format, or "walk the board" — team's choice
- **Three questions:** (1) What did I complete yesterday that contributed to the Sprint Goal? (2) What will I work on today? (3) Any impediment blocking me or the team?
- **Common mistake to flag:** treating the Daily Scrum as the only sync point. Deep problem-solving belongs in separate "after-standup" sessions with only the people who need to be there.

### 3. Backlog Refinement — ≤10% of sprint capacity, ongoing
Not a formal timeboxed Scrum event, but essential. Adds detail, estimates, and order to backlog items. Stories entering Sprint Planning without being "Ready" derail the meeting.
- **Attends:** PO, key Developers, Architect
- **Definition of Ready:** Title, Description, Acceptance Criteria, Estimated, No open questions
- **Activities:** Split (break stories >13 pts into independently deliverable pieces), Clarify (PO answers open questions), Estimate (Planning Poker or relative sizing), Order (PO re-orders by value/risk/dependencies)

### 4. Sprint Review — demonstrate the Increment
Team demonstrates all Done stories to stakeholders on the last day. Working software only — no slides, no "almost done." Stakeholders interact with the product and give feedback; PO updates the Product Backlog based on what's learned. This is the inspect-and-adapt loop for the *product*.
- **Attends:** whole team, PO hosts, stakeholders
- **Outputs:** stakeholder feedback, updated Product Backlog, revised Product Goal

### 5. Sprint Retrospective — continuous improvement
Immediately after the Review, the team reflects on how they worked (not what they built). SM facilitates. Output is 1–3 specific, actionable improvements with named owners, added to the very next Sprint Backlog. Closes the inspect-and-adapt loop for the *process*.
- **Attends:** whole team, SM facilitates
- **Outputs:** improvement action items, updated team agreements

## Workflow through a story's life (board states)

`To Do → In Progress → In Review → Done`

- **Code Review / peer or architectural gate:** when a task is marked Done, a peer (and, in technical orgs, an Architect) review is triggered before it can advance. A failed check sends the task back to In Progress.
- **Definition of Done verification:** before a story moves to Done on the board, the full DoD is checked. The PO verifies acceptance criteria — this is formal acceptance, not just a technical check. A story not meeting DoD returns to In Progress.
