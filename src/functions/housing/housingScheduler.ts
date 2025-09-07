// functions/housing/housingScheduler.ts

import type { Client } from 'discord.js';
import { configManager } from '../../handlers/configHandler';
import { HousingRequired } from '../../schemas/housing';
import { refreshHousing } from './housingRefresh';
import { logError } from '../../handlers/errorHandler.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { threadManager } from '../../lib/threadManager';

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
type S = { last?: number; runs: number; day: string; running: boolean };

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
            { last?: number; runs: number; day: string }
        >;

        // Convert JSON records into in-memory objects
        for (const [gid, s] of Object.entries(obj)) {
            const st: S = { runs: s.runs, day: s.day, running: false };
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
    const obj: Record<string, { last?: number; runs: number; day: string }> = {};

    for (const [gid, s] of state) {
        const rec: { last?: number; runs: number; day: string } = { runs: s.runs, day: s.day };
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
    setInterval(async () => {
        const today = dayKey();
        let changed = false; // track if state changed to trigger saving

        // Iterate all guilds the bot is in
        for (const [guildID] of client.guilds.cache) {
            try {
                // Get guild config
                const config = await configManager.get(guildID);
                const h = (config['housing'] as any) ?? null;

                // Skip if housing not enabled
                if (!h?.enabled) continue;

                // Validate config against required schema
                const req = HousingRequired.safeParse(h);
                if (!req.success) continue;

                // Load or initialize state for this guild
                const st = state.get(guildID) ?? { runs: 0, day: today, running: false };
                
                // Reset counters if day has changed
                if (st.day !== today) {
                    st.runs = 0;
                    st.day = today;
                    changed = true;
                }

                // Skip if a run is already in progress
                if (st.running) continue;

                // Skip if other housing-related tasks are locked
                if (
                    threadManager.isLocked('housing:refresh', { guildId: guildID }) ||
                    threadManager.isLocked('housing:setup', { guildId: guildID }) ||
                    threadManager.isLocked('housing:reset', { guildId: guildID }) 
                ) continue;

                // Compute minimum gap in ms between runs (based on timesPerDay)
                const minGap = (1440 / req.data.timesPerDay) * 60 * 1000;
                const now = Date.now();

                // Check spacing and daily cap conditions
                const gapOK = !st.last || now - st.last >= minGap;
                const capOK = st.runs < req.data.timesPerDay;

                // If allowed -> run refresh
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
                    state.set(guildID, st);
                }
            } catch (err) {
                logError(`housing scheduler for guild ${guildID}`, err);
            }
        }

        // Persist state changes if necessary
        if (changed) await saveState();
    }, 60_000); // Run every 60 seconds
}
