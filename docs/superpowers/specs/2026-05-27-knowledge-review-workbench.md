# Knowledge And Review Queue Workbench Spec

Date: 2026-05-27

## Goal

Make Knowledge and Review Queue behave like one review workflow: users can inspect evidence, edit the summary, preview Markdown, confirm, reject, or archive, then continue to the next item without hunting through pages.

## User Problem

Knowledge detail already has many useful pieces, but the Review Queue is too thin and Knowledge editing is separated from the evidence and Markdown preview. A normal user needs to know: "What did Orbit infer, what evidence supports it, what will be saved or excluded, and what is the next action?"

## Scope

- Knowledge artifact detail workbench polish.
- Review Queue knowledge draft cards and memory candidate cards.
- Cross-navigation from Review Queue to Knowledge/Memory detail where possible.
- Inline evidence expansion for review cards.
- Editing and Markdown preview remain local to the selected Knowledge artifact until saved.

## Non-Goals

- No new AI generation provider requirement.
- No automatic Memory confirmation from Knowledge confirmation beyond the existing candidate generation rules.
- No raw evidence preview.
- No complete Memory page redesign in this checkpoint.

## Workbench Model

Introduce a UI-only review item view model in the renderer.

```ts
interface ReviewQueueItemView {
  id: string;
  kind: "knowledge" | "memory";
  title: string;
  status: ReviewStatus;
  confidence: number;
  sensitivity: Sensitivity;
  evidenceCount: number;
  sourceSessionCount: number;
  summary: string;
  evidence: EvidenceRef[];
  updatedAt: string;
}
```

Build it from existing snapshot objects.

```ts
function buildKnowledgeReviewItem(artifact: KnowledgeArtifact): ReviewQueueItemView {
  return {
    id: artifact.id,
    kind: "knowledge",
    title: artifact.title,
    status: artifact.status,
    confidence: artifact.confidence,
    sensitivity: maxEvidenceSensitivity(artifact.evidence),
    evidenceCount: artifact.evidence.length,
    sourceSessionCount: artifact.metadata.sourceSessionIds.length,
    summary: artifact.content.description,
    evidence: artifact.evidence,
    updatedAt: artifact.updatedAt
  };
}
```

## Review Queue Interaction

Each card should show:

- Title, status, confidence, evidence count, source session count, sensitivity.
- Summary.
- Collapsed evidence strip with "展开证据".
- Actions: confirm, reject, archive, edit/open.

Pseudo-flow:

```tsx
function ReviewQueueCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article>
      <ReviewItemHeader item={item} />
      <p>{item.summary}</p>
      <ReviewItemMetrics item={item} />
      <button onClick={() => setExpanded(!expanded)}>
        {expanded ? t("review.hideEvidence") : t("review.showEvidence")}
      </button>
      {expanded ? <EvidenceList evidence={item.evidence} limit={8} /> : null}
      <ReviewActions item={item} />
    </article>
  );
}
```

After an action:

```ts
async function reviewAndAdvance(item, action) {
  await review(item.id, action);
  setLastReviewed({ id: item.id, action });
  selectNextVisibleItem(item.id);
}
```

## Knowledge Detail Interaction

Knowledge detail should prioritize:

1. Editable summary sections.
2. Markdown preview.
3. Evidence/source sessions.
4. Governance metadata.

Editing uses a two-pane layout when active:

```tsx
{isEditing ? (
  <div className="knowledge-edit-workbench">
    <KnowledgeEditFields form={editForm} onChange={setEditForm} />
    <section>
      <h3>{t("knowledge.markdownPreview")}</h3>
      <pre>{editForm.markdown}</pre>
      <EvidenceList evidence={artifact.evidence} limit={8} />
    </section>
  </div>
) : (
  <KnowledgeReadOnlyWorkbench artifact={artifact} />
)}
```

Save remains explicit. Confirm/reject/archive should show clear status and keep the selected item visible until the refreshed list removes it by filter.

## Cross-Navigation

App should carry optional page focus targets:

```ts
type PageFocus =
  | { page: "knowledge"; id: string }
  | { page: "memory"; id: string }
  | { page: "activity"; id: string };
```

Review Queue "编辑" or "打开" calls:

```ts
onOpenKnowledge(artifact.id);
// App: setActivePage("knowledge"); setKnowledgeFocusId(artifact.id)
```

KnowledgePage consumes `focusArtifactId` similarly to Activity.

## Privacy Boundaries

- Evidence expansion uses existing `EvidenceList`; no local raw refs or raw OCR text are rendered.
- Draft Knowledge remains draft until confirmed; Handoff default filtering remains unchanged.
- Reject/archive only changes local lifecycle state and audit logs; no external side effects.

## Tests

- ReviewQueue source test verifies evidence expansion, confidence, sensitivity, source session count, and open/edit action hooks.
- KnowledgePage source test verifies edit pane keeps Markdown preview and evidence visible together.
- App source test verifies Review Queue can navigate to Knowledge with a focus id.
- Existing governance tests continue verifying confirm/reject/archive audit.

## Acceptance

- From Review Queue, expand evidence on a Knowledge draft and confirm it.
- From Review Queue, open/edit a Knowledge draft, edit Markdown, preview the edited Markdown, save, then confirm.
- Reject/archive actions remove noise from active review lists and remain auditable.
- Commands: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm --filter @orbit/desktop build`.
