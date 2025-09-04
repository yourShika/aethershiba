import type { Client } from 'discord.js';
import { configManager } from '../../handlers/configHandler';
import { HousingRequired } from '../../schemas/housing';
import { refreshHousing } from './housingRefresh';
import { logError } from '../../handlers/errorHandler.js';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type S = { last?: number; runs: number; day: string; running: boolean };
const state = new Map<string, S>();
const stateFile = path.join(process.cwd(), 'src', 'json', 'housing_scheduler_state.json');

async function loadState() {
    try {
        const raw = await readFile(stateFile, 'utf8');
        const obj = JSON.parse(raw) as Record<string, { last?: number; runs: number; day: string }>;
        for (const [gid, s] of Object.entries(obj)) {
            const st: S = { runs: s.runs, day: s.day, running: false };
            if (typeof s.last === 'number') st.last = s.last;
            state.set(gid, st);
        }
    } catch {
        /* ignore */
    }
}

async function saveState() {
    const obj: Record<string, { last?: number; runs: number; day: string }> = {};
    for (const [gid, s] of state) {
        const rec: { last?: number; runs: number; day: string } = { runs: s.runs, day: s.day };
        if (typeof s.last === 'number') rec.last = s.last;
        obj[gid] = rec;
    }
    try {
        await writeFile(stateFile, JSON.stringify(obj, null, 2), 'utf8');
    } catch (err) {
        logError('housing scheduler state save', err);
    }
}

loadState();

function dayKey(d = new Date()): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

export function startHousingScheduler(client: Client) {
    setInterval(async () => {
        const today = dayKey();
        let changed = false;

        for (const [guildID] of client.guilds.cache) {
            try {
                const config = await configManager.get(guildID);
                const h = (config['housing'] as any) ?? null;
                if (!h?.enabled) continue;
                const req = HousingRequired.safeParse(h);
                if (!req.success) continue;

                const st = state.get(guildID) ?? { runs: 0, day: today, running: false };
                if (st.day !== today) {
                    st.runs = 0;
                    st.day = today;
                    changed = true;
                }

                if (st.running) continue;

                const minGap = req.data.intervalMinutes * 60 * 1000;
                const now = Date.now();
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
                    state.set(guildID, st);
                }
            } catch (err) {
                logError(`housing scheduler for guild ${guildID}`, err);
            }
        }

        if (changed) await saveState();
    }, 60_000);
}
