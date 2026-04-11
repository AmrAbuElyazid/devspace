import { app } from "electron";
import type {
  MainProcessMetricSnapshot,
  MainProcessPerformanceSnapshot,
  PerformanceTimingStat,
} from "../shared/performance";

type MutableTimingStat = {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
};

type AppMetricLike = {
  pid?: number;
  type?: string;
  creationTime?: number;
  serviceName?: string;
  name?: string;
  cpu?: {
    percentCPUUsage?: number;
    idleWakeupsPerSecond?: number;
  };
  memory?: {
    workingSetSize?: number;
    peakWorkingSetSize?: number;
    privateBytes?: number;
    sharedBytes?: number;
  };
};

const mainProcessOperationStats = new Map<string, MutableTimingStat>();

function toTimingStat(stat: MutableTimingStat): PerformanceTimingStat {
  return {
    count: stat.count,
    totalDurationMs: stat.totalDurationMs,
    avgDurationMs: stat.count === 0 ? 0 : stat.totalDurationMs / stat.count,
    maxDurationMs: stat.maxDurationMs,
    lastDurationMs: stat.lastDurationMs,
  };
}

function recordMainProcessDuration(name: string, durationMs: number): void {
  const current = mainProcessOperationStats.get(name);
  if (current) {
    current.count++;
    current.totalDurationMs += durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
    current.lastDurationMs = durationMs;
    return;
  }

  mainProcessOperationStats.set(name, {
    count: 1,
    totalDurationMs: durationMs,
    maxDurationMs: durationMs,
    lastDurationMs: durationMs,
  });
}

function snapshotOperations(): Record<string, PerformanceTimingStat> {
  const entries = [...mainProcessOperationStats.entries()].toSorted(([a], [b]) =>
    a.localeCompare(b),
  );
  return Object.fromEntries(entries.map(([name, stat]) => [name, toTimingStat(stat)]));
}

function readAppMetrics(): MainProcessMetricSnapshot[] {
  const electronApp = app as { getAppMetrics?: () => unknown[] } | undefined;
  const getAppMetrics = electronApp?.getAppMetrics;
  if (typeof getAppMetrics !== "function") {
    return [];
  }

  try {
    const metrics = getAppMetrics.call(electronApp) as AppMetricLike[];
    return metrics.map((metric) => ({
      pid: typeof metric.pid === "number" ? metric.pid : null,
      type: typeof metric.type === "string" ? metric.type : "unknown",
      creationTime: typeof metric.creationTime === "number" ? metric.creationTime : null,
      name:
        typeof metric.name === "string"
          ? metric.name
          : typeof metric.serviceName === "string"
            ? metric.serviceName
            : null,
      cpu: {
        percentCPUUsage:
          typeof metric.cpu?.percentCPUUsage === "number" ? metric.cpu.percentCPUUsage : 0,
        idleWakeupsPerSecond:
          typeof metric.cpu?.idleWakeupsPerSecond === "number"
            ? metric.cpu.idleWakeupsPerSecond
            : 0,
      },
      memory: {
        workingSetSize:
          typeof metric.memory?.workingSetSize === "number" ? metric.memory.workingSetSize : null,
        peakWorkingSetSize:
          typeof metric.memory?.peakWorkingSetSize === "number"
            ? metric.memory.peakWorkingSetSize
            : null,
        privateBytes:
          typeof metric.memory?.privateBytes === "number" ? metric.memory.privateBytes : null,
        sharedBytes:
          typeof metric.memory?.sharedBytes === "number" ? metric.memory.sharedBytes : null,
      },
    }));
  } catch {
    return [];
  }
}

export function measureMainProcessOperation<T>(name: string, work: () => T): T {
  const startedAt = performance.now();

  try {
    return work();
  } finally {
    recordMainProcessDuration(name, performance.now() - startedAt);
  }
}

export function resetMainProcessPerformanceCounters(): void {
  mainProcessOperationStats.clear();
}

export function getMainProcessPerformanceSnapshot(): MainProcessPerformanceSnapshot {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();

  return {
    sampledAt: Date.now(),
    process: {
      memory: {
        rss: memory.rss,
        heapTotal: memory.heapTotal,
        heapUsed: memory.heapUsed,
        external: memory.external,
        arrayBuffers: memory.arrayBuffers,
      },
      cpu: {
        user: cpu.user,
        system: cpu.system,
      },
    },
    appMetrics: readAppMetrics(),
    operations: snapshotOperations(),
  };
}
