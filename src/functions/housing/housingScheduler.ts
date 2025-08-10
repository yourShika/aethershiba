import type { Client } from 'discord.js';
import { configManager } from '../../lib/config/configHandler';
import { HousingRequired } from '../../lib/config/schemas/housing';
import { runHousingCheckt } from './housingRunner';
import { logError } from '../../lib/errorHandler.js';

type S = { last?: number; runs: number; day: string};
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

                const st = state.get(guildID) ?? { runs: 0, day: today };
                if (st.day !== today) {
                    st.runs = 0;
                    st.day = today;
                }

                const minGap = req.data.intervalMinutes * 60 * 1000;
                const now = Date.now();
                const gapOK = !st.last || now - st.last >= minGap;
                const capOK = st.runs < req.data.timesPerDay;

                if (gapOK && capOK) {
                    await runHousingCheckt(client, guildID);
                    st.last = now;
                    st.runs += 1;
                    state.set(guildID, st);
                }
            } catch (err) {
                logError(`housing scheduler for guild ${guildID}`, err);
            }
        }
    }, 60_000);
}
