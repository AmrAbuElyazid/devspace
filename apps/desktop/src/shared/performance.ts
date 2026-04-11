export interface PerformanceTimingStat {
  count: number;
  totalDurationMs: number;
  avgDurationMs: number;
  maxDurationMs: number;
  lastDurationMs: number;
}

export interface MainProcessMetricSnapshot {
  pid: number | null;
  type: string;
  creationTime: number | null;
  name: string | null;
  cpu: {
    percentCPUUsage: number;
    idleWakeupsPerSecond: number;
  };
  memory: {
    workingSetSize: number | null;
    peakWorkingSetSize: number | null;
    privateBytes: number | null;
    sharedBytes: number | null;
  };
}

export interface MainProcessPerformanceSnapshot {
  sampledAt: number;
  process: {
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
      arrayBuffers: number;
    };
    cpu: {
      user: number;
      system: number;
    };
  };
  appMetrics: MainProcessMetricSnapshot[];
  operations: Record<string, PerformanceTimingStat>;
}
