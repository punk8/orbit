# Orbit Complete Product Shape Memo

Date: 2026-05-22
Updated: 2026-05-23 against `main` at `be7f373`

This memo records the intended complete product shape for Orbit and the current distance from that
shape. It is a product checkpoint, not an implementation plan.

## One Sentence

Orbit should become a local-first personal work-context continuity system: it quietly observes
authorized work signals, turns fragmented activity into traceable knowledge, lets the user govern
durable memory, and produces concise handoff context for daily review and future agents.

It should not become a screenshot search tool, a generic notes app, or a Codex-only helper.

## Final User Workflow

### 1. First Launch And Trust Setup

The user installs Orbit, chooses language and local storage, and configures privacy boundaries before
any meaningful collection starts.

Each source must explain:

- what it reads;
- whether raw payloads are stored;
- whether it can be used for AI;
- whether it can be exported to agents;
- how the user can pause, delete, or reconfigure it.

The product should make the trust boundary visible before asking for high-risk permissions like
Screen Recording, Accessibility, microphone, or external AI provider access.

### 2. Normal Work Happens Outside Orbit

The user keeps working in their normal tools. Orbit runs in the background and observes authorized
signals from sources such as:

- Codex, Claude Code, or generic local agent sessions;
- approved chat imports;
- desktop app/window/activity observation;
- screen or window OCR when explicitly enabled;
- future calendar, mail, docs, Jira, GitLab, and local project folders.

The user should not need to manually write logs. Orbit should collect enough context to reconstruct
work without becoming noisy or invasive.

### 3. Events Become Activity

Orbit normalizes all source inputs into Events, then groups them into Activity Sessions such as:

- "Fixed Settings secondary-page scrolling";
- "Validated real screen/OCR capture";
- "Discussed Handoff as the first killer feature";
- "Merged and verified main branch";
- "Debugged provider configuration failure".

Activity answers: what happened, when, in which app/project/source, and with what evidence.

### 4. Activity Becomes Reviewable Knowledge

Orbit drafts Knowledge Artifacts from Activity Sessions. These are human-readable work notes:

- daily brief;
- weekly review;
- decision record;
- debugging recap;
- project context;
- meeting or discussion summary;
- follow-up list.

The user can edit, confirm, reject, archive, search, and copy these artifacts. Every important claim
must link back to source evidence.

### 5. Knowledge Becomes Governed Memory

Confirmed Knowledge can generate smaller Memory candidates. Memory should capture durable facts, not
raw history:

- project facts;
- user preferences;
- stable decisions;
- recurring workflow patterns;
- common issues;
- durable domain knowledge.

Memory must remain smaller and more stable than Knowledge. Candidate Memory should not become default
agent context until confirmed by the user or by a clearly documented trusted policy.

### 6. Orbit Gives Attention And Recommendations

Orbit can proactively surface:

- unfinished follow-ups;
- repeated blockers;
- risky missing context;
- conflicting or stale decisions;
- opportunities to create a cleaner handoff;
- review items that should be confirmed before future work.

Recommendations must be explainable and evidence-backed. Accepting a recommendation should record
intent only unless a future explicit automation permission model exists.

### 7. Handoff Warms Up Humans And Agents

When the user returns the next day or starts a new agent session, Orbit produces a Handoff Pack with:

- objective;
- current state;
- recent Activity;
- confirmed Knowledge;
- active Memory;
- decisions;
- blockers and risks;
- recommended next actions;
- safety boundaries;
- evidence index;
- explicit exclusions.

If the pack is empty or partial, Orbit must explain why: draft Knowledge, unconfirmed Memory, missing
evidence, secret content, failed redaction, or source export policy.

The core user benefit is: the user should not need to re-explain "what I was doing, why I was doing
it, what already happened, and what the next agent should know."

## Internal Processing Model

The stable product pipeline should remain:

```text
Source Adapter
-> Event
-> Activity Session
-> Knowledge Artifact
-> Memory
-> Recommendation
-> Handoff / Agent Interface
```

### Source Adapter

Adapters only collect and label source-specific inputs. They should not own product semantics.
Codex, SeaTalk, screen/OCR, calendar, mail, Jira, GitLab, filesystem, and browser integrations are
replaceable input channels.

### Event Ingestion

Ingestion normalizes source data into Event schema, including source pointer, timestamp, app/window,
project, participants, sensitivity, redaction state, retention, AI eligibility, and agent-export
eligibility.

### Privacy And Policy Layer

Before any derived object is generated, every Event must pass through local policy:

- redaction;
- raw storage minimization;
- protected app filtering;
- AI-use gate;
- agent-export gate;
- retention and deletion policy;
- audit logging.

This layer is central to user trust.

### Activity Session Builder

The session builder groups related Events by time, source, app, project, thread, and continuity. It
solves "what happened" without turning every observation into Memory.

### Semantic Pipeline

The semantic pipeline deduplicates, cleans OCR/accessibility text, classifies work type, indexes for
search, generates summaries, identifies decisions/blockers/follow-ups, and keeps evidence links.

### Knowledge Drafting

Knowledge drafting turns Activity into reviewable Markdown/JSON artifacts. It may use deterministic
local logic, local models, or user-configured external providers, but provider output must remain
evidence-bound and reviewable.

### Memory Extraction

Memory extraction should prefer confirmed Knowledge. It should create compact durable facts, not
mirror full Knowledge documents.

### Recommendation Engine

Recommendations should rank by evidence strength, impact, freshness, unresolved state, and user
preference. No recommendation should appear without evidence.

### Handoff Builder

Handoff composes only safe, confirmed, export-allowed context. It is a product output, not a source
of truth. It must preserve traceability and make exclusions visible.

## Current State Snapshot

As of this memo, Orbit has moved past a pure engineering prototype. It has a working Alpha skeleton:

- TypeScript/pnpm monorepo;
- SQLite local store;
- unified Event, Activity, Knowledge, Memory, Recommendation, and Handoff objects;
- CLI and Electron desktop shell;
- Chinese/English UI layer;
- explicit Codex/local-agent ingestion paths;
- approved-import SeaTalk path;
- background runtime scheduler with per-source intervals, pause/disable state, backoff, audit, and
  local resource policy controls;
- Tier 1 desktop app/window observation with dedupe and protected-source safety rules;
- privacy permission scopes;
- manual screen/OCR capture path;
- Activity detail with evidence;
- Knowledge and Memory review flows;
- Handoff pack generation with explicit exclusion reasons;
- read-only CLI agent resources for handoff, today context, and status;
- OpenAI-compatible Knowledge provider configuration;
- local-first audit and data operations.

The latest real flows that are now possible:

```text
Background runtime
-> desktop app/window Events
-> Activity Session
-> safe Handoff evidence pointers
```

```text
Manual screen/OCR capture
-> screen/ocr Events
-> Activity Session
-> Knowledge draft
-> confirmed Knowledge
-> Memory candidates
-> confirmed Memory
-> Handoff Pack
```

Default Handoff correctly excludes perception-derived context until screen/OCR source policy allows
agent export.

## Distance From Complete Product

Overall, Orbit is about **38% of the way to the complete product shape**.

It is stronger as an architecture and developer-dogfood Alpha than as a daily end-user product.
Another way to say it:

- technical spine: roughly 65-70%;
- product loop coherence: roughly 48%;
- real daily usefulness for a normal user: roughly 28-32%;
- full complete-product readiness: roughly 38%.

## Gap Assessment By Layer

| Layer | Current maturity | Why |
| --- | ---: | --- |
| Product concept | 75% | The Activity -> Knowledge -> Memory -> Handoff shape is now clear and written down. |
| Local data spine | 70% | SQLite, schema, repositories, migrations, audit, and core object model exist. |
| Privacy/policy foundation | 55% | Permission scopes, raw minimization, redaction, AI/export gates exist, but user-facing governance is incomplete. |
| Source setup | 40% | Explicit Codex/local-agent and approved imports exist; setup UX and real-world source health are still thin. |
| Background observation | 45% | Scheduler, source state, backoff, audit, local budgets, and Tier 1 app/window observation now exist; continuous high-quality semantic observation is still not mature. |
| Screen/OCR perception | 30% | Manual capture works; continuous scoped capture, OCR cleanup, protected-app handling, and review ergonomics are early. |
| Activity | 50% | Sessions and detail evidence exist, but grouping quality and rebuild/governance are still basic. |
| Knowledge | 40% | Draft/review flow exists; generated quality, Chinese output, artifact types, and editing depth are not product-grade. |
| Memory | 35% | Candidate/confirm/search exists; long-term governance, versioning, supersession, and quality controls are weak. |
| Recommendations | 25% | Basic recommendation objects exist; real ranking, evidence quality, and useful proactive behavior are immature. |
| Handoff | 60% | Today/project packs, Markdown/JSON, UI preview, exclusions, and read-only CLI agent resources exist; MCP/local HTTP and real external agent consumption are still missing. |
| Desktop UX | 35% | Core pages exist; onboarding, empty states, source setup, review ergonomics, and status explanation need product polish. |
| AI provider layer | 40% | OpenAI-compatible Knowledge drafting exists; provider abstraction for OCR cleanup, memory, recommendation, and local models is incomplete. |
| Distribution | 25% | Build/package/smoke exists; signing, notarization, updates, clean-machine onboarding, and support bundle are missing. |

## Biggest Missing Product Capabilities

### 1. Real Continuous Context Capture

Orbit still does not reliably understand a user's day in the background. Manual screen/OCR capture is
a useful proof, but the complete product needs a low-risk continuous observation loop with clear
state, permissions, protected apps, and useful event quality.

### 2. Source Onboarding That A Normal User Can Complete

The product still assumes a developer can provide explicit paths and understand adapters. A complete
product needs guided setup, health checks, sample previews, permission explanation, and repair flows.

### 3. High-Quality Knowledge Generation

Knowledge is structurally present, but often too raw, noisy, or English-heavy. Complete Orbit needs
better artifact types, Chinese-first generation, OCR cleanup, provider routing, editing UX, and
evaluation gates.

### 4. Serious Memory Governance

Memory should become Orbit's durable value layer. Today it is mostly candidate extraction and review.
The complete product needs version history, supersession, validity dates, conflict detection,
project scoping, stale-memory review, and better search/retrieval.

### 5. Useful Recommendations

Recommendations should feel like "Orbit noticed something I would otherwise miss." Today they are
more like pipeline proof objects. Ranking, evidence standards, snooze/due behavior, and recurring
pattern detection need substantial work.

### 6. Agent Interface Beyond Copy/Paste

Handoff is the most complete product output, but it is still mostly CLI/Desktop preview. Complete
Orbit needs a read-only local API, MCP server, and possibly Skill wrappers so agents can request
authorized context directly.

### 7. End-User Reliability And Distribution

The current app is not yet something a non-developer can install and trust daily. Signing,
notarization, automatic updates, clean-machine onboarding, diagnostics, local data repair, and
support bundle are still required.

## What This Means

Orbit is no longer just a mock-data prototype. The key product loop exists and can be dogfooded.

But the product is not yet "daily-life useful" because the hardest parts are not the object model;
they are:

- collecting real work context continuously and safely;
- turning noisy observations into useful Knowledge;
- keeping Memory small, correct, and governed;
- making Handoff instantly useful to real agents;
- giving users enough trust and control to leave Orbit running.

The next stage should optimize for proving daily usefulness, not adding more abstract platform
surface. The most important product question is:

> After one normal workday, can Orbit produce a reviewable, evidence-backed summary and a useful
> agent handoff that saves the user from re-explaining their context?

If the answer is consistently yes, Orbit enters true daily-use Alpha.
