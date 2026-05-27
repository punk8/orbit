# Activity Latest Capture Focus V2 Spec

Date: 2026-05-28

## Goal

Make every explicit real capture or import land on the generated Activity session and make the "newly captured/imported" evidence obvious inside the detail view.

## User Problem

The first focus pass navigates to the right Activity session. A normal user still has to infer which events and evidence came from the latest capture or import after they arrive, especially when the session already contained older events.

## Scope

- Carry focused `eventIds` and `sourceAdapterIds` from desktop action results into the Activity page.
- Highlight matching events and evidence references in the selected Activity detail.
- Show a compact focus summary with reason, focused event count, and source adapter count.
- Keep focus payload limited to IDs and adapter IDs.

## Non-Goals

- No continuous recording changes.
- No raw screenshot/OCR payload rendering.
- No new Activity persistence model.
- No automatic import/capture without explicit user action.

## Data Shape

Extend the renderer focus token to keep the existing action result metadata.

```ts
interface ActivityFocusTarget {
  sessionId: string;
  reason: DesktopActionFocus["reason"];
  eventIds: string[];
  sourceAdapterIds: string[];
}
```

App should pass ID-only payloads through:

```ts
function applyDesktopActionFocus(focus?: DesktopActionFocus) {
  if (focus?.page !== "activity" || !focus.activitySessionId) return;
  setActivityFocusTarget({
    sessionId: focus.activitySessionId,
    reason: focus.reason,
    eventIds: focus.eventIds ?? [],
    sourceAdapterIds: focus.sourceAdapterIds ?? []
  });
  setActivePage("activity");
}
```

Activity should clear filters, select the session, and store focus metadata:

```ts
const [latestFocus, setLatestFocus] = useState<ActivityFocusTarget | undefined>();

useEffect(() => {
  if (!focusTarget) return;
  const focused = sessions.find((session) => session.id === focusTarget.sessionId);
  if (!focused) return;
  setFilters(defaultFilters);
  setWorkbenchView("timeline");
  setSelectedId(focused.id);
  setLatestFocus(focusTarget);
  onFocusConsumed();
}, [focusTarget, sessions]);
```

## UI Behavior

The focus banner should include concrete counts:

```tsx
{latestFocus ? (
  <div className="notice-banner inline">
    <strong>{focusReasonLabel(latestFocus.reason)}</strong>
    <span>
      {t("activity.focusedEvents")}: {latestFocus.eventIds.length}
      {" · "}
      {t("activity.focusedSources")}: {latestFocus.sourceAdapterIds.length}
    </span>
  </div>
) : null}
```

Activity detail should receive the focus and mark matching rows:

```tsx
<ActivityDetail focusTarget={latestFocus} ... />

const focusedEventIds = new Set(focusTarget?.eventIds ?? []);

<article
  className={`event-row ${focusedEventIds.has(event.id) ? "focused-evidence" : ""}`}
  data-activity-focus={focusedEventIds.has(event.id) ? "event" : undefined}
>
```

Evidence references should use the same ID-only check:

```tsx
<EvidenceList
  evidence={session.evidence}
  limit={12}
  highlightedEventIds={focusTarget?.eventIds}
/>
```

## Privacy Boundaries

- Focus metadata contains IDs and adapter IDs only.
- No raw sidecar path, OCR text dump, screenshot path, terminal output, browser payload, or file content can be added to the focus object.
- Highlighting evidence uses existing redacted `EvidenceRef` display.

## Tests

- `ActivityPage.test.ts` checks `eventIds`, `sourceAdapterIds`, `activity.focusedEvents`, `activity.focusedSources`, and `highlightedEventIds`.
- `TodayPage.test.ts` / source import tests remain responsible for focus creation.
- `App` source checks ensure action focus preserves ID-only metadata.

## Acceptance

- After manual Screen/OCR capture, Activity opens the generated session and highlights the new event/evidence rows.
- After confirmed source import, Activity opens the generated session and shows import-focused counts.
- Filtering is cleared only for focus jumps.
- Commands: `pnpm typecheck`, `pnpm test`, `pnpm lint`, `pnpm --filter @orbit/desktop build`, `pnpm --filter @orbit/desktop package:dir`.
