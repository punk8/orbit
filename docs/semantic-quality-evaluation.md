# Semantic Quality And Evaluation

## Purpose

Orbit's value depends on the quality of derived objects, not the volume of raw data. This document
defines quality standards, evaluation fixtures, and release gates for Activity, Knowledge, Memory,
Recommendation, Handoff, search, and AI provider behavior.

## Quality Principles

- Evidence beats fluency: a polished summary without traceable evidence is a failure.
- Memory must be sparse: durable Memory should be smaller, more stable, and more reusable than
  Knowledge.
- Recommendations must be useful and explainable: each one needs evidence, confidence, impact, and
  a suggested action.
- Deterministic fallback is required: the product must still work when external AI is disabled.
- User review protects trust: generated objects must remain editable and rejectable.
- Chinese is first-class: evaluation must include Chinese and mixed-language inputs.

## Evaluation Corpus

Maintain a versioned fixture corpus under `fixtures/` or a future `evals/` directory.

Required scenario sets:

- Single-day engineering work.
- Background desktop observation with app/window focus changes.
- Accessibility or filesystem observation with protected-app exclusions.
- Cross-day project continuation.
- Debugging or incident recap.
- Meeting/discussion summary.
- Chat follow-up extraction.
- Repository/CI failure context.
- Calendar plus meeting notes.
- Mail or docs import with confidential content.
- Screen/accessibility observation with redaction.
- Chinese-only workflow.
- Mixed Chinese/English workflow.
- Malformed source records.
- Secret/token redaction.
- Source export blocked.

Each scenario must include:

- Input records.
- Expected Event count and key source pointers.
- Expected Activity grouping.
- Expected Knowledge outline.
- Expected Memory candidates.
- Expected Recommendations.
- Expected Handoff inclusion/exclusion reasons.
- Sensitivity and policy expectations.

## Task-Level Quality Contracts

### Event Classification

Inputs:

- Normalized Event content and metadata.

Outputs:

- Topics, entities, intent, confidence, and optional structured labels.

Quality requirements:

- Do not classify content hidden by failed redaction.
- Do not infer sensitive facts beyond available evidence.
- Preserve deterministic source metadata.
- Confidence must decrease when content is sparse or redacted.

Metrics:

- Label precision/recall on fixture labels.
- Secret handling correctness.
- No classification for blocked content.

### Activity Session Grouping

Inputs:

- Events sorted by time.

Outputs:

- Activity Sessions with event IDs, title, time window, project, apps, source kinds, sensitivity,
  summary, and evidence.

Quality requirements:

- Group related events by time, project, repository, thread, conversation, app overlap, and source
  continuity.
- Avoid merging unrelated projects only because they happened close together.
- Use app/window/source continuity from background observation, but avoid treating passive focus
  changes as durable work by themselves.
- Avoid over-splitting one continuous task into many tiny sessions.
- Keep grouping reproducible.
- Preserve review state when sessions are rebuilt.

Metrics:

- Pairwise grouping F1 over fixture labels.
- Split/merge error count.
- Sessions without evidence count must be zero.
- Rebuild idempotency must pass.

### Activity Summarization

Inputs:

- Activity Session and safe Events.

Outputs:

- Short factual summary with evidence references.

Quality requirements:

- Mention concrete work, not generic activity.
- Include app/project/thread signals when useful.
- Avoid raw private payloads when source policy blocks them.
- Show low-confidence or sparse evidence explicitly.

Metrics:

- Evidence coverage ratio.
- Unsupported claim count.
- Summary length budget.
- Privacy-policy violation count.

### Knowledge Drafting

Inputs:

- Activity Sessions, safe Event excerpts/summaries, confirmed relevant Memory, target language, and
  source policies.

Outputs:

- Knowledge Artifact draft with title, type, description, key insights, decisions, blockers,
  follow-ups, Markdown, evidence, confidence, and provider metadata.

Quality requirements:

- Output must match the schema.
- Every key insight, decision, blocker, and follow-up should have evidence.
- Draft must separate facts, decisions, blockers, and next steps.
- Generated text must follow the requested language.
- If external AI fails, deterministic fallback must produce a usable draft.
- Drafts must start unconfirmed.

Metrics:

- Schema validity.
- Evidence-backed claim ratio.
- Unsupported claim count.
- Decision/follow-up extraction precision.
- Target language adherence.
- Fallback success rate.

### Memory Candidate Extraction

Inputs:

- Confirmed Knowledge Artifacts and existing Memory.

Outputs:

- Small Memory candidates with kind, title, body, scope, tags, evidence, confidence, and status.

Quality requirements:

- Extract durable facts, preferences, decisions, patterns, common issues, or domain knowledge.
- Do not copy the whole Knowledge markdown.
- Do not create candidates from rejected Knowledge.
- Avoid duplicates and near-duplicates.
- Detect supersession when a newer fact replaces an older one.
- Default status is `needs_review`.

Metrics:

- Candidate precision.
- Duplicate rate.
- Average candidate length.
- Confirmed-Knowledge-only rule correctness.
- Supersession detection accuracy.

### Recommendation Generation And Ranking

Inputs:

- Events, Activity Sessions, Knowledge, Memory, user actions, and source policies.

Outputs:

- Recommendations with type, title, explanation, suggested action, confidence, impact, status,
  due/snooze metadata, and evidence.

Quality requirements:

- Every recommendation must have evidence.
- No recommendation may execute side effects.
- Suggested action must be specific and feasible.
- Ranking should prioritize high-impact, recent, unresolved, evidence-backed items.
- Dismissed/resolved recommendations must not reappear unless new evidence exists.
- Snoozed recommendations must remain hidden until due.

Metrics:

- Evidence coverage.
- Duplicate recommendation rate.
- Terminal-state recurrence count.
- Accepted/dismissed ratio in dogfood data.
- Ranking nDCG or human preference score on fixture sets.

### Handoff Selection And Compression

Inputs:

- Activity, confirmed Knowledge, confirmed Memory, active Recommendations, event safety map, and
  scope.

Outputs:

- Handoff Pack Markdown/JSON.

Quality requirements:

- Include only safe, exportable, evidence-backed objects by default.
- Exclude draft Knowledge and unconfirmed Memory by default.
- Include exclusion reasons.
- Keep output concise enough for agent context injection.
- Preserve evidence index.
- Include safety boundaries.

Metrics:

- Unsafe inclusion count must be zero.
- Missing required section count must be zero.
- Evidence index coverage.
- Pack token/character budget.
- Agent warm-start usefulness rating.

### Search And Retrieval

Inputs:

- User query, filters, confirmed/draft scope, source policies.

Outputs:

- Ranked Activity, Knowledge, Memory, Recommendation, or source results.

Quality requirements:

- Confirmed Memory should rank above draft Knowledge for stable fact queries.
- Results must show object type, source/time/project, status, and evidence.
- Search must work with FTS when vector search is disabled.
- Vector search must be rebuildable and delete sidecars when source data is deleted.
- Chinese search must work for common terms.

Metrics:

- Recall@k over fixture queries.
- MRR/NDCG over fixture relevance labels.
- FTS fallback coverage.
- Deletion/index cleanup correctness.

## AI Provider Evaluation

Provider evaluation must test:

- Disabled provider fallback.
- Mock provider determinism.
- OpenAI-compatible provider schema compliance.
- Timeout handling.
- Invalid JSON handling.
- Empty response handling.
- Evidence ID validation.
- Source policy filtering before request.
- Secret and failed-redaction exclusion.
- Audit logging.
- Target language adherence.

Connection tests must use synthetic prompts only and must not include real work context.

## Confidence Semantics

Confidence should mean "how strongly the available evidence supports this derived object", not how
fluent the generated text looks.

Suggested bands:

- `0.90-1.00`: direct evidence, strong source metadata, low ambiguity.
- `0.70-0.89`: source-backed with moderate inference.
- `0.50-0.69`: sparse or mixed evidence; useful but needs review.
- `<0.50`: should usually remain hidden or marked low confidence.

Confidence should decrease when:

- Evidence is sparse.
- Source data is redacted.
- Multiple projects or threads are mixed.
- External provider returned incomplete evidence IDs.
- Source policy blocked high-value context.

## Human Review Protocol

For dogfood or release evaluation, reviewers should score:

- Correctness.
- Evidence traceability.
- Usefulness.
- Concision.
- Privacy safety.
- Language quality.
- Actionability.

Use a 1-5 scale and record examples of:

- Unsupported claims.
- Missing important facts.
- Incorrect grouping.
- Bad Memory candidates.
- Noisy Recommendations.
- Privacy-policy confusion.
- Poor Chinese output.

## Release Thresholds

Before a complete-product release:

- Activity grouping pairwise F1 meets the release target on fixture corpus.
- Knowledge unsupported-claim count is below threshold.
- Memory duplicate rate is below threshold.
- Recommendation evidence coverage is 100%.
- Handoff unsafe inclusion count is 0.
- Redaction and source-policy tests pass.
- Chinese and mixed-language scenarios pass manual review.
- Deterministic fallback passes all core scenario tests without external AI.

Concrete numeric thresholds should be stored with the eval runner once fixture labels stabilize.

## Regression Rules

Any change to grouping, generation, provider prompts, redaction, ranking, or Handoff inclusion must:

- Run golden fixture evals.
- Report changed outputs.
- Explain intentional output changes.
- Preserve backward-compatible object schemas or add migrations.
- Preserve user review state where possible.
