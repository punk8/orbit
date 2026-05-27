# Knowledge And Review Queue Workbench V2 Spec

Date: 2026-05-28

## Goal

Make the Review Queue feel like a queue: after confirm, reject, or archive, the user gets immediate local feedback and can continue with the next visible item without losing review context.

## User Problem

The first workbench pass made evidence and open/edit actions available. It still behaves like a static list after actions. A normal user needs a clear "what just happened" signal and a predictable next item, especially when processing several Knowledge drafts or Memory candidates.

## Scope

- Add UI-only last-action feedback for Knowledge and Memory review cards.
- Track the last reviewed item and action in Review Queue state.
- Keep evidence expansion local and source-pointer only.
- Preserve existing audit-backed review actions.

## Non-Goals

- No new Memory detail page redesign.
- No external task creation.
- No automatic confirmation of derived Memory from confirmed Knowledge beyond existing governance code.
- No raw evidence preview.

## Interaction Model

Review Queue keeps a local status object:

```ts
type ReviewQueueLastAction = {
  id: string;
  kind: "knowledge" | "memory";
  action: KnowledgeReviewAction | MemoryReviewAction;
};

const [lastAction, setLastAction] = useState<ReviewQueueLastAction | undefined>();
```

Actions wrap the existing callbacks:

```ts
async function reviewKnowledge(id: string, action: KnowledgeReviewAction) {
  await onReviewKnowledge(id, action);
  setLastAction({ id, kind: "knowledge", action });
  setExpandedEvidenceIds((current) => without(current, id));
}

async function reviewMemory(id: string, action: MemoryReviewAction) {
  await onReviewMemory(id, action);
  setLastAction({ id, kind: "memory", action });
  setExpandedEvidenceIds((current) => without(current, id));
}
```

The queue renders a feedback strip near the top:

```tsx
{lastAction ? (
  <div className="notice-banner inline" data-review-feedback="last-action">
    {t("review.lastActionPrefix")}
    {reviewKindLabel(lastAction.kind)}
    {t(`review.action.${lastAction.action}`)}
  </div>
) : null}
```

## UI Requirements

- Review Queue shows total pending Knowledge drafts and Memory candidates near the top.
- Each card keeps the existing metrics: confidence, evidence count, source session count, sensitivity.
- Action buttons call wrapped handlers, not raw props, so the user sees feedback.
- Evidence expansion closes after action to reduce visual noise.
- Open in Knowledge remains available for draft Knowledge.

## Privacy Boundaries

- Feedback contains object kind and action only; no private content.
- Evidence expansion still uses `EvidenceList` and does not render raw local refs or raw OCR payloads.
- Review actions update local lifecycle state and audit logs only.

## Tests

- `ReviewQueuePage.test.ts` checks last-action feedback state, wrapped review handlers, pending counts, evidence close helper, and existing evidence expansion.
- Existing governance tests continue verifying persisted lifecycle changes and audit entries.

## Acceptance

- From Review Queue, expand evidence on a draft, confirm it, and see feedback indicating the local action was recorded.
- Rejecting or archiving a card gives the same feedback and collapses its evidence expansion.
- No external side effects occur.
- Commands: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm --filter @orbit/desktop build`, `pnpm --filter @orbit/desktop package:dir`.
