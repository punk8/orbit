import {
  createStableId,
  defaultProtectedAppRules,
  DESKTOP_OBSERVATION_ADAPTER_ID,
  type ObservationInput,
  type ObservationStatus
} from "@orbit/core";
import { DesktopObservationAdapter, InProcessObservationQueue } from "@orbit/adapters";
import {
  AuditRepository,
  EventRepository,
  openOrbitDatabase,
  reindexLocalDataWithProvider,
  SettingsRepository,
  SourceRepository
} from "@orbit/db";
import {
  readObservationStatusForDesktop,
  upsertDesktopObservationSourceForDesktop,
  writeObservationStatusForDesktop,
  writeObservationStatusToSettings
} from "../data";
import { Tier1MacObserver } from "./tier1MacObserver";

export interface DesktopObservationServiceOptions {
  notifyChanged(): void;
}

export class DesktopObservationService {
  private observer: Tier1MacObserver | undefined;
  private queue = new InProcessObservationQueue({
    adapterId: DESKTOP_OBSERVATION_ADAPTER_ID
  });
  private draining = false;

  constructor(private readonly options: DesktopObservationServiceOptions) {}

  get queueDepth(): number {
    return this.queue.depth;
  }

  async restoreFromSettings(): Promise<void> {
    const status = readObservationStatusForDesktop(this.queue.depth);
    if (status.enabled && !status.paused) {
      await this.start();
    }
  }

  async start(): Promise<void> {
    if (this.observer) return;
    upsertDesktopObservationSourceForDesktop();
    const startedAt = new Date().toISOString();
    const runtimeSessionId = createStableId("obs_runtime", { startedAt });
    this.queue = new InProcessObservationQueue({
      adapterId: DESKTOP_OBSERVATION_ADAPTER_ID
    });
    writeObservationStatusForDesktop("collecting", {
      enabled: true,
      paused: false,
      lastStartedAt: startedAt,
      lastError: ""
    });
    this.audit("observation.start", { runtimeSessionId, mode: "tier1_macos" });

    const observer = new Tier1MacObserver({ runtimeSessionId });
    try {
      observer.start(
        (input) => {
          this.enqueue(input);
        },
        (warning) => {
          this.recordWarning(warning);
        },
        (code, signal) => {
          if (this.observer === observer) {
            this.observer = undefined;
            const message = `macOS observer exited with code ${code ?? "null"} signal ${
              signal ?? "none"
            }`;
            this.recordWarning(message);
          }
        }
      );
      this.observer = observer;
      this.options.notifyChanged();
    } catch (error) {
      writeObservationStatusForDesktop("error", {
        enabled: true,
        paused: false,
        lastError: formatUnknownError(error)
      });
      this.audit("observation.start_failed", { message: formatUnknownError(error) });
      this.options.notifyChanged();
      throw error;
    }
  }

  pause(): void {
    this.observer?.stop();
    this.observer = undefined;
    this.queue.pause();
    writeObservationStatusForDesktop("paused", {
      enabled: true,
      paused: true
    });
    this.audit("observation.pause", {});
    this.options.notifyChanged();
  }

  async resume(): Promise<void> {
    this.queue.resume();
    writeObservationStatusForDesktop("ready", {
      enabled: true,
      paused: false,
      lastError: ""
    });
    this.audit("observation.resume", {});
    await this.start();
  }

  stop(): void {
    this.observer?.stop();
    this.observer = undefined;
    this.queue.clear();
    writeObservationStatusForDesktop("disabled", {
      enabled: false,
      paused: false,
      lastStoppedAt: new Date().toISOString(),
      lastError: ""
    });
    this.audit("observation.stop", {});
    this.options.notifyChanged();
  }

  private enqueue(input: ObservationInput): void {
    this.queue.enqueue(input);
    void this.drainQueue();
  }

  private async drainQueue(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    const database = openOrbitDatabase();
    try {
      const settings = new SettingsRepository(database.db);
      const sourceRepository = new SourceRepository(database.db);
      const eventRepository = new EventRepository(database.db);
      const auditRepository = new AuditRepository(database.db);
      const protectedApps =
        settings.get<ObservationStatus["protectedApps"]>("observation.protectedApps") ??
        defaultProtectedAppRules();
      sourceRepository.upsertFromAdapter(
        new DesktopObservationAdapter({
          inputs: [],
          id: DESKTOP_OBSERVATION_ADAPTER_ID,
          protectedApps
        })
      );
      const result = await this.queue.drain(eventRepository, 25);
      sourceRepository.recordSyncSuccess(DESKTOP_OBSERVATION_ADAPTER_ID, {
        lastEventAt: result.lastEventAt
      });
      if (result.inserted > 0) {
        await reindexLocalDataWithProvider(database, {});
      }
      writeObservationStatusToSettings(settings, "collecting", {
        enabled: true,
        paused: false,
        ...(result.lastEventAt ? { lastEventAt: result.lastEventAt } : {}),
        lastError: ""
      });
      auditRepository.log("observation.drain", "source", DESKTOP_OBSERVATION_ADAPTER_ID, {
        read: result.read,
        inserted: result.inserted,
        skipped: result.skipped,
        dropped: result.dropped,
        warnings: result.warnings
      });
      settings.set("observation.queueDepth", this.queue.depth);
    } finally {
      database.close();
      this.draining = false;
      this.options.notifyChanged();
    }
  }

  private recordWarning(message: string): void {
    writeObservationStatusForDesktop("warning", {
      enabled: true,
      paused: false,
      lastError: message
    });
    this.audit("observation.warning", { message });
    this.options.notifyChanged();
  }

  private audit(operation: string, details: Record<string, unknown>): void {
    const database = openOrbitDatabase();
    try {
      new AuditRepository(database.db).log(operation, "runtime", undefined, details);
    } finally {
      database.close();
    }
  }
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
