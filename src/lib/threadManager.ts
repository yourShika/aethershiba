export interface ThreadOptions {
  /** Discord guild ID to scope locks. */
  guildId?: string;
  /** Allow multiple instances of the same task to run concurrently. */
  allowParallel?: boolean;
  /** Other task names that must not run at the same time. */
  blockWith?: string[];
}

export class ThreadManager {
  private queues = new Map<string, Promise<void>>();

  private async exec<T>(keys: string[], fn: () => Promise<T>): Promise<T> {
    const arr = [...keys].sort();

    const wait: Promise<void>[] = [];
    const releases: (() => void)[] = [];
    const chains: Promise<void>[] = [];

    for (const key of arr) {
      const prev = this.queues.get(key) ?? Promise.resolve();
      let release: () => void;
      const next = new Promise<void>(res => { release = res; });
      const chain = prev.then(() => next);
      this.queues.set(key, chain);
      wait.push(prev);
      releases.push(release!);
      chains.push(chain);
    }

    await Promise.all(wait);

    try {
      return await fn();
    } finally {
      for (let i = 0; i < arr.length; i++) {
        const key = arr[i]!;
        const release = releases[i]!;
        const chain = chains[i]!;
        release();
        chain
          .then(() => {
            if (this.queues.get(key) === chain) {
              this.queues.delete(key);
            }
          })
          .catch(() => {
            this.queues.delete(key);
          });
      }
    }
  }

  /**
   * Run a named task with optional constraints.
   *
   * `task`      - Unique name of the task.
   * `opts.guildId` - Scope the lock per guild when provided.
   * `opts.allowParallel` - Whether multiple instances of this task may run simultaneously.
   * `opts.blockWith` - Other task names that cannot run in parallel with this one.
   */
  async run<T>(task: string, fn: () => Promise<T>, opts: ThreadOptions = {}): Promise<T> {
    const { guildId, allowParallel = false, blockWith = [] } = opts;

    const keyOf = (name: string) => (guildId ? `${name}:${guildId}` : name);

    const keys = new Set<string>();
    if (!allowParallel) keys.add(keyOf(task));
    for (const other of blockWith) keys.add(keyOf(other));

    return this.exec([...keys], fn);
  }

  isLocked(task: string, opts: ThreadOptions = {}): boolean {
    const { guildId } = opts;
    const key = guildId ? `${task}:${guildId}` : task;
    return this.queues.has(key);
  }
}

export const threadManager = new ThreadManager();
