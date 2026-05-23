import { describe, expect, it } from "vitest";
import type { DesktopActionResult, DesktopSnapshot } from "../src/orbitApi";
import { runScreenOcrAutoCaptureTick } from "./screenOcrAutoWorker";

describe("screen OCR auto worker", () => {
  it("automatically triggers a screen/OCR burst while dogfood runtime is observing", async () => {
    let captures = 0;

    const result = await runScreenOcrAutoCaptureTick({
      readSnapshot: () => snapshot("observing"),
      captureBurst: async () => {
        captures += 1;
        return actionResult(snapshot("observing"));
      }
    });

    expect(result.status).toBe("captured");
    expect(captures).toBe(1);
  });

  it("does not trigger capture when runtime is paused or stopped", async () => {
    let captures = 0;

    const paused = await runScreenOcrAutoCaptureTick({
      readSnapshot: () => snapshot("paused_user"),
      captureBurst: async () => {
        captures += 1;
        return actionResult(snapshot("paused_user"));
      }
    });
    const stopped = await runScreenOcrAutoCaptureTick({
      readSnapshot: () => snapshot("stopped"),
      captureBurst: async () => {
        captures += 1;
        return actionResult(snapshot("stopped"));
      }
    });

    expect(paused.status).toBe("skipped");
    expect(paused.reason).toBe("runtime_not_observing");
    expect(stopped.status).toBe("skipped");
    expect(stopped.reason).toBe("runtime_not_observing");
    expect(captures).toBe(0);
  });

  it("does not trigger capture while global collection is paused", async () => {
    let captures = 0;

    const result = await runScreenOcrAutoCaptureTick({
      readSnapshot: () => snapshot("observing", { collectionPaused: true }),
      captureBurst: async () => {
        captures += 1;
        return actionResult(snapshot("observing"));
      }
    });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("collection_paused");
    expect(captures).toBe(0);
  });
});

function snapshot(
  state: DesktopSnapshot["perception"]["dogfoodRuntime"]["state"],
  runtime: Partial<DesktopSnapshot["runtime"]> = {}
): DesktopSnapshot {
  return {
    runtime: {
      collectionPaused: false,
      ...runtime
    },
    perception: {
      dogfoodRuntime: {
        state
      }
    }
  } as DesktopSnapshot;
}

function actionResult(snapshotValue: DesktopSnapshot): DesktopActionResult {
  return {
    snapshot: snapshotValue,
    message: "captured"
  };
}
