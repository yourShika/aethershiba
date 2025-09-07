// lib/threadManager.ts

// ---------------------------------------------------
// Options for running tasks through the ThreadManager
// ---------------------------------------------------
export interface ThreadOptions {
  /** Discord guild ID to scope locks (isolation per guild). */
  guildId?: string;
  /** If true, allow multiple instances of the same task to run concurrently. */
  allowParallel?: boolean;
  /** Other task names that must not run at the same time as this one. */
  blockWith?: string[];
}

// ---------------------------------------------------
// ThreadManager: cooperative async task scheduler
// ---------------------------------------------------
export class ThreadManager {
  // Map of active locks (task keys) -> promise chains
  private queues = new Map<string, Promise<void>>();

  /**
   * Internal execution wrapper that:
   * - Acquires locks for all relevant keys.
   * - Waits for previous tasks with the same keys to finish.
   * - runs the given async function.
   * - Releases locks afterwards.
   * 
   */
  private async exec<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
    
    // Normalize key order to avoid deadlocks (consistent lock ordering)
    const arr = [...keys].sort();

    // Arrays to track waiters and releases
    const wait: Promise<void>[] = [];
    const releases: (() => void)[] = [];
    const chains: Promise<void>[] = [];

    // For each key, chain onto its existing queue
    for (const key of arr) {
      const prev = this.queues.get(key) ?? Promise.resolve();
      let release: () => void;

      // 'next' will resolve once our task is finished and we call 'release'
      const next = new Promise<void>(res => { release = res; });

      // 'chain' = previous task -> then ours
      const chain = prev.then(() => next);

      // Store chain for this key
      this.queues.set(key, chain);

      wait.push(prev);          // Wait for previous task to finish
      releases.push(release!);  // Keep release handle for later
      chains.push(chain);       // Keep reference to remove stable locks
    }

    // Wait for all previous tasks on these keys to complete
    await Promise.all(wait);

    try {
      // Run the provided async function
      return await fn();
    } finally {
      // Release locks for all keys when done
      for (let i = 0; i < arr.length; i++) {

        const key = arr[i]!;
        const release = releases[i]!;
        const chain = chains[i]!;

        // Signal that our task is done
        release();

        // Clean-up queue entry once fully resolved
        chain
          .then(() => {
            if (this.queues.get(key) === chain) {
              this.queues.delete(key);
            }
          })
          .catch(() => {
            // On error, also ensure cleanup
            this.queues.delete(key);
          });
      }
    }
  }

  /**
   * Run a named task with optional constraints.
   * 
   * @param task - Unique task name.
   * @param fn - The async function to execute
   * @param opts - Control how this task is locked relative to others.
   *
   * `task`      - Unique name of the task.
   * `opts.guildId` - Scope the lock per guild when provided.
   * `opts.allowParallel` - Whether multiple instances of this task may run simultaneously.
   * `opts.blockWith` - Other task names that cannot run in parallel with this one.
   */
  async run<T>(task: string, fn: () => Promise<T>, opts: ThreadOptions = {}): Promise<T> {
    const { guildId, allowParallel = false, blockWith = [] } = opts;

    // Helper to produce key, optionally scoped to guild
    const keyOf = (name: string) => (guildId ? `${name}:${guildId}` : name);

    // Build set of keys that must be locked
    const keys = new Set<string>();
    if (!allowParallel) keys.add(keyOf(task));              // Lock task itself unless parallel allowed
    for (const other of blockWith) keys.add(keyOf(other));  // Lock any conflicting tasks

    // Execute with locks
    return this.exec([...keys], fn);
  }

  /**
   * Check if a given task is currently locked.
   * 
   * @param task - Task name.
   * @param opts - Optional guild scope.
   * @returns true if locked, false otherwise.
   */
  isLocked(task: string, opts: ThreadOptions = {}): boolean {
    const { guildId } = opts;
    const key = guildId ? `${task}:${guildId}` : task;
    return this.queues.has(key);
  }
}

// Export a singleton instance for use throughout the app
export const threadManager = new ThreadManager();
