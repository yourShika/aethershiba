// functions/housing/housingScheduler.ts

import type { Client } from 'discord.js';
import { configManager } from '../../handlers/configHandler';
import { HousingRequired } from '../../schemas/housing';
import { refreshHousing } from './housingRefresh';
import { logError } from '../../handlers/errorHandler.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { threadManager } from '../../lib/threadManager';
import { startTaskLoop } from '../../lib/taskLoop.js';
import { loadSchedules } from './housingScheduleStore.js';

// ---------------------------------------------------
// State Tracking
// ---------------------------------------------------

/**
 * Per-guild scheduler state.
 *  - last: timestamp of the last successful run
 *  - runs: how many runs completed today
 *  - day: current day (UTC string key)
 *  - running: true if a run is in progress
 */
type S = { last?: number; runs: number; day: string; running: boolean; completedSlots: Set<string> };

// Global in-memory state (per guild ID)
const state = new Map<string, S>();

// JSON file on disk for persisting state across restarts
const stateFile = path.join(
    process.cwd(), 
    'src', 
    'json', 
    'housing_scheduler_state.json'
);

// ---------------------------------------------------
// State Persistence
// ---------------------------------------------------

/**
 * Load scheduler state from disk into memory.
 * Called once at startup.
 */
async function loadState() {
    try {
        // read JSON file
        const raw = await readFile(stateFile, 'utf8');
        const obj = JSON.parse(raw) as Record<
            string,
            { last?: number; runs: number; day: string; completedSlots?: string[] }
        >;

        // Convert JSON records into in-memory objects
        for (const [gid, s] of Object.entries(obj)) {
            const st: S = {
                runs: s.runs,
                day: s.day,
                running: false,
                completedSlots: new Set(s.completedSlots ?? []),
            };
            if (typeof s.last === 'number') st.last = s.last;
            state.set(gid, st);
        }
    } catch {
        /* Ignore missing or invalid state files */
    }
}

/**
 * Save current in-memory scheduler state back to disk.
 */
async function saveState() {
    const obj: Record<string, { last?: number; runs: number; day: string; completedSlots: string[] }> = {};

    for (const [gid, s] of state) {
        const rec: { last?: number; runs: number; day: string; completedSlots: string[] } = {
            runs: s.runs,
            day: s.day,
            completedSlots: Array.from(s.completedSlots),
        };
        if (typeof s.last === 'number') rec.last = s.last;
        obj[gid] = rec;
    }

    try {
        await mkdir(path.dirname(stateFile), { recursive: true });
        await writeFile(stateFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
        logError('housing scheduler state save', err);
    }
}

// Load state immediately on module import
loadState();

/**
 * Generate a key representing "today" in UTC (YYYY-MM-DD).
 * @param d - Date
 * @returns Date in UTC String
 */
function dayKey(d = new Date()): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

/**
 * Convert a HH:MM slot string into a UTC timestamp for the provided day.
 * Slots are interpreted as UTC times by default.
 */
function slotTimestamp(slot: string, day: Date): number | null {
    const [h, m] = slot.split(':').map((v) => Number(v));
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h, m, 0, 0);
}

// ---------------------------------------------------
// Scheduler
// ---------------------------------------------------

/**
 * Start the housing scheduler.
 * 
 * Runs once per minute. For each guild:
 *  - Checks if housing is enabled and config is valid
 *  - Resets daily counters at midnight UTC.
 *  - Ensures minimum time gap between runs and run cap per day.
 *  - Avoids conflicts with other housing-related tasks by checking locks.
 *  - Calls 'refreshHousing' when conditions are met.
 * 
 * State (last run, run count) is persisted to disk.
 */
export function startHousingScheduler(client: Client) {
    startTaskLoop(async () => {
        const today = dayKey();
        const schedules = await loadSchedules();
        let changed = false;

        for (const [guildID] of client.guilds.cache) {
            try {
                const config = await configManager.get(guildID);
                const h = (config['housing'] as any) ?? null;
                if (!h?.enabled) continue;

                const req = HousingRequired.safeParse(h);
                if (!req.success) continue;

                const st = state.get(guildID) ?? {
                    runs: 0,
                    day: today,
                    running: false,
                    completedSlots: new Set<string>(),
                };

                if (!state.has(guildID)) {
                    state.set(guildID, st);
                    changed = true;
                }

                if (!st.completedSlots) {
                    st.completedSlots = new Set();
                }

                if (st.day !== today) {
                    st.runs = 0;
                    st.day = today;
                    st.completedSlots.clear();
                    changed = true;
                }

                if (st.running) continue;

                if (
                    threadManager.isLocked('housing:refresh', { guildId: guildID }) ||
                    threadManager.isLocked('housing:setup', { guildId: guildID }) ||
                    threadManager.isLocked('housing:reset', { guildId: guildID })
                ) continue;

                const schedule = schedules[guildID];
                const desiredSlots = ['x1', 'x2', 'x3'].slice(0, req.data.timesPerDay);
                const todayDate = new Date();
                const slotEntries = (schedule
                    ? desiredSlots
                        .map((key) => {
                            const value = (schedule as any)?.[key];
                            if (!value) return null;
                            const ts = slotTimestamp(value, todayDate);
                            return ts != null ? { key, ts } : null;
                        })
                        .filter((v): v is { key: string; ts: number } => Boolean(v))
                    : [])
                    .sort((a, b) => a.ts - b.ts);

                const now = Date.now();

                if (slotEntries.length === desiredSlots.length && slotEntries.length > 0) {
                    for (const slot of slotEntries) {
                        if (st.runs >= req.data.timesPerDay) break;
                        if (now < slot.ts) continue;
                        if (st.completedSlots.has(slot.key)) continue;

                        st.running = true;
                        try {
                            const res = await refreshHousing(client, guildID);
                            if (res) {
                                st.last = Date.now();
                                st.runs += 1;
                                st.completedSlots.add(slot.key);
                                changed = true;
                            }
                        } finally {
                            st.running = false;
                        }
                    }

                    continue;
                }

                if (st.completedSlots.size > 0) {
                    st.completedSlots.clear();
                    changed = true;
                }

                const minGap = (1440 / req.data.timesPerDay) * 60 * 1000;
                const gapOK = !st.last || now - st.last >= minGap;
                const capOK = st.runs < req.data.timesPerDay;

                if (gapOK && capOK) {
                    st.running = true;
                    try {
                        const res = await refreshHousing(client, guildID);
                        if (res) {
                            st.last = Date.now();
                            st.runs += 1;
                            changed = true;
                        }
                    } finally {
                        st.running = false;
                    }
                }
            } catch (err) {
                logError(`housing scheduler for guild ${guildID}`, err);
            }
        }

        if (changed) await saveState();
    }, { intervalMs: 60_000, jitterRatio: 0.1, immediate: true });
}

export async function clearHousingSchedulerState(guildId: string) {
    state.delete(guildId);
    await saveState();
}
