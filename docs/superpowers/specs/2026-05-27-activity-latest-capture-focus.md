# Activity Latest Capture Focus Spec

Date: 2026-05-27

## Goal

After a user explicitly captures current Screen/OCR context, Orbit should take them directly to the Activity session created or updated by that capture. The user should not have to search the historical timeline to find the newest real capture.

## User Problem

Today the capture action refreshes the snapshot and shows a notice, but Activity keeps whichever historical session was selected. A normal user has no reliable way to know which session was just created, especially when the timeline contains older Codex/local-agent imports and perception sessions.

## Scope

- Manual one-shot `captureScreenOcr` from Today, Activity, Sources, and Settings permission entry points.
- Manual and timer Screen/OCR burst can use the same focus payload when a new Activity session exists.
- Renderer page navigation to Activity only when the action result explicitly asks for it.
- Activity rail selection, detail loading, and no-results filter behavior.

## Non-Goals

- No continuous recording changes.
- No raw screenshot or OCR payload export.
- No broad timeline redesign beyond focus and visible capture status.
- No automatic capture without explicit user action or enabled scheduler.

## Data And API Shape

Extend desktop action results with an optional focus hint.

```ts
export interface DesktopActionFocus {
  page: "activity" | "knowledge" | "review" | "recommendations" | "handoff";
  activitySessionId?: string;
  eventIds?: string[];
  sourceAdapterIds?: string[];
  reason: "manual_capture" | "source_import" | "review_action" | "recommendation_action";
}

export interface DesktopActionResult {
  snapshot: DesktopSnapshot;
  message: string;
  exportPath?: string;
  warnings?: string[];
  focus?: DesktopActionFocus;
}
```

For Screen/OCR capture, Electron computes the focus session after reindexing:

```ts
const insertedEventIds = collectInsertedEventIds(results, insertedBoundaryEvent);
const snapshot = readDesktopSnapshot();
const focusedSession = findFocusedActivitySession(snapshot.activitySessions, insertedEventIds, {
  runtimeSessionId: capture.frame.runtimeSessionId,
  capturedAt: capture.frame.capturedAt
});

return {
  snapshot,
  warnings,
  message,
  focus: focusedSession
    ? {
        page: "activity",
        activitySessionId: focusedSession.id,
        eventIds: insertedEventIds,
        sourceAdapterIds: adapters.map((adapter) => adapter.id),
        reason: "manual_capture"
      }
    : undefined
};
```

The focus resolver should prefer exact event membership, then matching thread/runtime session, then the newest perception-backed session overlapping the capture timestamp.

```ts
function findFocusedActivitySession(sessions, eventIds, fallback): ActivitySession | undefined {
  const eventIdSet = new Set(eventIds);
  return (
    sessions.find((session) => session.eventIds.some((id) => eventIdSet.has(id))) ??
    sessions.find((session) => session.evidence.some((ref) => ref.eventId && eventIdSet.has(ref.eventId))) ??
    sessions.find((session) => session.eventIds.includes(fallback.runtimeSessionId)) ??
    newestSessionNearTime(sessions, fallback.capturedAt, ["screen", "ocr", "vision"])
  );
}
```

## Renderer Flow

App owns the cross-page focus token.

```ts
const [activityFocus, setActivityFocus] = useState<ActivityFocusTarget | undefined>();

async function captureScreenOcr() {
  await runDesktopAction(async () => {
    const result = await window.orbit.captureScreenOcr();
    applyFocus(result.focus);
    return result;
  }, t("error.perceptionCapture"));
}

function applyFocus(focus?: DesktopActionFocus) {
  if (focus?.page === "activity" && focus.activitySessionId) {
    setActivePage("activity");
    setActivityFocus({
      sessionId: focus.activitySessionId,
      eventIds: focus.eventIds ?? [],
      createdAt: Date.now()
    });
  }
}
```

Activity consumes focus without letting filters hide it.

```ts
useEffect(() => {
  if (!focusSessionId) return;
  const target = sessions.find((session) => session.id === focusSessionId);
  if (!target) return;
  setFilters(defaultFilters);
  setWorkbenchView("timeline");
  setSelectedId(target.id);
  onFocusConsumed();
}, [focusSessionId, sessions]);
```

## UI Requirements

- When capture succeeds and focus exists, App navigates to Activity.
- The selected Activity rail item is the new/updated session.
- Activity shows a small inline focus banner such as "已定位到刚捕获的工作现场".
- If capture creates events but no session can be resolved, keep current page and show the existing notice plus warning.
- If a user had active filters, focus clears filters only for the capture jump; normal manual selection preserves filters.

## Privacy Boundaries

- Focus payload may contain IDs and source adapter IDs only; no OCR text, raw local refs, screenshot paths, or sensitive excerpts.
- Handoff policy remains unchanged: raw perception payloads stay excluded unless future explicit policy says otherwise.
- Capture remains explicit and one-shot unless the user has separately enabled a visible runtime.

## Tests

- API type/source-string test verifies `DesktopActionResult` includes `focus`.
- Electron data test verifies a capture/import result can carry `focus.page === "activity"` and an Activity session id without raw refs.
- Activity source test verifies `focusSessionId`, `onFocusConsumed`, filter reset, and focused selection logic exist.
- App source test verifies capture applies focus by navigating to Activity.

## Acceptance

- Manual: click "捕获屏幕 / OCR" from Today and land on the newly created Activity session.
- Manual: click the same action from Activity while an old session is selected; selection changes to the latest capture.
- Commands: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm --filter @orbit/desktop build`.
- If packaged smoke is run: `pnpm --filter @orbit/desktop package:dir` and verify no raw private artifacts are packaged.
