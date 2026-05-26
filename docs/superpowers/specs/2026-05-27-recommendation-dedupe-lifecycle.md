# Recommendation Dedupe And Action Lifecycle Spec

Date: 2026-05-27

## Goal

Keep Recommendations useful by preventing repeated advice from accumulating and by making each recommendation's action state explicit: new, accepted, snoozed, dismissed, or resolved.

## User Problem

As real Screen/OCR and source imports increase, repeated "review generated knowledge" and repeated perception follow-up suggestions can make Recommendations feel noisy. A user needs one current recommendation per underlying issue, with clear actions and a way to make it disappear until relevant again.

## Scope

- Stable dedupe keys for generated recommendations.
- Pipeline-level suppression/merge against existing open recommendations.
- Renderer filtering around active versus closed recommendations.
- Action lifecycle copy and button states.

## Non-Goals

- No external action execution.
- No automatic task creation.
- No schema migration in this checkpoint unless necessary; dedupe can be computed from existing fields and evidence.
- No remote notification system.

## Dedupe Model

Add a pure function in `@orbit/core`:

```ts
export function recommendationDedupeKey(recommendation: Recommendation): string {
  const evidenceScope = recommendation.evidence
    .map((ref) => ref.eventId ?? `${ref.sourceKind}:${ref.sourcePointer}`)
    .sort()
    .slice(0, 8)
    .join("|");
  return [
    recommendation.type,
    normalizeRecommendationText(recommendation.title),
    normalizeRecommendationText(recommendation.suggestedAction),
    evidenceScope || normalizeRecommendationText(recommendation.explanation)
  ].join("::");
}
```

For context-needed recommendations, use type plus active unreviewed source sessions instead of every artifact title.

```ts
function buildContextRecommendation(input) {
  const draftIds = input.artifacts
    .filter((artifact) => artifact.status === "draft")
    .map((artifact) => artifact.id)
    .sort();
  return {
    id: createStableId("recommendation", {
      type: "context_needed",
      drafts: draftIds.slice(0, 12)
    }),
    ...
  };
}
```

## Pipeline Suppression

Before inserting candidates, compare against existing open recommendations.

```ts
const existing = recommendationRepository.listRecommendations();
const existingByDedupeKey = new Map(
  existing
    .filter((item) => item.status === "new" || item.status === "accepted" || item.status === "snoozed")
    .map((item) => [recommendationDedupeKey(item), item])
);

for (const candidate of recommendationCandidates) {
  const duplicate = existingByDedupeKey.get(recommendationDedupeKey(candidate));
  if (duplicate) {
    recommendationRepository.upsertRecommendation(mergeRecommendation(duplicate, candidate));
    audit.log("recommendation.dedupe_merge", "recommendation", duplicate.id, {
      duplicateCandidateId: candidate.id,
      mergedEvidence: candidate.evidence.length
    });
    continue;
  }
  if (!recommendationRepository.getRecommendation(candidate.id)) {
    recommendationRepository.upsertRecommendation(candidate);
  }
}
```

Merge rule:

```ts
function mergeRecommendation(existing, candidate): Recommendation {
  return {
    ...existing,
    confidence: Math.max(existing.confidence, candidate.confidence),
    impact: maxImpact(existing.impact, candidate.impact),
    evidence: mergeEvidenceRefs(existing.evidence, candidate.evidence).slice(0, 12),
    dueAt: existing.status === "snoozed" ? existing.dueAt : candidate.dueAt ?? existing.dueAt
  };
}
```

Dismissed and resolved recommendations should not be reopened automatically unless the dedupe key changes because new evidence scope is materially different. That keeps user intent respected.

## Lifecycle Semantics

- `accept`: user acknowledges the suggestion and may act manually; no external side effect.
- `snooze`: hide from active list until `dueAt`.
- `dismiss`: user says not useful; do not reopen for the same dedupe key.
- `resolve`: user says the issue is done; do not show in active list.

Renderer active filter:

```ts
function isActiveRecommendation(item, now) {
  if (item.status === "dismissed" || item.status === "resolved") return false;
  if (item.status === "snoozed" && item.dueAt && item.dueAt > now.toISOString()) return false;
  return true;
}
```

## UI Requirements

- Default view shows active recommendations only.
- Add status segments: active, snoozed, closed, all.
- Detail action bar names the lifecycle result:
  - Accept: "接受建议（仅记录选择）"
  - Resolve: "标记完成"
  - Snooze: date picker + "稍后提醒"
  - Dismiss: "忽略此建议"
- Detail shows "不会自动执行外部操作" close to actions.
- List item shows evidence count and dedupe/merged hint when evidence has been merged.

## Privacy Boundaries

- Dedupe key must not include raw OCR text, screenshot path, raw local refs, or full terminal/browser payloads.
- Dedupe uses summaries, titles, suggested actions, source pointers, and event IDs only.
- Closed recommendations remain local audit history; they are not exported to Handoff as active next actions.

## Tests

- Core unit test for `recommendationDedupeKey`.
- DB semantic pipeline test verifies duplicate candidates merge into one open recommendation and audit `recommendation.dedupe_merge` is written.
- Governance test verifies snooze, accept, dismiss, resolve statuses.
- RecommendationsPage source test verifies active/snoozed/closed filters and lifecycle copy.

## Acceptance

- Re-running semantic pipeline on the same source data does not increase active recommendation count.
- A snoozed recommendation disappears from active view until due.
- Dismissed/resolved recommendations stay out of Handoff next actions.
- Commands: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm --filter @orbit/desktop build`.
