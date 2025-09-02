import type { Client } from 'discord.js';
import { configManager } from '../../handlers/configHandler';
import { HousingRequired } from '../../schemas/housing';
import { refreshHousing } from './housingRefresh';
import { logError } from '../../handlers/errorHandler.js';

type S = { last?: number; runs: number; day: string; running: boolean };
const state = new Map<string, S>();

function dayKey(d = new Date()): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

export function startHousingScheduler(client: Client) {
    setInterval(async () => {
        const today = dayKey();

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
                }

                if (st.running) continue;

                const minGap = req.data.intervalMinutes * 60 * 1000;
                const now = Date.now();
                const gapOK = !st.last || now - st.last >= minGap;
                const capOK = st.runs < req.data.timesPerDay;

                if (gapOK && capOK) {
                    st.running = true;
                    try {
                        await refreshHousing(client, guildID);
                        st.last = Date.now();
                        st.runs += 1;
                    } finally {
                        st.running = false;
                    }
                    state.set(guildID, st);
                }
            } catch (err) {
                logError(`housing scheduler for guild ${guildID}`, err);
            }
        }
    }, 60_000);
}
