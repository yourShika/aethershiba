// lib/taskLoop.ts
// ---------------------------------------------------
// Generic task loop helper with jitter/backoff support
// ---------------------------------------------------

export type TaskLoopOptions = {
  /** Base interval between runs in milliseconds. */
  intervalMs: number;
  /**
   * Jitter ratio (0-1). A value of 0.1 means each delay will be adjusted
   * by a random amount between -10% and +10% of the base interval.
   */
  jitterRatio?: number;
  /** Whether to execute the task immediately on start. */
  immediate?: boolean;
};

export type TaskLoopController = {
  /** Stop scheduling future runs. */
  stop: () => void;
};

/**
 * Start a self-scheduling asynchronous loop.
 * Ensures only one run executes at a time and applies optional jitter
 * to avoid synchronized spikes across guilds.
 */
export function startTaskLoop(task: () => Promise<void> | void, options: TaskLoopOptions): TaskLoopController {
  const { intervalMs, jitterRatio = 0, immediate = false } = options;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let running = false;

  const scheduleNext = () => {
    if (stopped) return;

    const jitterWindow = Math.max(0, Math.min(1, jitterRatio)) * intervalMs;
    const delta = jitterWindow ? Math.random() * jitterWindow * 2 - jitterWindow : 0;
    const delay = Math.max(10, intervalMs + delta);

    timer = setTimeout(async () => {
      if (running) return scheduleNext();
      running = true;
      try {
        await task();
      } finally {
        running = false;
        scheduleNext();
      }
    }, delay);
  };

  const stop = () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  if (immediate) {
    (async () => {
      running = true;
      try {
        await task();
      } finally {
        running = false;
        scheduleNext();
      }
    })();
  } else {
    scheduleNext();
  }

  return { stop };
}
