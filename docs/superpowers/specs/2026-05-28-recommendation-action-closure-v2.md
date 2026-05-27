# Recommendation Action Closure V2 Spec

Date: 2026-05-28

## Goal

Make Recommendations quieter after user action by showing closure feedback, exposing merged-evidence context, and keeping lifecycle filters predictable.

## User Problem

Dedupe and lifecycle status exist, but users still need to know whether a recommendation is a fresh item or an accumulated one, and what happened after they accept, snooze, dismiss, or resolve it.

## Scope

- Add UI-only action feedback after recommendation review actions.
- Display a merged-evidence hint when a recommendation has more than one evidence reference.
- Ensure action feedback reinforces that no external side effect was executed.
- Keep active / snoozed / closed / all queue behavior.

## Non-Goals

- No external task creation.
- No notifications.
- No schema migration for persisted dedupe keys.
- No raw browser/terminal/screen payload in dedupe display.

## Interaction Model

Recommendations page tracks the last local lifecycle action:

```ts
type LastRecommendationAction = {
  id: string;
  action: RecommendationReviewAction;
};

const [lastAction, setLastAction] = useState<LastRecommendationAction | undefined>();

async function reviewRecommendation(recommendation, action) {
  await onReviewRecommendation(recommendation.id, action, options);
  setLastAction({ id: recommendation.id, action });
  setRefreshToken((current) => current + 1);
}
```

Feedback renders above the workbench:

```tsx
{lastAction ? (
  <div className="notice-banner inline" data-recommendation-feedback="last-action">
    {t("recommendation.lastActionPrefix")}
    {recommendationActionLabel(lastAction.action)}
    {t("recommendation.acceptRecordsOnly")}
  </div>
) : null}
```

Merged evidence hint:

```tsx
function mergedEvidenceHint(recommendation) {
  if (recommendation.evidence.length <= 1) return undefined;
  return t("recommendation.mergedEvidenceHint");
}
```

## UI Requirements

- List item shows evidence count and merged-evidence hint when applicable.
- Detail page repeats the hint near the evidence section.
- Action feedback appears after accept, snooze, dismiss, or resolve.
- Closed items remain available in the closed/all queue but not the active queue.

## Privacy Boundaries

- Merged-evidence hint is count-based only.
- Dedupe display must not show raw OCR text, screenshot paths, terminal output, full URLs beyond existing redacted source pointers, or file contents.
- Lifecycle actions stay local and audit-backed.

## Tests

- `RecommendationsPage.test.ts` checks `lastAction`, `recommendation.lastActionPrefix`, `recommendation.mergedEvidenceHint`, and `data-recommendation-feedback`.
- Existing core/db tests continue verifying dedupe merge and closed duplicate suppression.

## Acceptance

- Acting on a recommendation shows local feedback and does not call any external side-effect path.
- Recommendations with merged evidence explain that repeated signals are consolidated.
- Active queue remains quiet after dismiss/resolve or future snooze.
- Commands: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm --filter @orbit/desktop build`, `pnpm --filter @orbit/desktop package:dir`.
